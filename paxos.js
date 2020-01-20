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
paxos.NUM_CLIENTS = 1;
paxos.NUM_PROPOSERS = 2;
paxos.NUM_ACCEPTORS = 3;
paxos.NUM_LEARNERS = 1;

// Public Variable.
paxos.NUM_SERVERS = paxos.NUM_CLIENTS + paxos.NUM_PROPOSERS + paxos.NUM_ACCEPTORS + paxos.NUM_LEARNERS;

// Use these utils to identify server state.
const SERVER_STATE = {
  CLIENT: 'client',
  PROPOSER: 'proposer',
  ACCEPTOR: 'acceptor',
  LEARNER: 'learner',
  UNKNOWN: 'unknown',
}

const MESSAGE_TYPE = {
  CLIENT_RQ: 'client_request',
  CLIENT_REPLY: 'client_reply',
  PREPARE: 'prepare_msg',
  PROMISE: 'promise_msg',
  ACCEPT: 'accept_msg',
  ACCEPTED: 'accepted_msg',
}

var messageTypeToText = function(type) {
  switch(type) {
    case MESSAGE_TYPE.CLIENT_RQ:
      return "Client Request";

    case MESSAGE_TYPE.CLIENT_REPLY:
      return "Client Reply";
         
    case MESSAGE_TYPE.PREPARE:
      return "Prepare";

    case MESSAGE_TYPE.PROMISE:
      return "Promise";

    case MESSAGE_TYPE.ACCEPT:
      return "Accept";

    case MESSAGE_TYPE.ACCEPTED:
      return "Accepted";
  }

  return "Unknown";
}

// Proposer specific phases.
const PROPOSER_PHASE = {
  INACTIVE: 'inactive',
  SEND_PREPARE: 'send_prepare',
  WAIT_PROMISE: 'wait_promise',
  WAIT_ACCEPTED: 'wait_accepted',
}

// Translate ID in range [1, NUM_SERVERS] to server state. Returns
// UNKNOWN if ID is out of bound.
var serverIdToState = function(id) {
  if (id <= 0 || id > paxos.NUM_SERVERS) {
    return SERVER_STATE.UNKNOWN;
  }

  if (id <= paxos.NUM_CLIENTS) {
    return SERVER_STATE.CLIENT;
  }

  if (id <= paxos.NUM_CLIENTS + paxos.NUM_PROPOSERS) {
    return SERVER_STATE.PROPOSER;
  }

  if (id <= paxos.NUM_CLIENTS + paxos.NUM_PROPOSERS + paxos.NUM_ACCEPTORS) {
    return SERVER_STATE.ACCEPTOR;
  }

  return SERVER_STATE.LEARNER;
}

// Define color per server state. Returns 'black' for unknown state.
// (TODO: tune the colors to look smoother.)
var serverStateToColor = function(state) {
  if (state === SERVER_STATE.CLIENT) {
    return '#BBB5A4';
  }

  if (state === SERVER_STATE.PROPOSER) {
    return '#AC8295';
  }

  if (state === SERVER_STATE.ACCEPTOR) {
    return '#4D243D';
  }

  if (state === SERVER_STATE.LEARNER) {
    return '#F4EEE1';
  }

  return 'black'; // UNKNOWN.
}

var serverIdToColor = function(id) {
  return serverStateToColor(serverIdToState(id));
}

