/* jshint globalstrict: true */
/* jshint browser: true */
/* jshint devel: true */
/* jshint jquery: true */
/* global util */
'use strict';

var pbft = {};

(function() {

/* Begin PBFT algorithm logic */

// Public Variable.
pbft.NUM_SERVERS = 5;
var NUM_TOLERATED_BYZANTINE_FAULTS = 1;

var MIN_RPC_LATENCY = 18000;
var MAX_RPC_LATENCY = 22000;
var VIEW_CHANGE_TIMEOUT = 80000;

const SERVER_STATE = {
  PRIMARY: 'primary',
  BACKUP: 'backup',
  CHANGING_VIEW: 'changing_view'
}

const MESSAGE_TYPE = {
  REQUEST: 'client_request_msg',
  PRE_PREPARE: 'pre_prepare_msg',
  PREPARE: 'prepare_msg',
  COMMIT: 'commit_msg',
  REPLY: 'client_reply_msg',
  VIEW_CHANGE: 'view_change_msg',
  NEW_VIEW: 'new_view_msg',
  CHECKPOINT: 'checkpoint_msg'
}


var sendMessage = function(model, message) {
  message.sendTime = model.time;
  message.recvTime = model.time +
                     MIN_RPC_LATENCY +
                     Math.random() * (MAX_RPC_LATENCY - MIN_RPC_LATENCY);
  model.messages.push(message);
};

var sendRequest = function(model, request) {
  request.direction = 'request';
  sendMessage(model, request);
};

var logView = function(log, index) {
  // TODO
};

var rules = {};
pbft.rules = rules;

var makeViewChangeAlarm = function(now) {
  return now + (Math.random() + 1) * VIEW_CHANGE_TIMEOUT;
};

var makeArrayOfArrays = function(length) {
  return Array.from({length: length}, () => []);
}

var makePeerArrays = function() {
  return makeArrayOfArrays(pbft.NUM_SERVERS);
}

// Public API.
pbft.server = function(id, peers) {
  return {
    // id ranges from `0` to `pbft.NUM_SERVERS - 1`.
    id: id,
    // `pbft.NUM_SERVERS - 1` entries exist in the `peers` array,
    // holding the id for each peer.
    peers: peers,
    // state can be SERVER_STATE.BACKUP, SERVER_STATE.CHANGING_VIEW, or SERVER_STATE.PRIMARY.
    state: SERVER_STATE.BACKUP,
    // 0 is the initial view number v.
    view: 0,
    // 0 is the initial sequence number n.
    n: 0,
    // Contains accepted messages.
    log: [],
    // timeouts are started only upon receiving a client request.
    viewChangeAlarm: util.Inf,
    // key: "k." + id,
    // rpcDue: util.makeMap(peers, 0),
    // A map, with keys corresponding to view number, of arrays
    // holding arrays of view change requests sent to each server.
    viewChangeRequestsSent: {},
    // A map, with keys corresponding to view number, of arrays
    // holding arrays of view changes received from each server.
    viewChangeRequestsReceived: {},
    // The current attempt for view change, starting at 1 to indicate
    // first attempt.
    viewChangeAttempt: 1,
    highestViewChangeReceived: 0,
    newViewRequestsSent: {},
    acceptedPrePrepares: {},
    acceptedPrepares: {},
    preparedMessagesToCommit: {},
    receivedCommitRequests: {},
    queuedClientRequests: [],
    clientMessagesToSend: {},
    prePrepareRequestsSent: {},
    sentPrepareRequests: {},
    sentCommitRequests: {},
    nextSequenceNumber: 0,
    pushedLogMessages: {},
  };
};

var updateHighestViewChangeReceived = function(server, v) {
  server.highestViewChangeReceived = (v > server.highestViewChangeReceived) ?
    v : server.highestViewChangeReceived;
}

var getLatestCheckpointSequenceNumber = function(server) {
  return 0;
}

// Check if server should start a view change, and if so prepare data members
// of server for the view change execution.
rules.startNewViewChange = function(model, server) {
  if (server.viewChangeAlarm <= model.time) {
    console.log("server " + server.id + " timed out");
    // If timed out during a view change, try again with a new attempt.
    if (server.state == SERVER_STATE.CHANGING_VIEW) {
      server.viewChangeAttempt += 1;
    }

    // No timeout, until 2f + 1 view change requests are received
    server.viewChangeAlarm = util.Inf;
    // This is read to indicate that the server is not accepting messages
    // other than VIEW-CHANGE, NEW-VIEW, or CHECKPOINT.
    server.state = SERVER_STATE.CHANGING_VIEW;
    // TODO: set C and P here.

    // Add its own view change request.
    var v = server.view + server.viewChangeAttempt;
    server.viewChangeRequestsReceived[v] = server.viewChangeRequestsReceived[v] || makePeerArrays();
    server.viewChangeRequestsReceived[v][server.id].push({
      from: server.id, // this is `i` described in PBFT paper.
      to: server.id,
      type: MESSAGE_TYPE.VIEW_CHANGE,
      v: v,
      n: getLatestCheckpointSequenceNumber(server),
      C: 0,
      P: 0,
    });
    updateHighestViewChangeReceived(server, v);
  }
};

// TODO: enforce a limited number of client requests in progress
// TODO: make finer semantics for client forwarding queued requests to primary
rules.startPrePrepare = function(model, server) {
  server.clientMessagesToSend[server.view] = server.clientMessagesToSend[server.view] || makePeerArrays();
  if ((server.state !== SERVER_STATE.CHANGING_VIEW) &&
      (server.id == (server.view % pbft.NUM_SERVERS)) &&
      (server.queuedClientRequests.length !== 0)) {
    console.log("queuedClientRequests.length: " + server.queuedClientRequests.length)
    var request = server.queuedClientRequests.shift();
    server.clientMessagesToSend[server.view].forEach(function(messages) {
      console.log("startPrePrepare: id=" + server.id + " view=" + server.view);
      messages.push(request);
    });
  }
};

var getUniqueNumPrepareRequestsReceived = function(peerPrepareRequests) {
  if (peerPrepareRequests == undefined) {
    return 0;
  }
  var count = 0;
  peerPrepareRequests.forEach(function(requests) {
    // TODO: this should be a validity check
    if (requests.length !== 0 &&
        requests[0].type == MESSAGE_TYPE.PREPARE) {
      count += 1;
    }
  }, count);
  return count;
};

var getFirstRequest = function(requests) {
  for (var i = 0; i < requests.length; i++) {
    if (requests[i].length !== 0) {
      return requests[i];
    }
  }
  return null;
}

rules.startCommit = function(model, server) {
  server.preparedMessagesToCommit[server.view] = server.preparedMessagesToCommit[server.view] || {};
  server.acceptedPrepares[server.view] = server.acceptedPrepares[server.view] || {};
  // TODO: check if 2f + 1 valid prepares received, and add to preparedMessagesToCommit
  if ((server.state !== SERVER_STATE.CHANGING_VIEW)) {
    for (let [n, requests] of Object.entries(server.acceptedPrepares[server.view])) {
      server.preparedMessagesToCommit[server.view][n] = server.preparedMessagesToCommit[server.view][n] || [];
      // This checks the predicate 'prepared' from the paper. Only 2f prepares are needed (not 2f + 1).
      if ((getUniqueNumPrepareRequestsReceived(requests) >=
           (2 * NUM_TOLERATED_BYZANTINE_FAULTS)) &&
          (server.preparedMessagesToCommit[server.view][n].length == 0)) {
        server.preparedMessagesToCommit[server.view][n].push(getFirstRequest(requests)[0]);
      }
    }
  }
};

var getUniqueNumCommitRequestsReceived = function(peerCommitRequests) {
  if (peerCommitRequests == undefined) {
    return 0;
  }
  var count = 0;
  peerCommitRequests.forEach(function(requests) {
    // TODO: this should be a validity check
    if (requests.length !== 0 &&
        requests[0].type == MESSAGE_TYPE.COMMIT) {
      count += 1;
    }
  }, count);
  return count;
};

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

      // "tick" this request off from the queuedClientRequests, and remove
      // the election alarm (no need to continue view change)
      for (var i = 0; i < server.queuedClientRequests.length; i++) {
        if (server.queuedClientRequests[i] == m) {
          server.queuedClientRequests.splice(i, 1);
          server.viewChangeAlarm = util.Inf;
        }
      }
      // For the primary, we can find the matchine message in the acceptedPrePrepares
      if ((server.id % pbft.NUM_SERVERS) == server.view) {
        for (let [n, requests] of Object.entries(server.acceptedPrePrepares[server.view])) {
          if (n == rq.n && requests[0].v == rq.v) {
            server.queuedClientRequests.splice(i, 1);
            server.viewChangeAlarm = util.Inf;
            break;
          }
        }
      }

      /* - (without checking any messages for validity) this can happen in edge cases, e.g. pre-prepare sent by a new primary
       * reached the replica before the new view message did
       * - this will result in the message being missed by the server, and when it becomes primary it will think it still
       * needs to try to commit the message. the pre-prepare/prepare/commit stage will still occur, but other servers
       * won't re-execute after checking that the message timestamps are the same. */
      if (m === undefined) {
        console.log("warning: server " + server.id + "missed pre-prepare for message with view " + rq.v + " and sequence number " + rq.n);
      }

      var msg = "(" + rq.v + "," + rq.n + "," + m + ")";
      console.log("logging: " + msg + " at server S" + server.id);
      server.log.push(msg);
      server.pushedLogMessages[server.view][n].push(msg);
    }
  });
};

