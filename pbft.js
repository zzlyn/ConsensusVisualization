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
pbft.NUM_SERVERS = 4;
var NUM_TOLERATED_BYZANTINE_FAULTS = 1;
console.assert((NUM_TOLERATED_BYZANTINE_FAULTS * 3 + 1)
               === pbft.NUM_SERVERS);

var RPC_TIMEOUT = 50000;
var MIN_RPC_LATENCY = 10000;
var MAX_RPC_LATENCY = 15000;
var VIEW_CHANGE_TIMEOUT = 100000;
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
  reply.type = request.type;
  reply.direction = 'reply';
  sendMessage(model, reply);
};

var logView = function(log, index) {
  // TODO
};

var rules = {};
pbft.rules = rules;

var makeViewChangeAlarm = function(now) {
  return now + (Math.random() + 1) * VIEW_CHANGE_TIMEOUT;
};

// Public API.
pbft.server = function(id, peers) {
  return {
    id: id,
    peers: peers,
    state: 'backup',
    view: 1,
    n: 1,
    log: [],
    viewChangeAlarm: util.Inf,
    viewChangeRequests: [],
    key: "k." + id,
    rpcDue: util.makeMap(peers, 0),
    sentNewView: util.makeMap(peers, false),
  };
};

var isPrepared = function(server, m, v, n, i) {

}

var isCommittedLocal = function(server, m, v, n, i) {

}

var isCommitted = function(server, m, v, n) {

}

var getLatestCheckpointProof = function(server) {
  return 0;
}

var getLatestCheckpointSequenceNumber = function(server) {
  return 0;
}

var getPrePreparedMessageProofs = function(server) {
  return 0;
}

// Check if server should start a view change, and if so prepare data members
// of server for the view change execution.
rules.startNewViewChange = function(model, server) {
  if ((server.state == 'backup'
       || server.state == 'changing-view'
       || server.state == 'candidate') &&
      server.viewChangeAlarm <= model.time) {
    var isNextPrimary = server.id == ((server.view + 1) % pbft.NUM_SERVERS);
    // No timeout, until 2f + 1 view change requests are received
    server.viewChangeAlarm = util.Inf;
    // This is read to indicate that the server is not accepting messages
    // other than VIEW-CHANGE, NEW-VIEW, or CHECKPOINT.
    server.state = isNextPrimary ? 'candidate' : 'changing-view';
    // Reset C ("a set of 2f + 1 valid CHECKPOINT messages proving the
    // correctness of s").
    server.checkpointProof = getLatestCheckpointProof(server);
    // Reset S which is a set of sets S_m for each message m that this server
    // has sent a PRE-PREPARE messgae for.
    server.prePreparedMessageProofs = getPrePreparedMessageProofs(server);

    // If server is the next primary, add its own view change request.
    if (isNextPrimary) {
      server.viewChangeRequests.push({
        from: server.id, // this is `i` described in PBFT paper.
        to: server.id,
        type: 'VIEW-CHANGE',
        v: server.view + 1,
        n: getLatestCheckpointSequenceNumber(server),
        C: server.checkpointProof,
        P: server.prePreparedMessageProofs,
      });
    }
  }
};

rules.sendPrePrepare = function(model, server, peer) {
  if (server.state == 'primary') {

  }
};

rules.sendPrepare = function(model, server, peer) {
  // TODO
};

rules.sendCommit = function(model, server, peer) {
  // TODO
};

rules.sendCheckpoint = function(model, server, peer) {
  // TODO
};

rules.sendViewChange = function(model, server, peer) {
  if (server.state == 'changing-view' &&
      server.rpcDue[peer] <= model.time) {
    server.rpcDue[peer] = model.time + RPC_TIMEOUT;
    sendRequest(model, {
      from: server.id, // this is `i` described in PBFT paper.
      to: peer,
      type: 'VIEW-CHANGE',
      v: server.view + 1,
      n: getLatestCheckpointSequenceNumber(server),
      C: server.checkpointProof,
      P: server.prePreparedMessageProofs,
    });
  }
};

rules.sendNewView = function(model, server, peer) {
  // Need to check rpcDue here?
  if ((server.state == 'candidate' &&
       (server.viewChangeRequests.length ==
        (2 * NUM_TOLERATED_BYZANTINE_FAULTS)))
      || ((server.state == 'primary') &&
          !server.sentNewView[peer])) { // Only send the NEW-VIEW message once.
    server.sentNewView[peer] = true;
    sendRequest(model, {
      from: server.id,
      to: peer,
      type: 'NEW-VIEW',
      v: (server.state == 'primary') ? server.view : (server.view + 1),
      V: server.viewChangeRequests
    });
  }
};