// Public API: server object.
paxos.server = function(id, peers) {

  let serverAttrs = {
    id: id,
    state: serverIdToState(id), //some online searches say a server can take multiple states
    peers: peers,
    maxPropNum: 0,  //this server promises to not allow proposals with proposalNum less than maxPropNum

    // following variables show the currently accepted proposal num and value
    acceptedProposalNum: -1,  //initially -1. If this is -1 then nothing was ever accepted and thus the acceptedProposalVal is invalid
    acceptedProposalVal: 'default', //can only use this value if acceptedProposalID !== 0

    peers: peers,
    term: 1,
    log: [],
    commitIndex: 0,
    matchIndex:   util.makeMap(peers, 0),
    nextIndex:    util.makeMap(peers, 1),
    rpcDue:       util.makeMap(peers, 0),
    stopped: false,
  };

  // Proposer Specific Attributes.
  if (serverAttrs.state === SERVER_STATE.PROPOSER) {
    serverAttrs.phase = PROPOSER_PHASE.INACTIVE;
    // For proposal value replacement.
    serverAttrs.largestAcceptedTerm = -1;
    // For WAIT_PROMISE phase.
    serverAttrs.grantedPromises = 0;
    // For WAIT_ACCEPTED phase.
    serverAttrs.grantedAccepts = 0;
    serverAttrs.proposeValue = null;
  }

  // Acceptor Specific Attributes.
  if (serverAttrs.state === SERVER_STATE.ACCEPTOR) {
    // Determine how to respond to promise messages.
    serverAttrs.promisedTerm = -1;
    // Take care of accept (phase 2) logic.
    serverAttrs.hasAccepted = false;
    serverAttrs.acceptedTerm = -1;
    serverAttrs.acceptedValue = null;
  }
  
  // Learner Specific Attributes.
  if (serverAttrs.state === SERVER_STATE.LEARNER) {
    serverAttrs.acceptedLog = {};
    serverAttrs.learnedValue = null;
  }

  return serverAttrs;
};

var MIN_RPC_LATENCY = 10000;
var MAX_RPC_LATENCY = 15000;
var BATCH_SIZE = 1;

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

paxos.latestTerm = 0;

//send request from client to proposer
paxos.sendClientRequest = function(model, server, proposer) {
  // Prompt proposer number.
  let proposerNumber = window.prompt('Send to which proposer?', '1');
  if (proposerNumber == null) return;
  if (proposerNumber <= 0 || proposerNumber > paxos.NUM_PROPOSERS) {
    window.alert("Invalid Proposer Number, should be between (0, " + paxos.NUM_PROPOSERS + "].");
    return;
  }
  
  // Prompt proposing term.
  let proposingTerm = window.prompt('Please give a term number:', paxos.latestTerm);
  if (proposingTerm == null) return;
  
  // Prompt proposing value.
  let proposingValue = window.prompt('Please give a proposing value:', 'abc');
  if (proposingValue == null) return;

  // Ready to suggest next term to be latest term + 1.
  if (parseInt(proposingTerm, 10) >= paxos.latestTerm) {
    paxos.latestTerm = parseInt(proposingTerm, 10) + 1;
  }
  
  var group = util.groupServers(model);
  var clientId = group[0][0].id;
  var proposer = group[1][proposerNumber - 1];
  sendRequest(model, {
    from: clientId,
    to: proposer.id,
    type: MESSAGE_TYPE.CLIENT_RQ,
    term: proposingTerm,
    value: proposingValue,
  });
};

//send request from client to proposer
paxos.sendClientRequest2 = function(model, term, target, value) {
  if (target <= 0 || target > paxos.NUM_PROPOSERS) {
    window.alert("Invalid Proposer Number, should be between (0, " + paxos.NUM_PROPOSERS + "].");
    return;
  }
  
  // Ready to suggest next term to be latest term + 1.
  if (parseInt(term, 10) >= paxos.latestTerm) {
    paxos.latestTerm = parseInt(term, 10) + 1;
  }
  
  var group = util.groupServers(model);
  var clientId = group[0][0].id;
  var proposer = group[1][target - 1];
  sendRequest(model, {
    from: clientId,
    to: proposer.id,
    type: MESSAGE_TYPE.CLIENT_RQ,
    term: term,
    value: value,
  });
};