var getUniqueNumViewChangeRequestsReceived = function(peerViewChangeRequests) {
  if (peerViewChangeRequests == undefined) {
    return 0;
  }
  var count = 0;
  peerViewChangeRequests.forEach(function(requests) {
    // TODO: this should be a validity check
    if (requests.length !== 0 &&
        requests[0].type == MESSAGE_TYPE.VIEW_CHANGE) {
      count += 1;
    }
  }, count);
  return count;
};

rules.startViewChangeTimeout = function(model, server) {
  // Restart the timeout upon receiving valid view change requests
  // from 2f+1 nodes.
  if ((server.state == SERVER_STATE.CHANGING_VIEW) &&
      (getUniqueNumViewChangeRequestsReceived(
         server.viewChangeRequestsReceived[server.view +
                                           server.viewChangeAttempt])
       >= ((2 * NUM_TOLERATED_BYZANTINE_FAULTS) + 1)) &&
      (server.viewChangeAlarm === util.Inf)) { // Make sure the timeout is only set when not already running.
    // TODO: this timeout should be 2x the previous amount (increase
    // by factor of 2 for each attempt).
    server.viewChangeAlarm = makeViewChangeAlarm(model.time);
  }
};

var hasUnsentPrePrepare = function(sentRequests, peer) {
  return sentRequests[peer].length == 0;
}

