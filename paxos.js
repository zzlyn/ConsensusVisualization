/* jshint globalstrict: true */
/* jshint browser: true */
/* jshint devel: true */
/* jshint jquery: true */
/* global util */
'use strict';

var paxos = {};

(function() {

/* Begin paxos algorithm logic */

// Configure these variables to define the number of proposers, accepters 
// and learners in the consensus.
paxos.NUM_PROPOSERS = 1;
paxos.NUM_ACCEPTORS = 3;
paxos.NUM_LEARNERS = 1;

// Public Variable.
paxos.NUM_SERVERS = paxos.NUM_PROPOSERS + paxos.NUM_ACCEPTORS + paxos.NUM_LEARNERS;

// Use these utils to identify server state.
paxos.SERVER_STATE = {
  PROPOSER: 'proposer',
  ACCEPTOR: 'acceptor',
  LEARNER: 'learner',
  UNKNOWN: 'unknown',
}

paxos.MESSAGE_TYPE = {
  PREPARE: 'prepare_msg',
  PROMISE: 'promise_msg',
  ACCEPT_RQ: 'accept_request_msg',
  ACCEPTED: 'accept_msg',
}

// Translate ID in range [1, NUM_SERVERS] to server state. Returns
// UNKNOWN if ID is out of bound.
paxos.serverIdToState = function(id) {
  if (id <= 0 || id > paxos.NUM_SERVERS) {
    return paxos.SERVER_STATE.UNKNOWN;
  }

  if (id <= paxos.NUM_PROPOSERS) {
    return paxos.SERVER_STATE.PROPOSER;
  }

  if (id <= paxos.NUM_PROPOSERS + paxos.NUM_ACCEPTORS) {
    return paxos.SERVER_STATE.ACCEPTOR;
  }

  return paxos.SERVER_STATE.LEARNER;
}

// Define color per server state. Returns 'black' for unknown state.
// (TODO: tune the colors to look smoother.)
paxos.serverStateToColor = function(state) {
  if (state === paxos.SERVER_STATE.PROPOSER) {
    return 'green';
  }

  if (state === paxos.SERVER_STATE.ACCEPTOR) {
    return 'blue';
  }

  if (state === paxos.SERVER_STATE.LEARNER) {
    return 'yellow';
  }

  return 'black'; // UNKNOWN.
}

paxos.serverIdToColor = function(id) {
  return paxos.serverStateToColor(paxos.serverIdToState(id));
}

// Public API: server object.
paxos.server = function(id, peers) {

  let serverAttrs = {
    id: id,
    state: paxos.serverIdToState(id), //some online searches say a server can take multiple states
    peers: peers,
    maxPropNum: 0,  //this server promises to not allow proposals with proposalNum less than maxPropNum

    // following variables show the currently accepted proposal num and value
    acceptedProposalNum: -1,  //initially -1. If this is -1 then nothing was ever accepted and thus the acceptedProposalVal is invalid
    acceptedProposalVal: 'default', //can only use this value if acceptedProposalID !== 0

    peers: peers,
    term: 1,
    votedFor: null,
    log: [],
    commitIndex: 0,
    electionAlarm: makeElectionAlarm(0),
    voteGranted:  util.makeMap(peers, false),
    matchIndex:   util.makeMap(peers, 0),
    nextIndex:    util.makeMap(peers, 1),
    rpcDue:       util.makeMap(peers, 0),
    heartbeatDue: util.makeMap(peers, 0),
  };

  // Proposer Specific Attributes.
  if (serverAttrs.state === paxos.SERVER_STATE.PROPOSER) {
    serverAttrs.shouldSendPrepare = true;
    serverAttrs.grantedPromises = 0;
  }

  // Acceptor Specific Attributes.
  if (serverAttrs.state === paxos.SERVER_STATE.ACCEPTOR) {
    serverAttrs.previousTerm = -1;
  }
  
  return serverAttrs;
};

// message object. (could be proposal message/ accepter ACKs to proposals/learners)
paxos.message = function(propNum, servID) {
  return {
    proposalNum: propNum,
    proposalID: servID + proposalNum, //make each message unique to that server by including server ID
    proposalVal: 'default', //pass values as strings
    messageState: 'default', //could be one of the MESSAGE_STATEs.

  };
};

paxos.RPC_TIMEOUT = 50000;
paxos.MIN_RPC_LATENCY = 10000;
paxos.MAX_RPC_LATENCY = 15000;
paxos.ELECTION_TIMEOUT = 100000;
paxos.BATCH_SIZE = 1;

var sendMessage = function(model, message) {
  message.sendTime = model.time;
  message.recvTime = model.time +
                     paxos.MIN_RPC_LATENCY +
                     Math.random() * (paxos.MAX_RPC_LATENCY - paxos.MIN_RPC_LATENCY);
  model.messages.push(message);
};

var sendRequest = function(model, request) {
  request.direction = 'request';
  sendMessage(model, request);
};

var sendReply = function(model, request, reply) {
  reply.from = request.to;
  reply.to = request.from;
  sendMessage(model, reply);
};

var logTerm = function(log, index) {
  if (index < 1 || index > log.length) {
    return 0;
  } else {
    return log[index - 1].term;
  }
};

var rules = {};
paxos.rules = rules;

var makeElectionAlarm = function(now) {
  return now + (Math.random() + 1) * paxos.ELECTION_TIMEOUT;
};

var stepDown = function(model, server, term) {
  server.term = term;
  server.state = 'follower';
  server.votedFor = null;
  if (server.electionAlarm <= model.time || server.electionAlarm == util.Inf) {
    server.electionAlarm = makeElectionAlarm(model.time);
  }
};

rules.startNewElection = function(model, server) {
  if ((server.state == 'follower' || server.state == 'candidate') &&
      server.electionAlarm <= model.time) {
    server.electionAlarm = makeElectionAlarm(model.time);
    server.term += 1;
    server.votedFor = server.id;
    server.state = 'candidate';
    server.voteGranted  = util.makeMap(server.peers, false);
    server.matchIndex   = util.makeMap(server.peers, 0);
    server.nextIndex    = util.makeMap(server.peers, 1);
    server.rpcDue       = util.makeMap(server.peers, 0);
    server.heartbeatDue = util.makeMap(server.peers, 0);
  }
};

rules.sendRequestVote = function(model, server, peer) {
  if (server.state == 'candidate' &&
      server.rpcDue[peer] <= model.time) {
    server.rpcDue[peer] = model.time + paxos.RPC_TIMEOUT;
    sendRequest(model, {
      from: server.id,
      to: peer,
      type: 'RequestVote',
      term: server.term,
      lastLogTerm: logTerm(server.log, server.log.length),
      lastLogIndex: server.log.length});
  }
};

//send request from client to proposer
raft.sendClientRequest = function(model, server, proposer) {
  var group = util.groupServers(model);
  var clientId = group[0].id;
  var proposers = group[1];
  proposers.forEach(function(proposers){
    sendRequest(model, {
      from: clientId,
      to: proposers.id,
      type: 'ClientRequest'});
  });
};

rules.becomeLeader = function(model, server) {
  if (server.state == 'candidate' &&
      util.countTrue(util.mapValues(server.voteGranted)) + 1 > Math.floor(paxos.NUM_SERVERS / 2)) {
    //console.log('server ' + server.id + ' is leader in term ' + server.term);
    server.state = 'leader';
    server.nextIndex    = util.makeMap(server.peers, server.log.length + 1);
    server.rpcDue       = util.makeMap(server.peers, util.Inf);
    server.heartbeatDue = util.makeMap(server.peers, 0);
    server.electionAlarm = util.Inf;
  }
};

rules.sendAppendEntries = function(model, server, peer) {
  if (server.state == 'leader' &&
      (server.heartbeatDue[peer] <= model.time ||
       (server.nextIndex[peer] <= server.log.length &&
        server.rpcDue[peer] <= model.time))) {
    var prevIndex = server.nextIndex[peer] - 1;
    var lastIndex = Math.min(prevIndex + paxos.BATCH_SIZE,
                             server.log.length);
    if (server.matchIndex[peer] + 1 < server.nextIndex[peer])
      lastIndex = prevIndex;
    sendRequest(model, {
      from: server.id,
      to: peer,
      type: 'AppendEntries',
      term: server.term,
      prevIndex: prevIndex,
      prevTerm: logTerm(server.log, prevIndex),
      entries: server.log.slice(prevIndex, lastIndex),
      commitIndex: Math.min(server.commitIndex, lastIndex)});
    server.rpcDue[peer] = model.time + paxos.RPC_TIMEOUT;
    server.heartbeatDue[peer] = model.time + paxos.ELECTION_TIMEOUT / 2;
  }
};

rules.advanceCommitIndex = function(model, server) {
  var matchIndexes = util.mapValues(server.matchIndex).concat(server.log.length);
  matchIndexes.sort(util.numericCompare);
  var n = matchIndexes[Math.floor(paxos.NUM_SERVERS / 2)];
  if (server.state == 'leader' &&
      logTerm(server.log, n) == server.term) {
    server.commitIndex = Math.max(server.commitIndex, n);
  }
};

var handleRequestVoteRequest = function(model, server, request) {
  if (server.term < request.term)
    stepDown(model, server, request.term);
  var granted = false;
  if (server.term == request.term &&
      (server.votedFor === null ||
       server.votedFor == request.from) &&
      (request.lastLogTerm > logTerm(server.log, server.log.length) ||
       (request.lastLogTerm == logTerm(server.log, server.log.length) &&
        request.lastLogIndex >= server.log.length))) {
    granted = true;
    server.votedFor = request.from;
    server.electionAlarm = makeElectionAlarm(model.time);
  }
  sendReply(model, request, {
    term: server.term,
    granted: granted,
  });
};

var handleRequestVoteReply = function(model, server, reply) {
  if (server.term < reply.term)
    stepDown(model, server, reply.term);
  if (server.state == 'candidate' &&
      server.term == reply.term) {
    server.rpcDue[reply.from] = util.Inf;
    server.voteGranted[reply.from] = reply.granted;
  }
};

var handleAppendEntriesRequest = function(model, server, request) {
  var success = false;
  var matchIndex = 0;
  if (server.term < request.term)
    stepDown(model, server, request.term);
  if (server.term == request.term) {
    server.state = 'follower';
    server.electionAlarm = makeElectionAlarm(model.time);
    if (request.prevIndex === 0 ||
        (request.prevIndex <= server.log.length &&
         logTerm(server.log, request.prevIndex) == request.prevTerm)) {
      success = true;
      var index = request.prevIndex;
      for (var i = 0; i < request.entries.length; i += 1) {
        index += 1;
        if (logTerm(server.log, index) != request.entries[i].term) {
          while (server.log.length > index - 1)
            server.log.pop();
          server.log.push(request.entries[i]);
        }
      }
      matchIndex = index;
      server.commitIndex = Math.max(server.commitIndex,
                                    request.commitIndex);
    }
  }
  sendReply(model, request, {
    term: server.term,
    success: success,
    matchIndex: matchIndex,
  });
};

var handleAppendEntriesReply = function(model, server, reply) {
  if (server.term < reply.term)
    stepDown(model, server, reply.term);
  if (server.state == 'leader' &&
      server.term == reply.term) {
    if (reply.success) {
      server.matchIndex[reply.from] = Math.max(server.matchIndex[reply.from],
                                               reply.matchIndex);
      server.nextIndex[reply.from] = reply.matchIndex + 1;
    } else {
      server.nextIndex[reply.from] = Math.max(1, server.nextIndex[reply.from] - 1);
    }
    server.rpcDue[reply.from] = 0;
  }
};

var handleMessage = function(model, server, message) {
  switch(paxos.serverIdToState(server.id)) {
    case paxos.SERVER_STATE.PROPOSER:
      handleMessageProposer(model, server, message);
      break;

    case paxos.SERVER_STATE.ACCEPTOR:
      handleMessageAcceptor(model, server, message);
      break;

    case paxos.SERVER_STATE.LEARNER:
      // handleMessageLearner(model, server, message);
      break;

    default:
      // Unknown.
      break;
  }
};

/* Start Paxos Proposer Implementation. */

var handleMessageProposer = function(model, server, message) {
  // Accept phase.
  if (server.waitingOnPromise) {
    if (message.type === paxos.MESSAGE_TYPE.PROMISE) {
      // Acceptor has previously accepted another value with a smaller
      // term number. This proposer will try to propose for that value
      // instead of its original value.
      //
      // The initial server.previousTerm is set to '-1' so this replacement
      // is guaranteed to happen if there was a legit accepted value.
      // 
      // For Acceptors, previouslyAcceptedTerm and previouslyAcceptedValue
      // should be set/unset together.
      if (message.previouslyAcceptedTerm > server.previousTerm ) {
        server.previousTerm = message.previouslyAcceptedTerm;
        server.proposeValue = message.previouslyAcceptedValue;
      }
      server.grantedPromises += 1;
    }
  }
}

var handleProposerUpdate = function(model, server) {
  // Prepare phase.
  if (server.shouldSendPrepare) {
    server.peers.forEach(function(peer) {
      if (paxos.serverIdToState(peer) !== paxos.SERVER_STATE.ACCEPTOR) {
        return; // Only propose to acceptors.
      }
      sendRequest(model, {
        from: server.id,
        to: peer,
        type: paxos.MESSAGE_TYPE.PREPARE,
        term: server.term,
      });
    });
    server.shouldSendPrepare = false; // End the prepare phase.
    server.waitingOnPromise = true; // Start the next phase.
    // Used to compare & choose the largest accepted value to
    // propose instead in the next phase.
    server.previousTerm = -1; 
    return;
  }

  // Accept phase.
  if (server.waitingOnPromise) {
    if (server.grantedPromises > paxos.NUM_ACCEPTORS / 2) {
      // Server has quorum. End acccept-waiting phase.
      server.waitingOnPromise = false;

      // Sending Accept requests now.
      server.peers.forEach(function(peer) {
        if (paxos.serverIdToState(peer) !== paxos.SERVER_STATE.ACCEPTOR) {
          return;
        }
        sendRequest(model, {
          from: server.id,
          to: peer,
          type: 'accept',
          term: server.term,
          value: server.proposeValue,
        });
      });
    }
  }
}

/* End proposer implementation. */

/* Start Paxos Acceptor Implementation */

var handlePrepareMessage = function(model, server, proposalMsg) {
  // send message from proposer to acceptor
  // term check
  if (proposalMsg.term < server.previousTerm ) {
    return;
  }
  
  server.previousTerm = proposalMsg.term;

  // send reply (prepare reply = promise)
  sendReply(model, proposalMsg, {
    type: paxos.MESSAGE_TYPE.PROMISE,
    previouslyAcceptedTerm: -1,
  });
}

var handleMessageAcceptor = function(model, server, message) {
  // proposal message from proposer
  if (message.type == paxos.MESSAGE_TYPE.PREPARE) {
    handlePrepareMessage(model, server, message);
  }
  /*
  // proposal acknowledgement message from acceptor
  else if (message.messageState == MESSAGE_STATE.PROMISE) {
    handlePromiseMessage(model, server, message);
  }
  // proposal message to acceptors to accept the value
  else if (message.messageState == MESSAGE_STATE.ACCEPT_RQ) {
    handleAcceptRequestMessage(model, server, message);
  }
  // else an 'ACCEPT', where acceptor sends message to proposers and learners
  else {
    handleAcceptMessage(model, server, message);
  }*/
}

/* End acceptor implementation. */

// Public function.
paxos.update = function(model) {
  model.servers.forEach(function(server) {
    // Paxos.
    switch (paxos.serverIdToState(server.id)) {
      case paxos.SERVER_STATE.PROPOSER:
        handleProposerUpdate(model, server);
        break;

      case paxos.SERVER_STATE.ACCEPTOR:
        // handleAcceptorUpdate(model, server);
        break;

      case paxos.SERVER_STATE.LEARNER:
        // handleLearnerUpdate(model, server);
        break;

      default:
        // Unknown.
        break;
    }
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
paxos.stop = function(model, server) {
  server.state = 'stopped';
  server.electionAlarm = 0;
};

// Public function.
paxos.resume = function(model, server) {
  server.state = 'follower';
  server.electionAlarm = makeElectionAlarm(model.time);
};

// Public function.
paxos.resumeAll = function(model) {
  model.servers.forEach(function(server) {
    paxos.resume(model, server);
  });
};

paxos.restart = function(model, server) {
  paxos.stop(model, server);
  paxos.resume(model, server);
};

paxos.drop = function(model, message) {
  model.messages = model.messages.filter(function(m) {
    return m !== message;
  });
};

paxos.timeout = function(model, server) {
  server.state = 'follower';
  server.electionAlarm = 0;
  rules.startNewElection(model, server);
};

// Public function but may be paxos specific.
paxos.clientRequest = function(model, server) {
  if (server.state == 'leader') {
    server.log.push({term: server.term,
                     value: 'v'});
  }
};

// Public function.
paxos.spreadTimers = function(model) {
  var timers = [];
  model.servers.forEach(function(server) {
    if (server.electionAlarm > model.time &&
        server.electionAlarm < util.Inf) {
      timers.push(server.electionAlarm);
    }
  });
  timers.sort(util.numericCompare);
  if (timers.length > 1 &&
      timers[1] - timers[0] < paxos.MAX_RPC_LATENCY) {
    if (timers[0] > model.time + paxos.MAX_RPC_LATENCY) {
      model.servers.forEach(function(server) {
        if (server.electionAlarm == timers[0]) {
          server.electionAlarm -= paxos.MAX_RPC_LATENCY;
          console.log('adjusted S' + server.id + ' timeout forward');
        }
      });
    } else {
      model.servers.forEach(function(server) {
        if (server.electionAlarm > timers[0] &&
            server.electionAlarm < timers[0] + paxos.MAX_RPC_LATENCY) {
          server.electionAlarm += paxos.MAX_RPC_LATENCY;
          console.log('adjusted S' + server.id + ' timeout backward');
        }
      });
    }
  }
};

// Public function.
paxos.alignTimers = function(model) {
  paxos.spreadTimers(model);
  var timers = [];
  model.servers.forEach(function(server) {
    if (server.electionAlarm > model.time &&
        server.electionAlarm < util.Inf) {
      timers.push(server.electionAlarm);
    }
  });
  timers.sort(util.numericCompare);
  model.servers.forEach(function(server) {
    if (server.electionAlarm == timers[1]) {
      server.electionAlarm = timers[0];
      console.log('adjusted S' + server.id + ' timeout forward');
    }
  });
};

// Pubilc method but may be paxos specific.
paxos.setupLogReplicationScenario = function(model) {
  var s1 = model.servers[0];
  paxos.restart(model, model.servers[1]);
  paxos.restart(model, model.servers[2]);
  paxos.restart(model, model.servers[3]);
  paxos.restart(model, model.servers[4]);
  paxos.timeout(model, model.servers[0]);
  rules.startNewElection(model, s1);
  model.servers[1].term = 2;
  model.servers[2].term = 2;
  model.servers[3].term = 2;
  model.servers[4].term = 2;
  model.servers[1].votedFor = 1;
  model.servers[2].votedFor = 1;
  model.servers[3].votedFor = 1;
  model.servers[4].votedFor = 1;
  s1.voteGranted = util.makeMap(s1.peers, true);
  paxos.stop(model, model.servers[2]);
  paxos.stop(model, model.servers[3]);
  paxos.stop(model, model.servers[4]);
  rules.becomeLeader(model, s1);
  paxos.clientRequest(model, s1);
  paxos.clientRequest(model, s1);
  paxos.clientRequest(model, s1);
};

/* End paxos algorithm logic */

})();