var handleMessage = function(model, server, message) {
  if(server.stopped){
    return;
  }
  switch(serverIdToState(server.id)) {
    case SERVER_STATE.PROPOSER:
      handleMessageProposer(model, server, message);
      break;

    case SERVER_STATE.ACCEPTOR:
      handleMessageAcceptor(model, server, message);
      break;

    case SERVER_STATE.LEARNER:
      handleMessageLearner(model, server, message);
      break;

    default:
      // Unknown.
      break;
  }
};

/* Start Paxos Proposer Implementation. */

var handleMessageProposer = function(model, server, message) {
  // Initiate proposer to be active.
  if (message.type == MESSAGE_TYPE.CLIENT_RQ){
    if(server.phase === PROPOSER_PHASE.INACTIVE){
      server.phase = PROPOSER_PHASE.SEND_PREPARE;
      // Take proposing term and value from client request.
      server.term = message.term;
      server.proposeValue = message.value;
    }
  }

  // Prepare sent, waiting on promise.
  if (server.phase === PROPOSER_PHASE.WAIT_PROMISE) {
    if (message.type === MESSAGE_TYPE.PROMISE) {
      // Acceptor has previously accepted another value with a smaller
      // term number. This proposer will try to propose for that value
      // instead of its original value.
      //
      // The initial acceptor.promisedTerm is set to '-1' so this replacement
      // is guaranteed to happen if there was a legit accepted value.
      // 
      // For Acceptors, previouslyAcceptedTerm and previouslyAcceptedValue
      // should be set/unset together.
      if (message.previouslyAcceptedTerm > server.largestAcceptedTerm ) {
        server.largestAcceptedTerm = message.previouslyAcceptedTerm;
        server.proposeValue = message.previouslyAcceptedValue;
      }
      server.grantedPromises += 1;
    }
  }

  // Accept requests sent, waiting on replies.
  if (server.phase === PROPOSER_PHASE.WAIT_ACCEPTED) {
    if (message.type === MESSAGE_TYPE.ACCEPTED) {
      // According to phase 2b on https://en.wikipedia.org/wiki/Paxos_(computer_science), 
      // ACCEPTED replies will only be sent if acceptor has truly accepted the request.
      // 
      // To elaborate a bit further, if acceptor has previously promised another value with
      // term greater than this proposer's term, it would simply ignore the accept request.
      // Therefore, we can assume that upon receiving an ACCEPTED message, the proposer
      // won't be participating in the algorithm further. We will increment an internal
      // counter that is used only to reset this proposer.
      server.grantedAccepts += 1;
    }
  }
}

var resetProposer = function(server) {
  server.phase = PROPOSER_PHASE.INACTIVE;
  server.grantedPromises = 0;
  server.grantedAccepts = 0;
}

var handleProposerUpdate = function(model, server) {
  // Prepare phase.
  if (server.phase === PROPOSER_PHASE.SEND_PREPARE) {
    server.peers.forEach(function(peer) {
      if (serverIdToState(peer) !== SERVER_STATE.ACCEPTOR) {
        return; // Only propose to acceptors.
      }
      sendRequest(model, {
        from: server.id,
        to: peer,
        type: MESSAGE_TYPE.PREPARE,
        term: server.term,
      });
    });
    server.phase = PROPOSER_PHASE.WAIT_PROMISE;  // Enter next phase.
    // Used to compare & choose the largest accepted value to
    // propose instead in the next phase.
    server.largestAcceptedTerm = -1; 
    return;
  }

  // Prepare -> accept phase transition check.
  if (server.phase === PROPOSER_PHASE.WAIT_PROMISE) {
    if (server.grantedPromises > paxos.NUM_ACCEPTORS / 2) {
      // Server has quorum. First fire off the accept requests, then enter
      // next phase to wait for accepted responses.
      //
      // The order of operation does not really matter here due to the 
      // fact that this method is executed each frame and race condition
      // becomes impossible.
      server.peers.forEach(function(peer) {
        if (serverIdToState(peer) !== SERVER_STATE.ACCEPTOR) {
          return;
        }

        sendRequest(model, {
          from: server.id,
          to: peer,
          type: MESSAGE_TYPE.ACCEPT,
          term: server.term,
          value: server.proposeValue,
        });
      });
      server.phase = PROPOSER_PHASE.WAIT_ACCEPTED;
    }
  }

  // Accpet phase. Waiting on quorum of accepted replies for reset.
  if (server.phase === PROPOSER_PHASE.WAIT_ACCEPTED) {
    if (server.grantedAccepts > paxos.NUM_ACCEPTORS / 2) {
      resetProposer(server);
    }
  }
}