rules.sendPrePrepare = function(model, server, peer) {
  server.clientMessagesToSend[server.view] = server.clientMessagesToSend[server.view] || makePeerArrays();
  server.prePrepareRequestsSent[server.view] = server.prePrepareRequestsSent[server.view] || makePeerArrays();
  if ((server.state !== SERVER_STATE.CHANGING_VIEW) &&
      (server.id == (server.view % pbft.NUM_SERVERS)) &&
      (server.clientMessagesToSend[server.view][peer].length !== 0) &&
      (hasUnsentPrePrepare(server.prePrepareRequestsSent[server.view], peer))) {
    var request = {
      from: server.id, // this is `i` described in PBFT paper.
      to: peer,
      type: MESSAGE_TYPE.PRE_PREPARE,
      v: server.view,
      n: server.nextSequenceNumber,
      d: 0, // TODO: this should create a "digest" based on m
      // We don't care about performance right now so we just attach the
      // client message as a field of the PRE-PREPARE.
      m: server.clientMessagesToSend[server.view][peer][0],
    };
    console.log("sending prePrepare from " + server.id + " to " + peer + " with message value " + request.m);
    server.prePrepareRequestsSent[server.view][peer].push(request);
    sendRequest(model, request);
  }
};

rules.sendCheckpoint = function(model, server, peer) {
  // TODO
};

rules.sendViewChange = function(model, server, peer) {
  var v = server.view + server.viewChangeAttempt;
  server.viewChangeRequestsSent[v] = server.viewChangeRequestsSent[v] || makePeerArrays();
  if (server.state == SERVER_STATE.CHANGING_VIEW &&
      server.viewChangeRequestsSent[v][peer].length == 0) {
    var message = {
      from: server.id, // this is `i` described in PBFT paper.
      to: peer,
      type: MESSAGE_TYPE.VIEW_CHANGE,
      v: v,
      n: getLatestCheckpointSequenceNumber(server),
      C: server.checkpointProof,
      P: server.prePreparedMessageProofs,
    };
    server.viewChangeRequestsSent[v][peer].push(message);
    sendRequest(model, message);
  }
};