rules.becomePrimary = function(model, server) {
  // TODO: check that the to-be primary also has the highest view.
  if (server.state == 'candidate' &&
      (server.viewChangeRequests.length ==
       (2 * NUM_TOLERATED_BYZANTINE_FAULTS))) {
    var oldPrimary = pbft.getLeader();
    if (oldPrimary !== null)
      oldPrimary.state = 'backup';
    server.state = 'primary';
    server.view += 1;
  }
};

var handlePrePrepareRequest = function(model, server, request) {
  // TODO
};

var handlePrepareRequest = function(model, server, request) {
  // TODO
};

var handleCommitRequest = function(model, server, request) {
  // TODO
};

var handleCheckpointRequest = function(model, server, request) {
  // TODO
};

var handleViewChangeRequest = function(model, server, request) {
  if ((server.state == 'backup' ||
       server.state == 'candidate' ||
       server.state == 'changing-view') &&
      (server.id == (request.v % pbft.NUM_SERVERS))) {
    // This server is the primary of the requested view.
    server.state = 'candidate';
    server.viewChangeRequests.push(request);
  }
};

var handleNewViewRequest = function(model, server, request) {
  server.viewChangeAlarm = util.Inf;
  server.view = request.v;
  server.state = 'backup';
};

var handleMessage = function(model, server, message) {
  if (message.type == 'VIEW-CHANGE') {
    if (message.direction == 'request') {
      handleViewChangeRequest(model, server, message);
    }
  }
  if (message.type == 'NEW-VIEW') {
    if (message.direction == 'request') {
      handleNewViewRequest(model, server, message);
    }
  }
};