/* End proposer implementation. */

/* Start Paxos Acceptor Implementation */

var handlePrepareMessage = function(model, server, proposalMsg) {
  // handes the PREPARE message that this (acceptor) server received from proposer
  // term check
  if (proposalMsg.term < server.promisedTerm ) {
    return;
  }
  
  // Promise to ignore other requests with term number smaller than this.
  server.promisedTerm = proposalMsg.term;

  let messageSpec = { type: MESSAGE_TYPE.PROMISE, term: server.promisedTerm };
  // Fill in these if acceptor has accepted something before.
  if (server.hasAccepted) {
    messageSpec.previouslyAcceptedTerm = server.acceptedTerm;
    messageSpec.previouslyAcceptedValue = server.acceptedValue;
  }

  // send reply (prepare reply = promise)
  sendReply(model, proposalMsg, messageSpec);
}

var handleAcceptMessage = function(model, server, acceptMsg) {
  // handes the ACCEPT message that this (acceptor) server received from proposer
  // term check
  if (acceptMsg.term < server.promisedTerm ) {
    return;
  }

  // else we have accepted the value
  server.hasAccepted = true;

  // Register accepted term & value
  // This line can be reached even if acceptor has accepted something in the past already.
  server.acceptedTerm = acceptMsg.term;
  server.acceptedValue = acceptMsg.value;

  // send reply (accept reply = broadcast to all proposers and learners)
  // look into the server's peers and ignore if they are acceptors
  server.peers.forEach(function(peer) {
    if (serverIdToState(peer) == SERVER_STATE.ACCEPTOR || serverIdToState(peer) == SERVER_STATE.CLIENT) {
      return;
    }

    // Skip reply if peer proposer is not sender of accept request.
    if (serverIdToState(peer) == SERVER_STATE.PROPOSER
        && peer !== acceptMsg.from) {
      return;
    }

    // cant use sendReply because we have to send to learner also, thus sendMessage()
    sendMessage(model, {
      from: server.id,
      to: peer,
      type: MESSAGE_TYPE.ACCEPTED,
      term: server.acceptedTerm,
      value: server.acceptedValue,
    });
  });
}

var handleMessageAcceptor = function(model, server, message) {
  // proposal message from proposer
  if (message.type == MESSAGE_TYPE.PREPARE) {
    handlePrepareMessage(model, server, message);
  }

  if (message.type == MESSAGE_TYPE.ACCEPT) {
    handleAcceptMessage(model, server, message);
  }
}

/* End acceptor implementation. */

var handleMessageLearner = function(model, server, message) {
  // Already decided one value in this round of Paxos.
  if (server.learnedValue !== null) {
    return;
  }
  if (message.type == MESSAGE_TYPE.ACCEPTED) {
    var key = [message.term, message.value];
    if(server.acceptedLog[key] == undefined){
      server.acceptedLog[key] = 1;
    } else {
      server.acceptedLog[key] += 1; 
    }
    if(server.acceptedLog[key] > paxos.NUM_ACCEPTORS /2){
      //majority of accepted message received.
      server.learnedValue = message.value;
      server.term = message.term;
      server.acceptedLog = {};
      sendMessage(model, {
        from: message.to,
        to: util.groupServers(state.current)[0][0].id,
        type: MESSAGE_TYPE.CLIENT_REPLY,
        value: server.learnedValue,
        term: server.term,
      });
    }
  }
}