rules.sendNewView = function(model, server, peer) {
  server.newViewRequestsSent[server.highestViewChangeReceived] = server.newViewRequestsSent[server.highestViewChangeReceived] || makePeerArrays();
  if ((server.state !== 'crashed') &&
      (getUniqueNumViewChangeRequestsReceived(
         server.viewChangeRequestsReceived[server.highestViewChangeReceived]) >=
       (2 * NUM_TOLERATED_BYZANTINE_FAULTS + 1)) &&
      (server.id == (server.highestViewChangeReceived % pbft.NUM_SERVERS)) &&
      (server.newViewRequestsSent[server.highestViewChangeReceived][peer].length === 0)) { // Only send the NEW-VIEW message once.
    var message = {
      from: server.id,
      to: peer,
      type: MESSAGE_TYPE.NEW_VIEW,
      v: server.highestViewChangeReceived,
      V: server.viewChangeRequests
    };
    sendRequest(model, message);
    server.view = server.highestViewChangeReceived;
    // We reset the new primary temporarily to a SERVER_STATE.BACKUP; it will be picked
    // up later by becomePrimary which will set its state to SERVER_STATE.PRIMARY.
    server.state = SERVER_STATE.BACKUP;
    server.viewChangeAlarm = util.Inf;
    server.newViewRequestsSent[server.highestViewChangeReceived][peer].push(message);
  }
};

rules.becomePrimary = function(model, server) {
  var count = 0;
  for (var i = 0; i < model.servers.length; i++) {
    if ((model.servers[i].view % pbft.NUM_SERVERS) == server.id) {
      count += 1;
    }
  }
  if (count >= (2 * NUM_TOLERATED_BYZANTINE_FAULTS + 1) &&
      server.state == SERVER_STATE.BACKUP) { // Make sure the server is not SERVER_STATE.CHANGING_VIEW.
    var oldPrimary = pbft.getLeader();
    if (oldPrimary !== null) {
      oldPrimary.state = SERVER_STATE.BACKUP;
    }
    server.state = SERVER_STATE.PRIMARY;
  }
}

rules.sendPrepares = function(model, server, peer) {
  server.acceptedPrePrepares[server.view] = server.acceptedPrePrepares[server.view] || {};
  server.sentPrepareRequests[server.view] = server.sentPrepareRequests[server.view] || {};
  for (let [n, requests] of Object.entries(server.acceptedPrePrepares[server.view])) {
    console.assert(requests.length <= 1);
    server.sentPrepareRequests[server.view][n] = server.sentPrepareRequests[server.view][n] || makePeerArrays();
    if ((server.state != SERVER_STATE.CHANGING_VIEW) &&
        (requests.length === 1) &&
        (server.sentPrepareRequests[server.view][n][peer].length === 0) &&
        (peer != server.id) && /* Don't sent prepares to self. */
        (!(peer.view % pbft.NUM_SERVERS == peer.id)) /* Primary does not send prepares. */
       ) {

      // This should be guaranteed by accessing acceptedPrePrepares by server.view above
      // Pre-prepares and prepares must occur within the same view.
      console.assert(server.view === requests[0].v);
      var request = {
        from: server.id, // same as 'i' in the paper.
        to: peer,
        type: MESSAGE_TYPE.PREPARE,
        v: server.view,
        n: n,
        d: 0, // TODO: this "digest" should be computed
      };
      sendRequest(model, request);
      server.sentPrepareRequests[server.view][n][peer].push(request);
    }
  }
};

rules.sendCommits = function(model, server, peer) {
  server.preparedMessagesToCommit[server.view] = server.preparedMessagesToCommit[server.view] || {};
  server.sentCommitRequests[server.view] = server.sentCommitRequests[server.view] || {};
  for (let [n, requests] of Object.entries(server.preparedMessagesToCommit[server.view])) {
    console.assert(requests.length <= 1);
    server.sentCommitRequests[server.view][n] = server.sentCommitRequests[server.view][n] || makePeerArrays();
    if ((server.state != SERVER_STATE.CHANGING_VIEW) &&
        (requests.length === 1) &&
        (server.sentCommitRequests[server.view][n][peer].length === 0)
       ) {
      var request = {
        from: server.id,
        to: peer,
        type: MESSAGE_TYPE.COMMIT,
        v: server.view,
        n: n,
        d: 0, // recompute D(m) here, don't use request.d
      };
      // If accessing a request through the `sendCommitRequests` object, the
      // sequence number of the request must match the sequence number it was
      // indexed by.
      console.assert(n == request.n);
      console.log("sending commit message from node " + server.id + " v:" + request.v + " n:" + request.n);
      sendRequest(model, request);
      server.sentCommitRequests[server.view][n][peer].push(request);
    }
  }
};

