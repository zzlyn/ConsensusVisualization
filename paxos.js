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
paxos.NUM_PROPOSERS = 1;
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
  CLIENT_RQ: 'ClientRequest',
  PREPARE: 'prepare_msg',
  PROMISE: 'promise_msg',
  ACCEPT_RQ: 'accept_request_msg',
  ACCEPTED: 'accept_msg',
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
  if (state === SERVER_STATE.PROPOSER) {
    return 'green';
  }

  if (state === SERVER_STATE.ACCEPTOR) {
    return 'blue';
  }

  if (state === SERVER_STATE.LEARNER) {
    return 'yellow';
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
  };

  // Proposer Specific Attributes.
  if (serverAttrs.state === SERVER_STATE.PROPOSER) {
    serverAttrs.shouldSendPrepare = true; // Bug: Client doesn't send anything now.
    serverAttrs.grantedPromises = 0;
    serverAttrs.proposing = false; // need to set this back to false when implementing ACCEPTED message from acceptor
  }

  // Acceptor Specific Attributes.
  if (serverAttrs.state === SERVER_STATE.ACCEPTOR) {
    serverAttrs.previousTerm = -1;
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

//send request from client to proposer
paxos.sendClientRequest = function(model, server, proposer) {
  var group = util.groupServers(model);
  var clientId = group[0][0].id;
  var proposers = group[1];
  proposers.forEach(function(proposers){
    sendRequest(model, {
      from: clientId,
      to: proposers.id,
      type: 'ClientRequest'});
  });
};

rules.sendAppendEntries = function(model, server, peer) {
  if (server.state == 'leader' &&
      (server.nextIndex[peer] <= server.log.length &&
        server.rpcDue[peer] <= model.time)) {
    var prevIndex = server.nextIndex[peer] - 1;
    var lastIndex = Math.min(prevIndex + BATCH_SIZE,
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

var handleAppendEntriesRequest = function(model, server, request) {
  var success = false;
  var matchIndex = 0;
  if (server.term < request.term)
    stepDown(model, server, request.term);
  if (server.term == request.term) {
    server.state = 'follower';
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
  switch(serverIdToState(server.id)) {
    case SERVER_STATE.PROPOSER:
      handleMessageProposer(model, server, message);
      break;

    case SERVER_STATE.ACCEPTOR:
      handleMessageAcceptor(model, server, message);
      break;

    case SERVER_STATE.LEARNER:
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
  if (message.type == MESSAGE_TYPE.CLIENT_RQ){
    if(!server.proposing){
      server.shouldSendPrepare = true;
      server.proposing = true;
    }
  }
  if (server.waitingOnPromise) {
    if (message.type === MESSAGE_TYPE.PROMISE) {
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
        if (serverIdToState(peer) !== SERVER_STATE.ACCEPTOR) {
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
    type: MESSAGE_TYPE.PROMISE,
    previouslyAcceptedTerm: -1,
  });
}

var handleMessageAcceptor = function(model, server, message) {
  // proposal message from proposer
  if (message.type == MESSAGE_TYPE.PREPARE) {
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
    switch (serverIdToState(server.id)) {
      case SERVER_STATE.PROPOSER:
        handleProposerUpdate(model, server);
        break;

      case SERVER_STATE.ACCEPTOR:
        // handleAcceptorUpdate(model, server);
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
  server.state = 'stopped';
};

// Public function.
paxos.resume = function(model, server) {
  server.state = 'follower';
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

paxos.clientRequest = function(model, server) {
  if (server.state == 'leader') {
    server.log.push({term: server.term,
                     value: 'v'});
  }
};

paxos.setupLogReplicationScenario = function(model) {
  var s1 = model.servers[0];
  paxos.restart(model, model.servers[1]);
  paxos.restart(model, model.servers[2]);
  paxos.restart(model, model.servers[3]);
  paxos.restart(model, model.servers[4]);
  paxos.timeout(model, model.servers[0]);
  model.servers[1].term = 2;
  model.servers[2].term = 2;
  model.servers[3].term = 2;
  model.servers[4].term = 2;
  paxos.stop(model, model.servers[2]);
  paxos.stop(model, model.servers[3]);
  paxos.stop(model, model.servers[4]);
  paxos.clientRequest(model, s1);
  paxos.clientRequest(model, s1);
  paxos.clientRequest(model, s1);
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
  cx: 210,
  cy: 210,
  r: 150,
};

var columnSpec = {
  cx: 210,
  cy: 160,
  xGap: 100,
  yGap: 90,
};

var serverSpec = function(id,model) {
  var coord = util.verticalCoord(model.servers[id-1].state,util.serverIdtoNumInGroup(id,model),
                                 columnSpec.xGap,columnSpec.yGap,columnSpec.cx,columnSpec.cy,
                                 paxos.NUM_PROPOSERS,paxos.NUM_ACCEPTORS,paxos.NUM_LEARNERS);               
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

var termColors = [
  '#66c2a5',
  '#fc8d62',
  '#8da0cb',
  '#e78ac3',
  '#a6d854',
  '#ffd92f',
];

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
paxos.getLeader = function() {
  var leader = null;
  var term = 0;
  state.current.servers.forEach(function(server) {
    if (server.state == 'leader' &&
        server.term > term) {
        leader = server;
        term = server.term;
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
  $('.modal-body', m)
    .empty()
    .append($('<dl class="dl-horizontal"></dl>')
      .append(li('state', server.state))
      .append(li('currentTerm', server.term))
      .append(li('commitIndex', server.commitIndex))
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
      .append(li('term', message.term));
  if (message.type == 'AppendEntries') {
    if (message.direction == 'request') {
      var entries = '[' + message.entries.map(function(e) {
            return e.term;
      }).join(' ') + ']';
      fields.append(li('prevIndex', message.prevIndex));
      fields.append(li('prevTerm', message.prevTerm));
      fields.append(li('entries', entries));
      fields.append(li('commitIndex', message.commitIndex));
    } else {
      fields.append(li('success', message.success));
      fields.append(li('matchIndex', message.matchIndex));
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
              (server.state == 'stopped' ? 'gray'
                : termColors[server.term % termColors.length]));
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
paxos.appendServerInfo = function(state, svg) {
  state.current.servers.forEach(function(server) {
    var s = serverSpec(server.id,state.current);
    $('#servers', svg).append(
      util.SVG('g')
        .attr('id', 'server-' + server.id)
        .attr('class', 'server')
        .append(util.SVG('text')
                  .attr('class', 'serverid')
                  .text('S' + server.id)
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
  var leader = paxos.getLeader();
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
    if (leader !== null && leader != server) {
      log.append(
        util.SVG('circle')
          .attr('title', 'match index')//.tooltip({container: 'body'})
          .attr({cx: logEntrySpec(leader.matchIndex[server.id] + 1).x,
                 cy: logSpec.y + logSpec.height,
                 r: 5}));
      var x = logEntrySpec(leader.nextIndex[server.id] + 0.5).x;
    }
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
                        (message.recvTime - message.sendTime),state.current);
    $('#message-' + i + ' circle', messagesGroup)
      .attr(s);
    /* Refer to this later to differentiate messages
    if (message.direction == 'reply') {
      var dlist = [];
      dlist.push('M', s.cx - s.r, comma, s.cy,
                 'L', s.cx + s.r, comma, s.cy);
      if (message.type == 'AppendEntries' && message.success) {
         dlist.push('M', s.cx, comma, s.cy - s.r,
                    'L', s.cx, comma, s.cy + s.r);
      }
      $('#message-' + i + ' path.message-success', messagesGroup)
        .attr('d', dlist.join(' '));
    } */
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
