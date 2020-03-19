/* jshint globalstrict: true */
/* jshint browser: true */
/* jshint devel: true */
/* jshint jquery: true */
/* global util */
'use strict';

var pbft = {};

(function() {

/* Begin PBFT algorithm logic */

// Number of servers participating in PBFT.
var NUM_SERVERS = 5;
// Number of clients whose requests are serviced.
var NUM_CLIENTS = 1;
// This is 'f' described in the paper, i.e., the number of Byzantine (arbitrary)
// failures that the algorithm can progress correctly with.
var NUM_TOLERATED_BYZANTINE_FAULTS = 1;

//2f
var MINIMAL_APPROVE = Math.floor((NUM_SERVERS-1)/3);

// Public variable, indicating how many nodes to draw.
pbft.NUM_NODES = NUM_SERVERS + NUM_CLIENTS;

// Messages have a latency randomly selected in the range
// [MIN_RPC_LATENCY, MAX_RPC_LATENCY]
var MIN_RPC_LATENCY = 18000;
var MAX_RPC_LATENCY = 22000;
// View change timeouts are randomly selected in the range
// [VIEW_CHANGE_TIMEOUT, 2 * VIEW_CHANGE_TIMEOUT].
var VIEW_CHANGE_TIMEOUT = 80000;

//client multicast timer default
var CLIENT_MULTICAST_TIMER = 300000;

const NODE_STATE = {
  /* Prefix with pbft to avoid collision with other algorithms
   * that use the same names for CSS classes. */
  PRIMARY: 'pbft_primary',
  BACKUP: 'pbft_backup',
  CHANGING_VIEW: 'pbft_changing_view',
  CRASHED: 'pbft_crashed',
  CLIENT: 'pbft_client',
  UNKNOWN: 'pbft_unknown'
}

const MESSAGE_TYPE = {
  CLIENT_REQUEST: 'client_request_msg',
  PRE_PREPARE: 'pre_prepare_msg',
  PREPARE: 'prepare_msg',
  COMMIT: 'commit_msg',
  CLIENT_REPLY: 'client_reply_msg',
  VIEW_CHANGE: 'view_change_msg',
  NEW_VIEW: 'new_view_msg',
  CHECKPOINT: 'checkpoint_msg'
}

/**
 * Translate ID in range [1, NUM_SERVERS] to initial server state.
 * Backups participate in PBFT; clients make requests to the backups.
 *      | ---- backups ---- | ---- clients ---- |
 *      0              NUM_SERVERS          NUM_NODES
 */
var serverIdToState = function (id) {
  if (0 <= id && id < NUM_SERVERS) {
    return NODE_STATE.BACKUP;
  }

  if (id < pbft.NUM_NODES) {
    return NODE_STATE.CLIENT;
  }

  return NODE_STATE.UNKNOWN;
}


var sendMessage = function(model, message) {
  message.sendTime = model.time;
  message.recvTime = (message.from == message.to) ? model.time + 1000 :
                     model.time + MIN_RPC_LATENCY +
                     Math.random() * (MAX_RPC_LATENCY - MIN_RPC_LATENCY);
  model.messages.push(message);
};

var sendRequest = function(model, request) {
  request.direction = 'request';
  sendMessage(model, request);
};

var rules = {};
pbft.rules = rules;

var makeViewChangeAlarm = function(now) {
  return now + (Math.random() + 1) * VIEW_CHANGE_TIMEOUT;
};

/**
 * Make an array, containing arrays for for each peer. This is useful when
 * tracking a queue of things happening for each peer (e.g. broadcasting a
 * message).
 */
var makePeerArrays = function() {
  return util.makeArrayOfArrays(pbft.NUM_NODES);
}

// Public API.
pbft.server = function(id, peers) {
  return {
    /* id ranges from `0` to `NUM_NODES - 1`. server.id represents "i"
     * when the paper refers to message formats. */
    id: id,

    /* peers is an array holding IDs of all peer servers, including itself.
     * These range from `0` to `NUM_NODES - 1`. */
    peers: peers,

    state: serverIdToState(id),

    /* Holds the last sequence number used in a message sent out from this server. */
    lastUsedSequenceNumber: -1,

    /* Contains committed messages. */
    log: [],

    /* Describes the view that the server is in, as described in the paper. */
    view: 0,

    /* The next time that the server will time out and begin a view change.
     * Set to infinity means no timeout. */
    viewChangeAlarm: util.Inf,

    /* Record of the highest valid view change reques this server has received,
     * to ensure views are monotonically increasing. */
    highestViewChangeReceived: 0,

    /* The attempt number of the next view change. Used to calculate the next view
     * that this server should try to move towards (allowing skipping past up to f
     * malicious servers that block the view change). */
    viewChangeAttempt: 1,

    /* TODO: need to add a "key" to verify authenticity of the server. */
    //key: "k." + id,

    /* Client request messages get pushed to queuedClientRequests. This is a
     * FIFO queue of requests that the client has sent to this server, that this
     * server either needs to start the pre-prepare phase for (if it is primary),
     * or is waiting for the request to be committed (if it is a backup), and
     * will time out and start a view change if the requesdt is not committed in
     * time. */
    queuedClientRequests: [],

    /* After reading from queuedClientRequests, a primary queues copies of the client
     * message to send as pre-prepares to servers in clientMessagesToSend. This stores
     * the messages indexed first by the server's view number, and then by its peers'
     * IDs. */
    clientMessagesToSend: {},

    /* Record of the peers that this server has sent prePrepare requests to, for a
     * particular (v, n) combination (view, sequence number). This is needed so that
     * the server sends the prePrepare to its peers only once. */
    prePrepareRequestsSent: {},

    /* The pre-prepare requests received and accepted as valid at this server. */
    acceptedPrePrepares: {},

    /* Record of the peers that this server has sent prepare requests to, for a
     * particular (v, n) combination. This is needed so that the server sends the
     * prepares to its peers only once. */
    sentPrepareRequests: {},

    /* The prepare requests that this server has received and accepted. */
    acceptedPrepares: {},

    /* After reading from acceptedPrepares, the server queues commit messages
     * to send to each peer for each accepted prepare message, for all (v, n)
     * combinations. */
    preparedMessagesToCommit: {},

    /* Record of the peers that this server has sent commit requests to, for a
     * particular (v, n) combination. This is needed so that the server sends
     * commits to its peers only once. */
    sentCommitRequests: {},

    /* The commit requests that this server has received and accepted. */
    receivedCommitRequests: {},

    /* Record of the messages that this server has considered committed and
     * pushed to its log. Needed so that the server pushes messages for a
     * given (n, v) combination to its log only once. */
    pushedLogMessages: {},

    /* Record of the view change requests that this server has sent to its
     * peers for a given view. This is needed so that the server sends view
     * change requests to another view only once. */
    viewChangeRequestsSent: {},

    /* The valid view change requests that this server has received. */
    viewChangeRequestsReceived: {},

    /* Record of the new view requests that this server has sent to its
     * peers for a given view. This is needed so that the server (which is
     * becoming primary and sending the newView request) sends new view
     * requests to its peers only once. */
    newViewRequestsSent: {},

    /* TODO: for use in the complete version of view change logic.
     * (see the TODO in the sendViewChange function. */
    // prePreparedMessageProofs: {},
    // checkpointProof: {},

    //fields for client
    LatestPrime: 0,
    clientMulticastTimer: util.Inf,
    clientRequestTimestamp: -1,
    clientReplyCount: 0,
  };
};

var updateHighestViewChangeReceived = function(server, v) {
  server.highestViewChangeReceived = (v > server.highestViewChangeReceived) ?
    v : server.highestViewChangeReceived;
}

var getLatestCheckpointSequenceNumber = function(server) {
  // TODO
  return 0;
}

rules.startPrePrepare = function(model, server) {
  server.clientMessagesToSend[server.view] = server.clientMessagesToSend[server.view] || makePeerArrays();

  if ((server.id == (server.view % NUM_SERVERS)) &&
      (server.queuedClientRequests.length !== 0)) {

    /* Increment the sequence number every time we start a new pre-prepare
     * request. This ensures a unique sequence number for requests
     * made in the same view, so total ordering can be realized. */
    server.lastUsedSequenceNumber += 1;

    /* Extract the request from the queue the client sent the request to. */
    var request = server.queuedClientRequests.shift();
    /* Queue the messages to be sent to other servers (see where this is read in
     * sendPrePrepare). */
    server.clientMessagesToSend[server.view].forEach(function(peerMessageQueue) {
      peerMessageQueue.push(request);
    });
  }
};

// Makes message digest a bit more realistic and fancier.
var hashCode = function(m) {
  var hash = 0;
  if (m.length == 0) return hash;
  for (var i = 0; i < m.length; i++) {
      char = m.charCodeAt(i);
      hash = ((hash<<5)-hash)+char;
      hash = hash & hash; // Convert to 32bit integer
  }
  return hash;
}

rules.sendPrePrepare = function(model, server, peer) {
  server.clientMessagesToSend[server.view] = server.clientMessagesToSend[server.view] || makePeerArrays();
  server.prePrepareRequestsSent[server.view] = server.prePrepareRequestsSent[server.view] || {};
  server.prePrepareRequestsSent[server.view][server.lastUsedSequenceNumber]
    = server.prePrepareRequestsSent[server.view][server.lastUsedSequenceNumber] || makePeerArrays();

  if ((server.id == (server.view % NUM_SERVERS)) &&
      (server.clientMessagesToSend[server.view][peer].length !== 0) &&
      (server.prePrepareRequestsSent[server.view][server.lastUsedSequenceNumber][peer].length === 0)) {
    var message = server.clientMessagesToSend[server.view][peer][0];
    var request = {
      from: server.id,
      to: peer,
      type: MESSAGE_TYPE.PRE_PREPARE,
      v: server.view,
      n: server.lastUsedSequenceNumber,
      /* Digest of the message which is part of the validation on receiver. */
      d: hashCode(message),
      /* The message content is sent at the same time as the pre-prepare. */
      m: message,
    };
    server.prePrepareRequestsSent[server.view][server.lastUsedSequenceNumber][peer].push(request);
    server.clientMessagesToSend[server.view][peer].shift();
    sendRequest(model, request);
  }
};

var handlePrePrepareRequest = function(model, server, request) {
  server.acceptedPrePrepares[request.v] = server.acceptedPrePrepares[request.v] || {};
  server.acceptedPrePrepares[request.v][request.n] = server.acceptedPrePrepares[request.v][request.n] || [];

  // Signature check before pushing the pre-prepare message.
  if (request.d !== hashCode(request.m)) {
    console.log(`Preprepare request ${request} rejected due to wrong digest. 
                Expecting: ${hashCode(request.m)}; Got: ${request.d}.`);
    return;
  }

  server.acceptedPrePrepares[request.v][request.n].push(request);
};

rules.sendPrepares = function(model, server, peer) {
  server.acceptedPrePrepares[server.view] = server.acceptedPrePrepares[server.view] || {};
  server.sentPrepareRequests[server.view] = server.sentPrepareRequests[server.view] || {};

  for (let [n, requests] of Object.entries(server.acceptedPrePrepares[server.view])) {
    server.sentPrepareRequests[server.view][n] = server.sentPrepareRequests[server.view][n] || makePeerArrays();

    /* Check that only one pre-prepare was ever sent. */
    console.assert(requests.length <= 1);

    if ((requests.length === 1) &&
        (server.sentPrepareRequests[server.view][n][peer].length === 0) &&
        (peer != server.id) && /* Don't sent prepares to self. */
        (!(server.view % NUM_SERVERS == server.id)) /* Primary does not send prepares. */
       ) {

      /* We should only be preparing a message that was pre-prepared in the same view. */
      console.assert(server.view === requests[0].v);

      var request = {
        from: server.id,
        to: peer,
        type: MESSAGE_TYPE.PREPARE,
        v: server.view,
        n: n,
        d: requests[0].d, // Use the pre-prepare message's digest.
      };
      sendRequest(model, request);
      server.sentPrepareRequests[server.view][n][peer].push(request);
    }
  }
};

// Returns the latest client message server has received
// in a preprepare request given the view number and
// sequence number. Returns null if it never got any.
var extractLatestMessage = function(server, v, n) {
  // First two conditions are sanity checks.
  if (!(v in server.acceptedPrePrepares) ||
      !(n in server.acceptedPrePrepares[v]) ||
      !(0 in server.acceptedPrePrepares[v][n])) {
    return null;
  }
  return server.acceptedPrePrepares[v][n][0].m;
}

var handlePrepareRequest = function(model, server, request) {
  server.acceptedPrepares[request.v] = server.acceptedPrepares[request.v] || {};
  server.acceptedPrepares[request.v][request.n] = server.acceptedPrepares[request.v][request.n] || makePeerArrays();

  // Signature check before pushing the prepare message.
  var msg = extractLatestMessage(server, request.v, request.n);
  if (msg === null) {
    console.log("Server received prepare request without any preprepared messages.");
    return;
  }
  if (request.d !== hashCode(msg)) {
    console.log(`Prepare request ${request} rejected due to wrong digest. 
                Expecting: ${hashCode(msg)}; Got: ${request.d}.`);
    return;
  }

  server.acceptedPrepares[request.v][request.n][request.from].push(request);
};

/**
 * Helper function to get the number of unique peers that received a message
 * of type PREPARE.
 */
var getUniqueNumPrepareRequestsReceived = function(peerPrepareRequests) {
  if (peerPrepareRequests == undefined) {
    return 0;
  }
  var count = 0;
  peerPrepareRequests.forEach(function(peerRequestQueue) {
    if (peerRequestQueue.length !== 0 &&
      peerRequestQueue[0].type == MESSAGE_TYPE.PREPARE) {
      count += 1;
    }
  }, count);
  return count;
};

rules.startCommit = function(model, server) {
  server.preparedMessagesToCommit[server.view] = server.preparedMessagesToCommit[server.view] || {};
  server.acceptedPrepares[server.view] = server.acceptedPrepares[server.view] || {};

  for (let [n, requests] of Object.entries(server.acceptedPrepares[server.view])) {
    server.preparedMessagesToCommit[server.view][n] = server.preparedMessagesToCommit[server.view][n] || [];

    /* The below condition checks the "prepared" predicate mentioned in the
     * paper. Note that only 2f PREPAREs are required, because servers do not
     * send PREPARE messages to themselves (and so have already implicitly
     * counted one prepare message, or have sent a PRE-PREPARE with matching
     * view and sequence number in the case of the primary). */
    if ((getUniqueNumPrepareRequestsReceived(requests) >=
        (2 * NUM_TOLERATED_BYZANTINE_FAULTS)) &&
        (server.preparedMessagesToCommit[server.view][n].length == 0)) {
      var requestToCommit = getFirstRequest(requests)[0];
      server.preparedMessagesToCommit[server.view][n].push(requestToCommit);
    }
  }
};

rules.sendCommits = function(model, server, peer) {
  server.preparedMessagesToCommit[server.view] = server.preparedMessagesToCommit[server.view] || {};
  server.sentCommitRequests[server.view] = server.sentCommitRequests[server.view] || {};
  for (let [n, requests] of Object.entries(server.preparedMessagesToCommit[server.view])) {
    console.assert(requests.length <= 1);
    server.sentCommitRequests[server.view][n] = server.sentCommitRequests[server.view][n] || makePeerArrays();
    if ((requests.length === 1) &&
        (server.sentCommitRequests[server.view][n][peer].length === 0)
       ) {
      var request = {
        from: server.id,
        to: peer,
        type: MESSAGE_TYPE.COMMIT,
        v: server.view,
        n: n,
        d: hashCode(extractLatestMessage(server, server.view, n)), // Recompute digest.
      };
      /* Sequence number of the request must match the sequence numbeer we
       * are indexing the `preparedMessagesToCommit` object by. */
      console.assert(n == request.n);
      sendRequest(model, request);
      server.sentCommitRequests[server.view][n][peer].push(request);
    }
  }
};

var handleCommitRequest = function(model, server, request) {
  server.receivedCommitRequests[request.v] = server.receivedCommitRequests[request.v] || {};
  server.receivedCommitRequests[request.v][request.n] = server.receivedCommitRequests[request.v][request.n] || makePeerArrays();

  // Signature check before pushing the commit request.
  var msg = extractLatestMessage(server, request.v, request.n);
  if (msg === null) {
    console.log("Server received commit request without any preprepared messages.");
    return;
  }
  if (request.d !== hashCode(msg)) {
    console.log(`Commit request ${request} rejected due to wrong digest. 
                Expecting: ${hashCode(msg)}; Got: ${request.d}.`);
    return;
  }

  server.receivedCommitRequests[request.v][request.n][request.from].push(request);
};

/**
 * Helper function to get the number of unique peers that received a message
 * of type COMMIT.
 */
var getUniqueNumCommitRequestsReceived = function(peerCommitRequests) {
  if (peerCommitRequests == undefined) {
    return 0;
  }
  var count = 0;
  peerCommitRequests.forEach(function(peerRequestQueue) {
    if (peerRequestQueue.length !== 0 &&
      peerRequestQueue[0].type == MESSAGE_TYPE.COMMIT) {
      count += 1;
    }
  }, count);
  return count;
};

/**
 * Helper function to return the first array of request queues that has
 * received a request.
 */
var getFirstRequest = function(requestQueues) {
  for (var i = 0; i < requestQueues.length; i++) {
    if (requestQueues[i].length !== 0) {
      return requestQueues[i];
    }
  }
  return null;
}

rules.addCommitsToLog = function(model, server) {
  server.receivedCommitRequests[server.view] = server.receivedCommitRequests[server.view] || {};
  server.pushedLogMessages[server.view] = server.pushedLogMessages[server.view] || {};

  Object.keys(server.receivedCommitRequests[server.view]).forEach(function(n) {

    server.receivedCommitRequests[server.view][n] = server.receivedCommitRequests[server.view][n] || makePeerArrays();
    server.pushedLogMessages[server.view][n] = server.pushedLogMessages[server.view][n] || [];

    if ((getUniqueNumCommitRequestsReceived(server.receivedCommitRequests[server.view][n]) >=
         (2 * NUM_TOLERATED_BYZANTINE_FAULTS) + 1) &&
        (server.pushedLogMessages[server.view][n].length == 0)) {
      var rq = getFirstRequest(server.receivedCommitRequests[server.view][n])[0];

      var m = undefined;
      for (let [n, requests] of Object.entries(server.acceptedPrePrepares[server.view])) {
        if (n == rq.n && requests[0].v == rq.v) {
          m = requests[0].m;
          break;
        }
      }

      /* If the request was satisfied, remove it from queuedClientRequests. If
       * there are no more requests, we can remove the timeout, or reset the
       * timeout if there are still requests to process. */
      for (var i = 0; i < server.queuedClientRequests.length; i++) {
        if (server.queuedClientRequests[i] == m) {
          server.queuedClientRequests.splice(i, 1);
          if (server.queuedClientRequests.length == 0) {
            server.viewChangeAlarm = util.Inf;
          } else {
            server.viewChangeAlarm = makeViewChangeAlarm(model.time);
          }
        }
      }
      /* The primary checks for the original request in its
       * acceptedPrePrepares (it already dequeued the client request
       * from queuedClientRequests). */
      if ((server.id % NUM_SERVERS) == server.view) {
        for (let [n, requests] of Object.entries(server.acceptedPrePrepares[server.view])) {
          if (n == rq.n && requests[0].v == rq.v) {
            if (server.queuedClientRequests.length == 0) {
              server.viewChangeAlarm = util.Inf;
            } else {
              server.viewChangeAlarm = makeViewChangeAlarm(model.time);
            }
            break;
          }
        }
      }

      /* Right now, this can happen if say a pre-prepare message from the new
       * primary made it to a peer, before the new-view message. In this case,
       * the peer won't have accepted the pre-prepare  in the same view. */
      if (m === undefined) {
        console.warn("server " + server.id + "missed pre-prepare for message with view " + rq.v + " and sequence number " + rq.n);
      }

      var msg = "(" + rq.v + "," + rq.n + "," + m + ")";
      server.log.push(msg);
      server.pushedLogMessages[server.view][n].push(msg);
    }
  });
};

rules.sendClientReply = function(model, server, peer) {
  // TODO
}

rules.startViewChangeTimeout = function(model, server) {
  /* If we're currently trying to change the view, and we've received one
   * valid view change request from every peer, we start the timeout again,
   * until we receive a valid new view request from the new primary. */
  if ((server.state == NODE_STATE.CHANGING_VIEW) &&
      (getUniqueNumViewChangeRequestsReceived(
         server.viewChangeRequestsReceived[server.view +
                                           server.viewChangeAttempt]
       ) >= ((2 * NUM_TOLERATED_BYZANTINE_FAULTS) + 1)) &&
      /* Only reset the timeout if it wasn't already running. This prevents
       * repeatedly restarting over and over. */
      (server.viewChangeAlarm === util.Inf)) {
    server.viewChangeAlarm = makeViewChangeAlarm(model.time);
  }
};

/**
 * Check if server that had set a view change alarm timed out,
 * and if so, begin a new view change. */
rules.startNewViewChange = function(model, server) {

  if (server.state == NODE_STATE.CRASHED) {
    return;
  }

  if (server.viewChangeAlarm <= model.time) {

    if (server.state == NODE_STATE.CHANGING_VIEW) {
      /* Increasing the attempt number means that if we failed to move to the
       * next view, we can try again to move to the next view after that. */
      server.viewChangeAttempt += 1;
    }

    /* As mentioned in the paper, if a server decided to start a view change, the
     * timeout is stopped until 2f+1 view change requests are received, and
     * restarted once 2f+1 view change requests are received. */
    server.viewChangeAlarm = util.Inf;

    /* We must change the state to CHANGING_VIEW so that a server trying to
     * move to the next view does not respond to messages other than
     * VIEW-CHANGE, NEW-VIEW, or CHECKPOINT. */
    server.state = NODE_STATE.CHANGING_VIEW;
  }
};

rules.sendViewChange = function(model, server, peer) {

  var nextView = server.view + server.viewChangeAttempt;
  server.viewChangeRequestsSent[nextView] = server.viewChangeRequestsSent[nextView] || makePeerArrays();
  if (server.state == NODE_STATE.CHANGING_VIEW &&
      server.viewChangeRequestsSent[nextView][peer].length == 0) {

    /* TODO(rfairley): Must compute C and P  and attach these to the view
     *  change request (the set of committed but not checkpointed requests
     *  this server has processed, and the set of prepared but not
     *  committed requests this server has a record of). */

    var message = {
      from: server.id,
      to: peer,
      type: MESSAGE_TYPE.VIEW_CHANGE,
      v: nextView,
      n: getLatestCheckpointSequenceNumber(server),
      C: server.checkpointProof, /* TODO: see above */
      P: server.prePreparedMessageProofs, /* TODO: see above */
    };
    server.viewChangeRequestsSent[nextView][peer].push(message);
    sendRequest(model, message);
  }
};

var handleViewChangeRequest = function(model, server, request) {
  server.viewChangeRequestsReceived[request.v] = server.viewChangeRequestsReceived[request.v] || makePeerArrays();
  server.viewChangeRequestsReceived[request.v][request.from].push(request);
  updateHighestViewChangeReceived(server, request.v);
};

/**
 * Helper function to get the number of unique peers that received a message
 * of type VIEW_CHANGE.
 */
var getUniqueNumViewChangeRequestsReceived = function(peerViewChangeRequests) {
  if (peerViewChangeRequests == undefined) {
    return 0;
  }
  var count = 0;
  peerViewChangeRequests.forEach(function(requests) {
    if (requests.length !== 0 &&
        requests[0].type == MESSAGE_TYPE.VIEW_CHANGE) {
      count += 1;
    }
  }, count);
  return count;
};

rules.sendNewView = function(model, server, peer) {
  server.newViewRequestsSent[server.highestViewChangeReceived] = server.newViewRequestsSent[server.highestViewChangeReceived] || makePeerArrays();

  if ((getUniqueNumViewChangeRequestsReceived(
         server.viewChangeRequestsReceived[server.highestViewChangeReceived]
       ) >= (2 * NUM_TOLERATED_BYZANTINE_FAULTS + 1)) &&
      (server.id == (server.highestViewChangeReceived % NUM_SERVERS)) &&
      (server.newViewRequestsSent[server.highestViewChangeReceived][peer].length === 0)) {

    var message = {
      from: server.id,
      to: peer,
      type: MESSAGE_TYPE.NEW_VIEW,
      v: server.highestViewChangeReceived,
      V: server.viewChangeRequests
    };
    sendRequest(model, message);

    server.view = server.highestViewChangeReceived;
    /* Even though this node is going to be PRIMARY next, we first set it to
     * BACKUP so that the becomePrimary function is the only function that
     * can set nodes to a PRIMARY state. */
    server.state = NODE_STATE.BACKUP;
    server.newViewRequestsSent[server.highestViewChangeReceived][peer].push(message);
  }
};

var handleNewViewRequest = function(model, server, request) {
  if (server.queuedClientRequests === 0) {
    server.viewChangeAlarm = util.Inf;
  } else {
    /* If we're waiting for a client request to be processed, set a new
     * timeout. */
    server.viewChangeAlarm = makeViewChangeAlarm(model.time);
  }
  server.view = request.v;
  server.state = NODE_STATE.BACKUP;
  server.viewChangeAttempt = 1;
  /* TODO: the sequence number should be reset upon entering a new view.
   * This is causing problems now, for now just let it strictly increase. */
  //server.lastUsedSequenceNumber = -1;
};

rules.sendCheckpoint = function(model, server, peer) {
  // TODO
};

/* Check if the server should be marked as primary. Note that changing
 * the server's state to 'primary' does not change anything in terms of
 * how it responds to requests when compared to those of type 'backup'.
 * The primary designation is only used to differentiate the primary
 * server in the visual display, e.g. using the getLeader function. */
rules.becomePrimary = function(model, server) {
  var count = 0;
  for (var i = 0; i < model.servers.length; i++) {
    if ((model.servers[i].view % NUM_SERVERS) == server.id) {
      count += 1;
    }
  }
  if (count >= (2 * NUM_TOLERATED_BYZANTINE_FAULTS + 1) &&
      server.state == NODE_STATE.BACKUP) { // Make sure the server is not NODE_STATE.CHANGING_VIEW.
    var oldPrimary = pbft.getLeader();
    if (oldPrimary !== null) {
      oldPrimary.state = NODE_STATE.BACKUP;
    }
    server.state = NODE_STATE.PRIMARY;
  }
}

var handleCheckpointRequest = function(model, server, request) {
  // TODO
};

var handleClientRequestRequest = function(model, server, request) {
  // TODO
}

var handleClientReplyRequest = function(model, server, request) {//daniel
  if(request.authentic && request.timestamp == server.clientRequestTimestamp){//authentic and timestamp matches
    server.clientReplyCount ++;
  }
}

var handleServerMessage = function(model, server, message) {
  if (message.type == MESSAGE_TYPE.CLIENT_REQUEST) {
    handleClientRequestRequest(model, server, message);
  }
  if (message.type == MESSAGE_TYPE.PRE_PREPARE) {
    handlePrePrepareRequest(model, server, message);
  }
  if (message.type == MESSAGE_TYPE.PREPARE) {
    handlePrepareRequest(model, server, message);
  }
  if (message.type == MESSAGE_TYPE.COMMIT) {
    handleCommitRequest(model, server, message);
  }
  if (message.type == MESSAGE_TYPE.VIEW_CHANGE) {
    handleViewChangeRequest(model, server, message);
  }
  if (message.type == MESSAGE_TYPE.NEW_VIEW) {
    handleNewViewRequest(model, server, message);
  }
  if (message.type == MESSAGE_TYPE.CHECKPOINT) {
    handleCheckpointRequest(model, server, message);
  }
}

var handleClientMessage = function(model, server, message) {
  if (message.type == MESSAGE_TYPE.CLIENT_REPLY) {
    handleClientReplyRequest(model, server, message);
  }
}

var handleMessage = function(model, server, message) {
  switch(serverIdToState(server.id)) {
    case NODE_STATE.BACKUP:
    case NODE_STATE.PRIMARY:
    case NODE_STATE.CHANGING_VIEW: {
      /* The primary and backup are treated exactly the same
       * when handling requests. Each server has their own local
       * view of who the primary is, based on their view number. */
      handleServerMessage(model, server, message);
      break;
    }
    case NODE_STATE.CLIENT: {
      handleClientMessage(model, server, message);
      break;
    }
    default: {
      /* We do nothing for crashed or unknown servers. */
      break;
    }
  }
};

var executeServerRules = function(model, server) {
  rules.startNewViewChange(model, server);
  rules.startViewChangeTimeout(model, server);
  rules.becomePrimary(model, server);
  rules.startPrePrepare(model, server);
  rules.startCommit(model, server);
  rules.addCommitsToLog(model, server);
}

var executeClientRules = function(model, server) {
  // TODO
}

var executeRules = function(model, server) {
  switch(server.state) {
    case NODE_STATE.PRIMARY:
    case NODE_STATE.BACKUP:
    case NODE_STATE.CHANGING_VIEW: {
      executeServerRules(model, server);
      break;
    }
    case NODE_STATE.CLIENT: {
      executeClientRules(model, server);
      break;
    }
    default: {
      break;
    }
  }
}

var sendServerMessages = function(model, server, peer) {
  rules.sendPrePrepare(model, server, peer);
  rules.sendPrepares(model, server, peer);
  rules.sendCommits(model, server, peer);
  rules.sendViewChange(model, server, peer);
  rules.sendNewView(model, server, peer);
  rules.sendCheckpoint(model, server, peer);
}

var sendClientMessages = function(model, server, peer) {
  rules.sendClientReply(model, server, peer);
}

var sendMessages = function(model, server, peer) {
  switch(model.servers[peer].state) {
    case NODE_STATE.PRIMARY:
    case NODE_STATE.BACKUP:
    case NODE_STATE.CHANGING_VIEW: {
      sendServerMessages(model, server, peer);
      break;
    }
    case NODE_STATE.CLIENT: {
      sendClientMessages(model, server, peer);
      break;
    }
    default: {
      break;
    }
  }
}

// Public function.
pbft.update = function(model) {
  model.servers.forEach(function(server) {
    executeRules(model, server);
    server.peers.forEach(function(peer) {
      sendMessages(model, server, peer);
    });
    pbft.clientRequestTimedOut(model,server);
    pbft.clientRequestNumberCheck(model,server);
  });
  var deliver = [];
  var keep = [];
  model.messages.forEach(function(message) {
    if (message.recvTime <= model.time)
      deliver.push(message);
    else if (message.recvTime < util.Inf)
      keep.push(message);
  });
  model.messages = keep;
  deliver.forEach(function(message) {
    model.servers.forEach(function(server) {
      if (server.id == message.to) {
        handleMessage(model, server, message);
      }
    });
  });
};

// Public function.
pbft.stop = function(model, server) {
  server.state = NODE_STATE.CRASHED;
};

// Public function.
pbft.resume = function(model, server) {
  // TODO
};

// Public function.
pbft.resumeAll = function(model) {
  // TODO
};

// Public function.
pbft.restart = function(model, server) {
  // TODO
};

// Public function.
pbft.drop = function(model, message) {
  model.messages = model.messages.filter(function(m) {
    return m !== message;
  });
};

// Public function.
pbft.timeout = function(model, server) {
  server.viewChangeAlarm = model.time;
  rules.startNewViewChange(model, server);
};

pbft.clientRequest = function(model) {
  var client = util.pbftGetClient(model);
  var timestamp = model.time;
  //send msg(type,msg,time) + start timer
  sendMessage(model, {
    from: client,
    to: model.servers[client].LatestPrime,
    type: MESSAGE_TYPE.CLIENT_REQUEST,
    timestamp: timestamp,
    value: "123",
    authentic: true,
  });
  model.servers[client].clientRequestTimestamp = timestamp;
  model.servers[client].clientMulticastTimer = model.time + CLIENT_MULTICAST_TIMER;
};

pbft.clientRequestTimedOut = function(model,server){
  if(server.clientMulticastTimer <= model.time){//timed out 
    var client = util.pbftGetClient(model);
    util.pbftGetReplicas(model).forEach(function(id){
      sendMessage(model, {
        from: client,
        to: id,
        type: MESSAGE_TYPE.CLIENT_REQUEST,
        timestamp: model.time,
        value: "123",
        valid: true,
      });
    })
    server.clientMulticastTimer = util.Inf;
  }
};

pbft.clientRequestNumberCheck = function(model,server){
  if(server.state == NODE_STATE.CLIENT && server.clientReplyCount >= MINIMAL_APPROVE){//is client and number of approval exceeds requested
    server.clientMulticastTimer = util.Inf;
    server.clientRequestTimestamp = -1;
    server.clientReplyCount = 0;
  }
}

// Public function.
pbft.spreadTimers = function(model) {
  var timers = [];
  model.servers.forEach(function(server) {
    if (server.viewChangeAlarm > model.time &&
        server.viewChangeAlarm < util.Inf) {
      timers.push(server.viewChangeAlarm);
    }
  });
  timers.sort(util.numericCompare);
  if (timers.length > 1 &&
      timers[1] - timers[0] < MAX_RPC_LATENCY) {
    if (timers[0] > model.time + MAX_RPC_LATENCY) {
      model.servers.forEach(function(server) {
        if (server.viewChangeAlarm == timers[0]) {
          server.viewChangeAlarm -= MAX_RPC_LATENCY;
          console.log('adjusted S' + server.id + ' timeout forward');
        }
      });
    } else {
      model.servers.forEach(function(server) {
        if (server.viewChangeAlarm > timers[0] &&
            server.viewChangeAlarm < timers[0] + MAX_RPC_LATENCY) {
          server.viewChangeAlarm += MAX_RPC_LATENCY;
          console.log('adjusted S' + server.id + ' timeout backward');
        }
      });
    }
  }
};

// Public function.
pbft.alignTimers = function(model) {
  pbft.spreadTimers(model);
  var timers = [];
  model.servers.forEach(function(server) {
    if (server.viewChangeAlarm > model.time &&
        server.viewChangeAlarm < util.Inf) {
      timers.push(server.viewChangeAlarm);
    }
  });
  timers.sort(util.numericCompare);
  model.servers.forEach(function(server) {
    if (server.viewChangeAlarm == timers[1]) {
      server.viewChangeAlarm = timers[0];
      console.log('adjusted S' + server.id + ' timeout forward');
    }
  });
};

/* End PBFT algorithm logic */

/* Begin PBFT-specific visualization */

var ARC_WIDTH = 5;

var comma = ',';
var arcSpec = function(spec, fraction) {
  var radius = spec.r + ARC_WIDTH/2;
  var end = util.circleCoord(fraction, spec.cx, spec.cy, radius);
  var s = ['M', spec.cx, comma, spec.cy - radius];
  if (fraction > 0.5) {
    s.push('A', radius, comma, radius, '0 0,1', spec.cx, spec.cy + radius);
    s.push('M', spec.cx, comma, spec.cy + radius);
  }
  s.push('A', radius, comma, radius, '0 0,1', end.x, end.y);
  return s.join(' ');
};

var logsSpec = {
  x: 420,
  y: 50,
  width: 60 * NUM_SERVERS,
  height: 54 * NUM_SERVERS,
};

var ringSpec = {
  cx: 210,
  cy: 210,
  r: 150,
};

var pbftLayoutCoord = function(frac, state, cx, cy, r) {
  if (state !== NODE_STATE.CLIENT) {
    return {
      x: (cx - r) + (r - r*Math.cos(2*Math.PI*frac)),
      y: cy - r*Math.sin(2*Math.PI*frac),
    };
  }
  else {
    return {
      x: 50,
      y: 75,
    };
  }
};

var serverSpec = function(id, model) {
  var coord = pbftLayoutCoord((id + 1) / (pbft.NUM_NODES - NUM_CLIENTS), model.servers[id].state,
                              ringSpec.cx, ringSpec.cy, ringSpec.r);
  return {
    cx: coord.x,
    cy: coord.y,
    r: 30,
  };
};

var MESSAGE_RADIUS = 8;

var messageSpec = function(from, to, frac, model) {
  var fromSpec = serverSpec(from, model);
  var toSpec = serverSpec(to, model);
  // adjust frac so you start and end at the edge of servers
  var totalDist  = Math.sqrt(Math.pow(0.01 + toSpec.cx - fromSpec.cx, 2) +
                             Math.pow(0.01 + toSpec.cy - fromSpec.cy, 2));
  var travel = totalDist - fromSpec.r - toSpec.r;
  frac = (fromSpec.r / totalDist) + frac * (travel / totalDist);
  return {
    cx: 0.01 + fromSpec.cx + (toSpec.cx - fromSpec.cx) * frac,
    cy: 0.01 + fromSpec.cy + (toSpec.cy - fromSpec.cy) * frac,
    r: MESSAGE_RADIUS,
  };
};

var messageArrowSpec = function(from, to, frac, model) {
  var fromSpec = serverSpec(from, model);
  var toSpec = serverSpec(to, model);
  // adjust frac so you start and end at the edge of servers
  var totalDist  = Math.sqrt(Math.pow(0.01 + toSpec.cx - fromSpec.cx, 2) +
                             Math.pow(0.01 + toSpec.cy - fromSpec.cy, 2));
  var travel = totalDist - fromSpec.r - toSpec.r;
  var fracS = ((fromSpec.r + MESSAGE_RADIUS)/ totalDist) +
               frac * (travel / totalDist);
  var fracH = ((fromSpec.r + 2*MESSAGE_RADIUS)/ totalDist) +
               frac * (travel / totalDist);
  return [
    'M', 0.01 + fromSpec.cx + (toSpec.cx - fromSpec.cx) * fracS, comma,
         0.01 + fromSpec.cy + (toSpec.cy - fromSpec.cy) * fracS,
    'L', 0.01 + fromSpec.cx + (toSpec.cx - fromSpec.cx) * fracH, comma,
         0.01 + fromSpec.cy + (toSpec.cy - fromSpec.cy) * fracH,
  ].join(' ');
};

var viewColors = [
  '#66c2a5',
  '#fc8d62',
  '#8da0cb',
  '#e78ac3',
  '#a6d854',
  '#ffd92f',
];

var serverActions = [
  ['stop', pbft.stop],
  ['resume', pbft.resume],
  ['restart', pbft.restart],
  ['time out', pbft.timeout],
  ['request', pbft.clientRequest],
];

var messageActions = [
  ['drop', pbft.drop],
];

// Public method, returning the primary server as the "leader".
pbft.getLeader = function() {
  var leader = null;
  var v = 0;
  state.current.servers.forEach(function(server) {
    if (server.state == NODE_STATE.PRIMARY &&
        server.view > v) {
        leader = server;
        v = server.view;
    }
  });
  return leader;
};

var serverModal = function(model, server) {
  var m = $('#modal-details');
  $('.modal-title', m).text('Server ' + server.id);
  $('.modal-dialog', m).removeClass('modal-sm').addClass('modal-lg');
  var li = function(label, value) {
    return '<dt>' + label + '</dt><dd>' + value + '</dd>';
  };
  var peerTable = $('<table></table>')
    .addClass('table table-condensed')
    .append($('<tr></tr>')
      .append('<th>peer</th>')
    );
  server.peers.forEach(function(peer) {
    peerTable.append($('<tr></tr>')
      .append('<td>S' + peer + '</td>')
    );
  });
  $('.modal-body', m)
    .empty()
    .append($('<dl class="dl-horizontal"></dl>')
      .append(li('state', server.state))
      .append(li('currentView', server.view))
      .append(li('lastUsedSequenceNumber', server.lastUsedSequenceNumber))
      .append(li('viewChangeAlarm', util.relTime(server.viewChangeAlarm, model.time)))
      .append($('<dt>peers</dt>'))
      .append($('<dd></dd>').append(peerTable))
    );
  var footer = $('.modal-footer', m);
  footer.empty();
  serverActions.forEach(function(action) {
    footer.append(util.button(action[0])
      .click(function(){
        state.fork();
        action[1](model, server);
        state.save();
        render.update();
        m.modal('hide');
      }));
  });
  m.modal();
};

var messageModal = function(model, message) {
  var m = $('#modal-details');
  $('.modal-dialog', m).removeClass('modal-lg').addClass('modal-sm');
  $('.modal-title', m).text(message.type + ' ' + message.direction);
  var li = function(label, value) {
    return '<dt>' + label + '</dt><dd>' + value + '</dd>';
  };
  var fields = $('<dl class="dl-horizontal"></dl>')
      .append(li('from', 'S' + message.from))
      .append(li('to', 'S' + message.to))
      .append(li('sent', util.relTime(message.sendTime, model.time)))
      .append(li('deliver', util.relTime(message.recvTime, model.time)))
      .append(li('v', message.v))
      .append(li('n', message.n));
  if (message.type == 'RequestVote') {
    if (message.direction == 'request') {
      // fields.append(li('lastLogIndex', message.lastLogIndex));
      // fields.append(li('lastLogView', message.lastLogView));
    } else {
      // fields.append(li('granted', message.granted));
    }
  } else if (message.type == 'AppendEntries') {
    if (message.direction == 'request') {
      var entries = '[' + message.entries.map(function(e) {
            return e.view;
      }).join(' ') + ']';
      // fields.append(li('prevIndex', message.prevIndex));
      // fields.append(li('prevView', message.prevView));
      fields.append(li('entries', entries));
      // fields.append(li('n', message.n));
    } else {
      // fields.append(li('success', message.success));
      // fields.append(li('matchIndex', message.matchIndex));
    }
  }
  $('.modal-body', m)
    .empty()
    .append(fields);
  var footer = $('.modal-footer', m);
  footer.empty();
  messageActions.forEach(function(action) {
    footer.append(util.button(action[0])
      .click(function(){
        state.fork();
        action[1](model, message);
        state.save();
        render.update();
        m.modal('hide');
      }));
  });
  m.modal();
};

// Public variable.
pbft.render = {};

// Public function.
pbft.render.ring = function(svg) {
  $('#pause').attr('transform',
    'translate(' + ringSpec.cx + ', ' + ringSpec.cy + ') ' +
    'scale(' + ringSpec.r / 3.5 + ')');

  $('#ring', svg).attr(ringSpec);
}

// Public function.
pbft.render.servers = function(serversSame, svg) {
  state.current.servers.forEach(function(server) {
    var serverNode = $('#server-' + server.id, svg);
    if (server.state == NODE_STATE.CLIENT){
      $('path', serverNode)
        .attr('d', arcSpec(serverSpec(server.id, state.current),
          util.clamp((server.clientMulticastTimer - state.current.time) /
                      (CLIENT_MULTICAST_TIMER),
                      0, 1)));
    } else {
      $('path', serverNode)
      .attr('d', arcSpec(serverSpec(server.id, state.current),
        util.clamp((server.viewChangeAlarm - state.current.time) /
                    (VIEW_CHANGE_TIMEOUT * 2),
                    0, 1)));
    }
    if (!serversSame) {
      $('text.view', serverNode).text(server.view);
      serverNode.attr('class', 'server ' + server.state);
      $('circle.background', serverNode)
        .attr('style', 'fill: ' +
              (server.state == 'stopped' ? 'gray'
                : viewColors[server.view % viewColors.length]));
      serverNode
        .unbind('click')
        .click(function() {
          serverModal(state.current, server);
          return false;
        });
      if (serverNode.data('context'))
        serverNode.data('context').destroy();
      serverNode.contextmenu({
        target: '#context-menu',
        before: function(e) {
          var closemenu = this.closemenu.bind(this);
          var list = $('ul', this.getMenu());
          list.empty();
          serverActions.forEach(function(action) {
            list.append($('<li></li>')
              .append($('<a href="#"></a>')
                .text(action[0])
                .click(function() {
                  state.fork();
                  action[1](state.current, server);
                  state.save();
                  render.update();
                  closemenu();
                  return false;
                })));
          });
          return true;
        },
      });
    }
  });
};

// Public API.
pbft.appendServerInfo = function(state, svg) {
  state.current.servers.forEach(function(server) {
    var s = serverSpec(server.id, state.current);
    $('#servers', svg).append(
      util.SVG('g')
        .attr('id', 'server-' + server.id)
        .attr('class', 'server')
        .append(util.SVG('text')
                  .attr('class', 'serverid')
                  .text('S' + server.id)
                  .attr(pbftLayoutCoord((server.id + 1) / NUM_SERVERS, server.state,
                                        ringSpec.cx, ringSpec.cy, ringSpec.r + 50)))
        .append(util.SVG('a')
          .append(util.SVG('circle')
                    .attr('class', 'background')
                    .attr(s))
          .append(util.SVG('g')
                    .attr('class', 'votes'))
          .append(util.SVG('path')
                    .attr('style', 'stroke-width: ' + ARC_WIDTH))
          .append(util.SVG('text')
                    .attr('class', 'view')
                    .attr({x: s.cx, y: s.cy}))
          ));
  });
}

// Public function.
pbft.render.entry = function(spec, entry, committed) {
  return util.SVG('g')
    .attr('class', 'entry ' + (committed ? 'committed' : 'uncommitted'))
    .append(util.SVG('rect')
      .attr(spec)
      .attr('stroke-dasharray', committed ? '1 0' : '5 5')
      .attr('style', 'fill: ' + viewColors[entry.view % viewColors.length]))
    .append(util.SVG('text')
      .attr({x: spec.x + spec.width / 2,
             y: spec.y + spec.height / 2})
      .css("fontSize","14px")
      .text(entry));
};

// Public function.
pbft.render.logs = function(svg) {
  var LABEL_WIDTH = 25;
  var INDEX_HEIGHT = 25;
  var logsGroup = $('.logs', svg);
  logsGroup.empty();
  logsGroup.append(
    util.SVG('rect')
      .attr('id', 'logsbg')
      .attr(logsSpec));
  var height = (logsSpec.height - INDEX_HEIGHT) / NUM_SERVERS;
  var leader = pbft.getLeader();
  var indexSpec = {
    x: logsSpec.x + LABEL_WIDTH + logsSpec.width * 0.05,
    y: logsSpec.y + 2*height/6,
    width: logsSpec.width * 0.9,
    height: 2*height/3,
  };
  var indexes = util.SVG('g')
    .attr('id', 'log-indexes');
  logsGroup.append(indexes);
  var logSize = NUM_SERVERS;
  for (var index = 1; index <= logSize; ++index) {
    var indexEntrySpec = {
      x: indexSpec.x + (index - 0.5) * indexSpec.width / (logSize + 1),
      y: indexSpec.y,
      width: indexSpec.width / (logSize + 1),
      height: indexSpec.height,
    };
    indexes
        .append(util.SVG('text')
          .attr(indexEntrySpec)
          .text(index));
  }
  state.current.servers.forEach(function(server) {
    if (server.state === NODE_STATE.CLIENT) {
      return;
    }

    var logSpec = {
      x: logsSpec.x + LABEL_WIDTH - logsSpec.width * 0.08,
                                              /* Original display for Raft was built assuming
                                               * server ids start at one, not zero. For PBFT
                                               * they start at 0, so we add 1 to it here. */
      y: logsSpec.y + INDEX_HEIGHT + height * (server.id + 1) - 5*height/6,
      width: logsSpec.width * 0.9,
      height: 2*height/3,
    };
    var logEntrySpec = function(index) {
      return {
        x: logSpec.x + (index) * logSpec.width / (logSize + 1),
        y: logSpec.y,
        width: logSpec.width / (logSize + 1),
        height: logSpec.height,
      };
    };
    var log = util.SVG('g')
      .attr('id', 'log-S' + server.id);
    logsGroup.append(log);
    log.append(
        util.SVG('text')
          .text('S' + server.id)
          .attr('class', 'serverid ' + server.state)
          .attr({x: logSpec.x + LABEL_WIDTH*4/5,
                 y: logSpec.y + logSpec.height / 2}));
    for (var index = 1; index <= logSize; ++index) {
      log.append(util.SVG('rect')
          .attr(logEntrySpec(index))
          .attr('class', 'log'));
    }
    server.log.forEach(function(entry, i) {
      var index = i + 1;
        log.append(pbft.render.entry(
             logEntrySpec(index),
             entry,
             index <= server.lastUsedSequenceNumber));
    });
    if (leader !== null && leader != server) {
      // log.append(
      //   util.SVG('circle')
      //     .attr('title', 'match index')//.tooltip({container: 'body'})
      //     .attr({cx: logEntrySpec(leader.matchIndex[server.id] + 1).x,
      //            cy: logSpec.y + logSpec.height,
      //            r: 5}));
      // var x = logEntrySpec(leader.nextIndex[server.id] + 0.5).x;
      // log.append(util.SVG('path')
      //   .attr('title', 'next index')//.tooltip({container: 'body'})
      //   .attr('style', 'marker-end:url(#TriangleOutM); stroke: black')
      //   .attr('d', ['M', x, comma, logSpec.y + logSpec.height + logSpec.height/3,
      //               'L', x, comma, logSpec.y + logSpec.height + logSpec.height/6].join(' '))
      //   .attr('stroke-width', 3));
    }
  });
};

// Public function.
pbft.render.messages = function(messagesSame, svg) {
  var messagesGroup = $('#messages', svg);
  if (!messagesSame) {
    messagesGroup.empty();
    state.current.messages.forEach(function(message, i) {
      var a = util.SVG('a')
          .attr('id', 'message-' + i)
          .attr('class', 'message ' + message.direction + ' ' + message.type)
          .attr('title', message.type + ' ' + message.direction)//.tooltip({container: 'body'})
          .append(util.SVG('circle'))
          .append(util.SVG('path').attr('class', 'message-direction'));
      if (message.direction == 'reply')
        a.append(util.SVG('path').attr('class', 'message-success'));
      messagesGroup.append(a);
    });
    state.current.messages.forEach(function(message, i) {
      var messageNode = $('a#message-' + i, svg);
      messageNode
        .click(function() {
          messageModal(state.current, message);
          return false;
        });
      if (messageNode.data('context'))
        messageNode.data('context').destroy();
      messageNode.contextmenu({
        target: '#context-menu',
        before: function(e) {
          var closemenu = this.closemenu.bind(this);
          var list = $('ul', this.getMenu());
          list.empty();
          messageActions.forEach(function(action) {
            list.append($('<li></li>')
              .append($('<a href="#"></a>')
                .text(action[0])
                .click(function() {
                  state.fork();
                  action[1](state.current, message);
                  state.save();
                  render.update();
                  closemenu();
                  return true;
                })));
          });
          return true;
        },
      });
    });
  }
  state.current.messages.forEach(function(message, i) {
    var s = messageSpec(message.from, message.to,
                        (state.current.time - message.sendTime) /
                        (message.recvTime - message.sendTime), state.current);
    $('#message-' + i + ' circle', messagesGroup)
      .attr(s);
    var dir = $('#message-' + i + ' path.message-direction', messagesGroup);
    if (playback.isPaused()) {
      dir.attr('style', 'marker-end:url(#TriangleOutS-' + message.type + ')')
         .attr('d',
           messageArrowSpec(message.from, message.to,
                                 (state.current.time - message.sendTime) /
                                 (message.recvTime - message.sendTime), state.current));
    } else {
      dir.attr('style', '').attr('d', 'M 0,0'); // clear
    }
  });
};

/* End PBFT-specific visualization */

})();