var handlePrePrepareRequest = function(model, server, request) {
  // TODO: check not alredy accepted a pre-prepare from another server for
  // this v, n.
  // TODO: check v is same.
  // TODO: watermark and digest
  if (server.state != SERVER_STATE.CHANGING_VIEW) {
    server.acceptedPrePrepares[request.v] = server.acceptedPrePrepares[request.v] || {};
    server.acceptedPrePrepares[request.v][request.n] = server.acceptedPrePrepares[request.v][request.n] || [];
    server.acceptedPrePrepares[request.v][request.n].push(request);
    // TODO: valdity check on the pushed pre-prepare.
  }
};

var handlePrepareRequest = function(model, server, request) {
  if (server.state != SERVER_STATE.CHANGING_VIEW) {
    server.acceptedPrepares[request.v] = server.acceptedPrepares[request.v] || {};
    server.acceptedPrepares[request.v][request.n] = server.acceptedPrepares[request.v][request.n] || makePeerArrays();
    // TODO: before pushing a pre-prepare, need to check it matches digest already pushed pre-prepare.
    // An array without indexing by sender server id might be a better structure for this.
    if (server.acceptedPrepares[request.v][request.n][request.from].length !== 0) {
      // TODO: check digest of last received pre prepare message against current one.
    }
    console.log("accepted prepare at node " + server.id + " v: " + request.v + " n: " + request.n + " from: " + request.from);
    server.acceptedPrepares[request.v][request.n][request.from].push(request);
  }
};

var handleCommitRequest = function(model, server, request) {
  if (server.state != SERVER_STATE.CHANGING_VIEW) {
    // TODO: check view of commit against view of server
    server.receivedCommitRequests[request.v] = server.receivedCommitRequests[request.v] || {};
    server.receivedCommitRequests[request.v][request.n] = server.receivedCommitRequests[request.v][request.n] || makePeerArrays();
    console.log("received commit request at server " + server.id + ".");
    server.receivedCommitRequests[request.v][request.n][request.from].push(request);
  }
};

var handleCheckpointRequest = function(model, server, request) {
  // TODO
};

var handleViewChangeRequest = function(model, server, request) {
  server.viewChangeRequestsReceived[request.v] = server.viewChangeRequestsReceived[request.v] || makePeerArrays();
  server.viewChangeRequestsReceived[request.v][request.from].push(request);
  updateHighestViewChangeReceived(server, request.v);
};

var handleNewViewRequest = function(model, server, request) {
  server.viewChangeAlarm = util.Inf;
  server.view = request.v;
  server.state = SERVER_STATE.BACKUP;
  server.viewChangeAttempt = 1;
};

var handleMessage = function(model, server, message) {
  if (message.type == MESSAGE_TYPE.VIEW_CHANGE) {
    if (message.direction == 'request') {
      handleViewChangeRequest(model, server, message);
    }
  }
  if (message.type == MESSAGE_TYPE.NEW_VIEW) {
    if (message.direction == 'request') {
      handleNewViewRequest(model, server, message);
    }
  }
  if (message.type == MESSAGE_TYPE.PRE_PREPARE) {
    if (message.direction == 'request') {
      handlePrePrepareRequest(model, server, message);
    }
  }
  if (message.type == MESSAGE_TYPE.PREPARE) {
    if (message.direction == 'request') {
      handlePrepareRequest(model, server, message);
    }
  }
  if (message.type == MESSAGE_TYPE.COMMIT) {
    if (message.direction == 'request') {
      handleCommitRequest(model, server, message);
    }
  }
};