// Public function.
paxos.update = function(model) {
  model.servers.forEach(function(server) {
    // Paxos.
    switch (serverIdToState(server.id)) {
      case SERVER_STATE.PROPOSER:
        handleProposerUpdate(model, server);
        break;

      case SERVER_STATE.ACCEPTOR:
        //handleAcceptorUpdate(model, server);
        break;

      case SERVER_STATE.LEARNER:
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
  server.stopped = true;
};

// Public function.
paxos.resume = function(model, server) {
  server.stopped = false;
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

paxos.clientRequest = function(modal, server) {
  if (server.state === SERVER_STATE.CLIENT) {
    let term = parseInt(document.getElementById('client-term').value, 10);
    if (isNaN(term)) {
      window.alert("failed to send request: term number is invalid");
      return;
    }
    let target = parseInt(document.getElementById('client-target').value, 10);
    if (isNaN(target)) {
      window.alert("failed to send request: target proposer number is invalid");
      return;
    }
    let value = document.getElementById('client-value').value;
    if (value == '') {
      window.alert("failed to send request: value input required");
      return;
    }
    paxos.sendClientRequest2(modal, term, target, value);
  }
  if (server.state == 'leader') {
    server.log.push({term: server.term,
                     value: 'v'});
  }
};

/* End paxos algorithm logic */

/* Begin paxos-specific visualization */

var ARC_WIDTH = 5;

var comma = ',';

var logsSpec = {
  x: 430,
  y: 50,
  width: 320,
  height: 270,
};

var ringSpec = {
  cx: 500,
  cy: 210,
  r: 150,
};

var columnSpec = {
  cx: 380,
  cy: 160,
  xGap: 160,
  yGap: 100,
};

var serverSpec = function(id,model) {
  /*var coord = util.verticalCoord(model.servers[id-1].state,util.serverIdtoNumInGroup(id,model),
                                 columnSpec.xGap,columnSpec.yGap,columnSpec.cx,columnSpec.cy,
                                 paxos.NUM_PROPOSERS,paxos.NUM_ACCEPTORS,paxos.NUM_LEARNERS);*/

  var coord = util.paxosLayoutCoord((id-2) / (paxos.NUM_SERVERS - paxos.NUM_CLIENTS), model.servers[id-1].state,
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
  var totalDist  = Math.sqrt(Math.pow(toSpec.cx - fromSpec.cx, 2) +
                             Math.pow(toSpec.cy - fromSpec.cy, 2));
  var travel = totalDist - fromSpec.r - toSpec.r;
  frac = (fromSpec.r / totalDist) + frac * (travel / totalDist);
  return {
    cx: fromSpec.cx + (toSpec.cx - fromSpec.cx) * frac,
    cy: fromSpec.cy + (toSpec.cy - fromSpec.cy) * frac,
    r: MESSAGE_RADIUS,
  };
};

var messageArrowSpec = function(from, to, frac, model) {
  var fromSpec = serverSpec(from, model);
  var toSpec = serverSpec(to, model);
  // adjust frac so you start and end at the edge of servers
  var totalDist  = Math.sqrt(Math.pow(toSpec.cx - fromSpec.cx, 2) +
                             Math.pow(toSpec.cy - fromSpec.cy, 2));
  var travel = totalDist - fromSpec.r - toSpec.r;
  var fracS = ((fromSpec.r + MESSAGE_RADIUS)/ totalDist) +
               frac * (travel / totalDist);
  var fracH = ((fromSpec.r + 2*MESSAGE_RADIUS)/ totalDist) +
               frac * (travel / totalDist);
  return [
    'M', fromSpec.cx + (toSpec.cx - fromSpec.cx) * fracS, comma,
         fromSpec.cy + (toSpec.cy - fromSpec.cy) * fracS,
    'L', fromSpec.cx + (toSpec.cx - fromSpec.cx) * fracH, comma,
         fromSpec.cy + (toSpec.cy - fromSpec.cy) * fracH,
  ].join(' ');
};

var serverActions = [
  ['stop', paxos.stop],
  ['resume', paxos.resume],
  ['restart', paxos.restart],
  ['time out', paxos.timeout],
  ['request', paxos.clientRequest],
];

var messageActions = [
  ['drop', paxos.drop],
];

// Public method but may be specific to paxos Only.

var fillClientModalBody = function(m, server, li) {
  $('.modal-body', m)
    .empty()
    .append($('<dl class="dl-horizontal"></dl>')
      .append(li('state', server.state))
      .append('<dt>term</dt><input id="client-term" type="text" class="client-input"><br>')  // Client term.
      .append('<dt>proposer #</dt><input id="client-target" type="text" class="client-input"><br>')  // Client target proposer.
      .append('<dt>value</dt><input id="client-value" type="text" class="client-input"><br>')  // Client target proposer.
    )
    document.getElementById('client-term').value = paxos.latestTerm;  // default to next term.
    document.getElementById('client-target').value = '1';  // default to first proposer.
    document.getElementById('client-value').value = 'abc';  // default to a sample value.
}

var fillProposerModalBody = function(m, server, li) {
  $('.modal-body', m)
    .empty()
    .append($('<dl class="dl-horizontal"></dl>')
      .append(li('state', server.state))
      .append(li('current term', server.term))
      .append(li('proposing value', server.proposeValue))
    );
}

var fillAcceptorModalBody = function(m, server, li) {
  $('.modal-body', m)
    .empty()
    .append($('<dl class="dl-horizontal"></dl>')
      .append(li('state', server.state))
      .append(li('promised term', server.promisedTerm))
      .append(li('accepted term', server.acceptedTerm))
      .append(li('accpeted value', server.acceptedValue))
    );
}

var fillLearnerModalBody = function(m, server, li) {
  $('.modal-body', m)
    .empty()
    .append($('<dl class="dl-horizontal"></dl>')
      .append(li('state', server.state))
      .append(li('learned value', server.learnedValue))
    );
}

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
      .append('<th>next index</th>')
      .append('<th>match index</th>')
      .append('<th>RPC due</th>')
    );
  server.peers.forEach(function(peer) {
    peerTable.append($('<tr></tr>')
      .append('<td>S' + peer + '</td>')
      .append('<td>' + server.nextIndex[peer] + '</td>')
      .append('<td>' + server.matchIndex[peer] + '</td>')
      .append('<td>' + util.relTime(server.rpcDue[peer], model.time) + '</td>')
    );
  });
  if (server.state === SERVER_STATE.CLIENT) {
    fillClientModalBody(m, server, li);
  }
  // Append Proposer specific states to server model menu.
  if (server.state === SERVER_STATE.PROPOSER) {
    fillProposerModalBody(m, server, li);
  }
  // Append Acceptor specific states.
  if (server.state === SERVER_STATE.ACCEPTOR) {
    fillAcceptorModalBody(m, server, li);
  }
  // Append Learner specific states.
  if (server.state === SERVER_STATE.LEARNER) {
    fillLearnerModalBody(m, server, li);
  }
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

var fillClientRequestFields = function(message, fields, li) {
  fields.append(li('propose term', message.term));
  fields.append(li('propose value', message.value));
}

var fillPrepareMessageFields = function(message, fields, li) {
  fields.append(li('term', message.term));
}

var fillPromiseMessageFields = function(message, fields, li) {
  fields.append(li('term', message.term));
  if (message.previouslyAcceptedTerm != null) {
    fields.append(li('previous term', message.previouslyAcceptedTerm));
    fields.append(li('previous value', message.previouslyAcceptedValue));
  }
}

var fillAcceptMessageFields = function(message, fields, li) {
  fields.append(li('propose term', message.term));
  fields.append(li('propose value', message.value));
}

var fillAcceptedMessageFields = function(message, fields, li) {
  fields.append(li('accpeted term', message.term));
  fields.append(li('accpeted value', message.value));
}

var fillClientReplyFields = function(message, fields, li) {
  fields.append(li('decided value', message.value));
  fields.append(li('from term', message.term));
}

var messageModal = function(model, message) {
  var m = $('#modal-details');
  $('.modal-dialog', m).removeClass('modal-lg').addClass('modal-sm');
  $('.modal-title', m).text(messageTypeToText(message.type));
  var li = function(label, value) {
    return '<dt>' + label + '</dt><dd>' + value + '</dd>';
  };
  var fields = $('<dl class="dl-horizontal"></dl>')
      .append(li('from', serverIdToText(message.from)))
      .append(li('to', serverIdToText(message.to)))
      .append(li('sent', util.relTime(message.sendTime, model.time)))
      .append(li('deliver', util.relTime(message.recvTime, model.time)));
  switch(message.type) {
    case MESSAGE_TYPE.CLIENT_RQ:
      fillClientRequestFields(message, fields, li);
      break;

    case MESSAGE_TYPE.PREPARE:
      fillPrepareMessageFields(message, fields, li);
      break;

    case MESSAGE_TYPE.PROMISE:
      fillPromiseMessageFields(message, fields, li);
      break;

    case MESSAGE_TYPE.ACCEPT:
      fillAcceptMessageFields(message, fields, li);
      break;

    case MESSAGE_TYPE.ACCEPTED:
      fillAcceptedMessageFields(message, fields, li);
      break;

    case MESSAGE_TYPE.CLIENT_REPLY:
      fillClientReplyFields(message, fields, li);
      break;
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
paxos.render = {};

// Public function.
paxos.render.ring = function(svg) {
  $('#pause').attr('transform',
    'translate(' + ringSpec.cx + ', ' + ringSpec.cy + ') ' +
    'scale(' + ringSpec.r / 3.5 + ')');

  $('#ring', svg).attr(ringSpec);
}

// Public function.
paxos.render.servers = function(serversSame, svg) {
  state.current.servers.forEach(function(server) {
    var serverNode = $('#server-' + server.id, svg);
    if (!serversSame) {
      $('text.term', serverNode).text(server.term);
      serverNode.attr('class', 'server ' + server.state);
      $('circle.background', serverNode)
        .attr('style', 'fill: ' +
              (server.stopped == true ? 'gray'
                : serverIdToColor(server.id)));
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

var serverIdToText = function(id) {
  let state = serverIdToState(id);
  if (state === SERVER_STATE.CLIENT) {
    return 'C' + id;
  }
  if (state === SERVER_STATE.PROPOSER) {
    return 'P' + (id - paxos.NUM_CLIENTS);
  }
  if (state === SERVER_STATE.ACCEPTOR) {
    return 'A' + (id - paxos.NUM_CLIENTS - paxos.NUM_PROPOSERS);
  }
  if (state === SERVER_STATE.LEARNER) {
    return 'L' + (id - paxos.NUM_CLIENTS - paxos.NUM_PROPOSERS - paxos.NUM_ACCEPTORS);
  }
  return '?';  // Unknown.
}

// Public API.
paxos.appendServerInfo = function(state, svg) {
  state.current.servers.forEach(function(server) {
    var s = serverSpec(server.id,state.current);
    $('#servers', svg).append(
      util.SVG('g')
        .attr('id', 'server-' + server.id)
        .attr('class', 'server')
        .append(util.SVG('text')
                  .attr('class', 'serverid')
                  .text(serverIdToText(server.id))
                  .attr({x: s.cx, y: s.cy - 40}))
        .append(util.SVG('a')
          .append(util.SVG('circle')
                    .attr('class', 'background')
                    .attr(s))
                    .attr('fill', serverIdToColor(server.id))
          .append(util.SVG('text')
                    .attr('class', 'term')
                    .attr({x: s.cx, y: s.cy}))
          ));
  });
}

// Public function.
paxos.render.entry = function(spec, entry, committed) {
  return util.SVG('g')
    .attr('class', 'entry ' + (committed ? 'committed' : 'uncommitted'))
    .append(util.SVG('rect')
      .attr(spec)
      .attr('stroke-dasharray', committed ? '1 0' : '5 5')
      .attr('style', 'fill: ' + termColors[entry.term % termColors.length]))
    .append(util.SVG('text')
      .attr({x: spec.x + spec.width / 2,
             y: spec.y + spec.height / 2})
      .text(entry.term));
};

// Public function.
paxos.render.logs = function(svg) {
  var LABEL_WIDTH = 25;
  var INDEX_HEIGHT = 25;
  var logsGroup = $('.logs', svg);
  logsGroup.empty();
  logsGroup.append(
    util.SVG('rect')
      .attr('id', 'logsbg')
      .attr(logsSpec));
  var height = (logsSpec.height - INDEX_HEIGHT) / paxos.NUM_SERVERS;
  var indexSpec = {
    x: logsSpec.x + LABEL_WIDTH + logsSpec.width * 0.05,
    y: logsSpec.y + 2*height/6,
    width: logsSpec.width * 0.9,
    height: 2*height/3,
  };
  var indexes = util.SVG('g')
    .attr('id', 'log-indexes');
  logsGroup.append(indexes);
  for (var index = 1; index <= 10; ++index) {
    var indexEntrySpec = {
      x: indexSpec.x + (index - 0.5) * indexSpec.width / 11,
      y: indexSpec.y,
      width: indexSpec.width / 11,
      height: indexSpec.height,
    };
    indexes
        .append(util.SVG('text')
          .attr(indexEntrySpec)
          .text(index));
  }
  state.current.servers.forEach(function(server) {
    var logSpec = {
      x: logsSpec.x + LABEL_WIDTH + logsSpec.width * 0.05,
      y: logsSpec.y + INDEX_HEIGHT + height * server.id - 5*height/6,
      width: logsSpec.width * 0.9,
      height: 2*height/3,
    };
    var logEntrySpec = function(index) {
      return {
        x: logSpec.x + (index - 1) * logSpec.width / 11,
        y: logSpec.y,
        width: logSpec.width / 11,
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
          .attr({x: logSpec.x - LABEL_WIDTH*4/5,
                 y: logSpec.y + logSpec.height / 2}));
    for (var index = 1; index <= 10; ++index) {
      log.append(util.SVG('rect')
          .attr(logEntrySpec(index))
          .attr('class', 'log'));
    }
    server.log.forEach(function(entry, i) {
      var index = i + 1;
        log.append(paxos.render.entry(
             logEntrySpec(index),
             entry,
             index <= server.commitIndex));
    });
  });
};

// Public function.
paxos.render.messages = function(messagesSame, svg) {
  var messagesGroup = $('#messages', svg);
  if (!messagesSame) {
    messagesGroup.empty();
    state.current.messages.forEach(function(message, i) {
      var a = util.SVG('a')
          .attr('id', 'message-' + i)
          .attr('class', 'message ' + message.direction + ' ' + message.type)
          .attr('title', message.type)
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
                        (message.recvTime - message.sendTime),state.current);
    $('#message-' + i + ' circle', messagesGroup)
      .attr(s);
    /*if (message.direction == 'reply') {
      var dlist = [];
      dlist.push('M', s.cx - s.r, comma, s.cy,
                 'L', s.cx + s.r, comma, s.cy);
      if ((message.type == MESSAGE_TYPE.PROMISE) ||
          (message.type == MESSAGE_TYPE.ACCEPTED)) {
         dlist.push('M', s.cx, comma, s.cy - s.r,
                    'L', s.cx, comma, s.cy + s.r);
      }
      $('#message-' + i + ' path.message-success', messagesGroup)
        .attr('d', dlist.join(' '));
    }*/
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

/* End paxos-specific visualization */

})();