// Public function.
pbft.update = function(model) {
  model.servers.forEach(function(server) {
    rules.startNewViewChange(model, server);
    rules.becomePrimary(model, server);
    // rules.advanceCommitIndex(model, server);
    server.peers.forEach(function(peer) {
      rules.sendPrePrepare(model, server, peer);
      rules.sendPrepare(model, server, peer);
      rules.sendCommit(model, server, peer);
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
pbft.drop = function(/* TODO */) {
  // TODO
};

// Public function.
pbft.timeout = function(/* TODO */) {
  // TODO
};

// Public function.
// TODO: send timestamp and client encryption here
// TODO: client awareness, and forward messages from client to correct primary
// TODO: client must accept f + 1 valid replies before accepting
pbft.clientRequest = function(model, server, t) {
  if (server.state == 'primary') {
    server.log.push({
      view: server.view,
      value: 'v',
      time: t,
    });
  }

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
    model.servers[peer - 1].viewChangeAlarm = makeViewChangeAlarm(model.time);
  });
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

var serverSpec = function(id) {
  var coord = util.circleCoord((id - 1) / pbft.NUM_SERVERS,
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

var messageArrowSpec = function(from, to, frac) {
  var fromSpec = serverSpec(from);
  var toSpec = serverSpec(to);
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
    if (server.state == 'primary' &&
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
      // .append('<th>next index</th>')
      // .append('<th>match index</th>')
      // .append('<th>vote granted</th>')
      .append('<th>RPC due</th>')
      // .append('<th>heartbeat due</th>')
    );
  server.peers.forEach(function(peer) {
    peerTable.append($('<tr></tr>')
      .append('<td>S' + peer + '</td>')
      // .append('<td>' + server.nextIndex[peer] + '</td>')
      // .append('<td>' + server.matchIndex[peer] + '</td>')
      // .append('<td>' + server.voteGranted[peer] + '</td>')
      .append('<td>' + util.relTime(server.rpcDue[peer], model.time) + '</td>')
      // .append('<td>' + util.relTime(server.heartbeatDue[peer], model.time) + '</td>')
    );
  });
  $('.modal-body', m)
    .empty()
    .append($('<dl class="dl-horizontal"></dl>')
      .append(li('state', server.state))
      .append(li('currentView', server.view))
      // .append(li('votedFor', server.votedFor))
      // .append(li('commitIndex', server.commitIndex))
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

// var messageModal = function(model, message) {
//   var m = $('#modal-details');
//   $('.modal-dialog', m).removeClass('modal-lg').addClass('modal-sm');
//   $('.modal-title', m).text(message.type + ' ' + message.direction);
//   var li = function(label, value) {
//     return '<dt>' + label + '</dt><dd>' + value + '</dd>';
//   };
//   var fields = $('<dl class="dl-horizontal"></dl>')
//       .append(li('from', 'S' + message.from))
//       .append(li('to', 'S' + message.to))
//       .append(li('sent', util.relTime(message.sendTime, model.time)))
//       .append(li('deliver', util.relTime(message.recvTime, model.time)))
//       .append(li('view', message.view));
//   if (message.type == 'RequestVote') {
//     if (message.direction == 'request') {
//       fields.append(li('lastLogIndex', message.lastLogIndex));
//       fields.append(li('lastLogTerm', message.lastLogTerm));
//     } else {
//       fields.append(li('granted', message.granted));
//     }
//   } else if (message.type == 'AppendEntries') {
//     if (message.direction == 'request') {
//       var entries = '[' + message.entries.map(function(e) {
//             return e.view;
//       }).join(' ') + ']';
//       fields.append(li('prevIndex', message.prevIndex));
//       fields.append(li('prevTerm', message.prevTerm));
//       fields.append(li('entries', entries));
//       fields.append(li('commitIndex', message.commitIndex));
//     } else {
//       fields.append(li('success', message.success));
//       fields.append(li('matchIndex', message.matchIndex));
//     }
//   }
//   $('.modal-body', m)
//     .empty()
//     .append(fields);
//   var footer = $('.modal-footer', m);
//   footer.empty();
//   messageActions.forEach(function(action) {
//     footer.append(util.button(action[0])
//       .click(function(){
//         state.fork();
//         action[1](model, message);
//         state.save();
//         render.update();
//         m.modal('hide');
//       }));
//   });
//   m.modal();
// };

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
                : termColors[server.view % termColors.length]));
      var votesGroup = $('.votes', serverNode);
      votesGroup.empty();
      if (server.state == 'candidate') {
        // state.current.servers.forEach(function (peer) {
        //   var coord = util.circleCoord((peer.id - 1) / pbft.NUM_SERVERS,
        //                                serverSpec(server.id).cx,
        //                                serverSpec(server.id).cy,
        //                                serverSpec(server.id).r * 5/8);
        //   var state;
        //   if (peer == server || server.voteGranted[peer.id]) {
        //     state = 'have';
        //   } else if (peer.votedFor == server.id && peer.view == server.view) {
        //     state = 'coming';
        //   } else {
        //     state = 'no';
        //   }
        //   var granted = (peer == server ? true : server.voteGranted[peer.id]);
        //   votesGroup.append(
        //     util.SVG('circle')
        //       .attr({
        //         cx: coord.x,
        //         cy: coord.y,
        //         r: 5,
        //       })
        //       .attr('class', state));
        // });
      }
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
                  .attr(util.circleCoord((server.id - 1) / pbft.NUM_SERVERS,
                                          ringSpec.cx, ringSpec.cy, ringSpec.r + 50)))
        .append(util.SVG('a')
          .append(util.SVG('circle')
                    .attr('class', 'background')
                    .attr(s))
          // .append(util.SVG('g')
          //           .attr('class', 'votes'))
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
    // .attr('class', 'entry ' + (committed ? 'committed' : 'uncommitted'))
    .append(util.SVG('rect')
      .attr(spec)
      .attr('stroke-dasharray', committed ? '1 0' : '5 5')
      .attr('style', 'fill: ' + termColors[entry.v % termColors.length]))
    .append(util.SVG('text')
      .attr({x: spec.x + spec.width / 2,
             y: spec.y + spec.height / 2})
      .text(entry.v));
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
    // server.log.forEach(function(entry, i) {
    //   var index = i + 1;
    //     log.append(pbft.render.entry(
    //          logEntrySpec(index),
    //          entry,
    //          index <= server.commitIndex));
    // });
    // if (leader !== null && leader != server) {
    //   log.append(
    //     util.SVG('circle')
    //       .attr('title', 'match index')//.tooltip({container: 'body'})
    //       .attr({cx: logEntrySpec(leader.matchIndex[server.id] + 1).x,
    //              cy: logSpec.y + logSpec.height,
    //              r: 5}));
    //   var x = logEntrySpec(leader.nextIndex[server.id] + 0.5).x;
    //   log.append(util.SVG('path')
    //     .attr('title', 'next index')//.tooltip({container: 'body'})
    //     .attr('style', 'marker-end:url(#TriangleOutM); stroke: black')
    //     .attr('d', ['M', x, comma, logSpec.y + logSpec.height + logSpec.height/3,
    //                 'L', x, comma, logSpec.y + logSpec.height + logSpec.height/6].join(' '))
    //     .attr('stroke-width', 3));
    // }
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
    if (message.direction == 'reply') {
      var dlist = [];
      dlist.push('M', s.cx - s.r, comma, s.cy,
                 'L', s.cx + s.r, comma, s.cy);
      if ((message.type == 'RequestVote' && message.granted) ||
          (message.type == 'AppendEntries' && message.success)) {
         dlist.push('M', s.cx, comma, s.cy - s.r,
                    'L', s.cx, comma, s.cy + s.r);
      }
      $('#message-' + i + ' path.message-success', messagesGroup)
        .attr('d', dlist.join(' '));
    }
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