// Public function.
pbft.update = function(model) {
  model.servers.forEach(function(server) {
    rules.startNewViewChange(model, server);
    rules.startViewChangeTimeout(model, server);
    rules.becomePrimary(model, server);
    rules.startPrePrepare(model, server);
    rules.startCommit(model, server);
    rules.addCommitsToLog(model, server);
    server.peers.forEach(function(peer) {
      rules.sendPrePrepare(model, server, peer);
      rules.sendPrepares(model, server, peer);
      rules.sendCommits(model, server, peer);
      rules.sendCheckpoint(model, server, peer);
      rules.sendViewChange(model, server, peer);
      rules.sendNewView(model, server, peer);
    });
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
pbft.stop = function(/* TODO */) {
  // TODO
};

// Public function.
pbft.resume = function(/* TODO */) {
  // TODO
};

// Public function.
pbft.resumeAll = function(/* TODO */) {
  // TODO
};

// Public function.
pbft.restart = function(/* TODO */) {
  // TODO
};

// Public function.
pbft.drop = function(model, message) {
  model.messages = model.messages.filter(function(m) {
    return m !== message;
  });
};

// Public function.
pbft.timeout = function(/* TODO */) {
  // TODO
};

var clientMessageNumber = 0;

// Public function.
// TODO: send timestamp and client encryption here
// TODO: client awareness, and forward messages from client to correct primary
// TODO: client must accept f + 1 valid replies before accepting
pbft.clientRequest = function(model, server, t) {
  server.viewChangeAlarm = makeViewChangeAlarm(model.time);
  // Assume client decided to multicast the request right away, without waiting
  // for a timeout after sending it to what it believed to be the primary.
  // TODO: client should only multicast after waiting for a timeout to expire
  //       after receiving no response from primary.
  server.peers.forEach(function(peer) {
    // When client multicasts to a backup, the backup starts a timeout for
    // receiving an RPC from the current primary.

    // We just overwrite the previous timeout here with the more recent one
    // (for when multiple client requests are made before the timeout expires).
    model.servers[peer].viewChangeAlarm = makeViewChangeAlarm(model.time);
    model.servers[peer].queuedClientRequests.push(clientMessageNumber);
  });
  clientMessageNumber += 1;
  console.log("clientMessageNumber: " + clientMessageNumber);
};

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
  width: 60 * pbft.NUM_SERVERS,
  height: 54 * pbft.NUM_SERVERS,
};

var ringSpec = {
  cx: 210,
  cy: 210,
  r: 150,
};

var serverSpec = function(id) {
  var coord = util.circleCoord((id) / pbft.NUM_SERVERS,
                               ringSpec.cx, ringSpec.cy, ringSpec.r);
  return {
    cx: coord.x,
    cy: coord.y,
    r: 30,
  };
};

var MESSAGE_RADIUS = 8;

var messageSpec = function(from, to, frac) {
  var fromSpec = serverSpec(from);
  var toSpec = serverSpec(to);
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

var messageArrowSpec = function(from, to, frac) {
  var fromSpec = serverSpec(from);
  var toSpec = serverSpec(to);
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
    if (server.state == SERVER_STATE.PRIMARY &&
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
      .append(li('nextSequenceNumber', server.nextSequenceNumber))
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
    $('path', serverNode)
      .attr('d', arcSpec(serverSpec(server.id),
        util.clamp((server.viewChangeAlarm - state.current.time) /
                    (VIEW_CHANGE_TIMEOUT * 2),
                    0, 1)));
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
    var s = serverSpec(server.id);
    $('#servers', svg).append(
      util.SVG('g')
        .attr('id', 'server-' + server.id)
        .attr('class', 'server')
        .append(util.SVG('text')
                  .attr('class', 'serverid')
                  .text('S' + server.id)
                  .attr(util.circleCoord((server.id) / pbft.NUM_SERVERS,
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
  var height = (logsSpec.height - INDEX_HEIGHT) / pbft.NUM_SERVERS;
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
  var logSize = 5;
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
    var logSpec = {
      x: logsSpec.x + LABEL_WIDTH - logsSpec.width * 0.08,
                                              /* Display was built assuming servers ids
                                               * start at one. For PBFT they start at 0,
                                               * so we add 1 to it. */
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
             index <= server.nextSequenceNumber));
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
                        (message.recvTime - message.sendTime));
    $('#message-' + i + ' circle', messagesGroup)
      .attr(s);
    var dir = $('#message-' + i + ' path.message-direction', messagesGroup);
    if (playback.isPaused()) {
      dir.attr('style', 'marker-end:url(#TriangleOutS-' + message.type + ')')
         .attr('d',
           messageArrowSpec(message.from, message.to,
                                 (state.current.time - message.sendTime) /
                                 (message.recvTime - message.sendTime)));
    } else {
      dir.attr('style', '').attr('d', 'M 0,0'); // clear
    }
  });
};

/* End PBFT-specific visualization */

})();
