/* jshint globalstrict: true */
/* jshint browser: true */
/* jshint devel: true */
/* jshint jquery: true */
/* global util */
/* global raft */
/* global pbft */
/* global makeState */
'use strict';

var playback;
var render = {};
var state;
var record;
var replay;

var protocol = paxos;

//temporary var to indicate current active protocol, should be removed and use (protocol) later 
var activeProtocol = 'paxos';

$(function () {

  var onReplayDone = undefined;
  record = function (name) {
    localStorage.setItem(name, state.exportToString());
  };
  replay = function (name, done) {
    state.importFromString(localStorage.getItem(name));
    render.update();
    onReplayDone = done;
  };

  // All protocols have servers and messages represented in two arrays; state
  // object is general across all protocols.
  state = makeState({
    servers: [],
    messages: [],
  });

  var sliding = false;

  playback = function () {
    var paused = false;
    var pause = function () {
      paused = true;
      $('#time-icon')
        .removeClass('glyphicon-time')
        .addClass('glyphicon-pause');
      $('#pause').attr('class', 'paused');
      render.update();
    };
    var resume = function () {
      if (paused) {
        paused = false;
        $('#time-icon')
          .removeClass('glyphicon-pause')
          .addClass('glyphicon-time');
        $('#pause').attr('class', 'resumed');
        render.update();
      }
    };
    return {
      pause: pause,
      resume: resume,
      toggle: function () {
        if (paused)
          resume();
        else
          pause();
      },
      isPaused: function () {
        return paused;
      },
    };
  }();

  (function () {
    for (var i = 1; i <= protocol.NUM_SERVERS; i += 1) {
      var peers = [];
      for (var j = 1; j <= protocol.NUM_SERVERS; j += 1) {
        if (i != j)
          peers.push(j);
      }
      state.current.servers.push(protocol.server(i, peers));
    }
  })();

  //hardcode 1st server to be client and the 2nd server to be proposer
  (function () {
    if (activeProtocol == 'paxos') {
      state.current.servers.forEach(function (server) {
        if (server.id == 1) {
          server.state = 'client';
        } else if (server.id == 2) {
          server.state = 'proposer';
        }
      })
    }

  })();

  var svg = $('svg');

  // Ring is only rendered once, so no need to include it in render.update below.
  render.ring = protocol.render.ring;
  render.ring(svg);

  protocol.appendServerInfo(state, svg);

  var timeSlider;

  render.clock = function () {
    if (!sliding) {
      timeSlider.slider('setAttribute', 'max', state.getMaxTime());
      timeSlider.slider('setValue', state.current.time, false);
    }
  };

  render.servers = protocol.render.servers;
  render.logs = protocol.render.logs;
  render.messages = protocol.render.messages;

  // Transforms the simulation speed from a linear slider
  // to a logarithmically scaling time factor.
  var speedSliderTransform = function (v) {
    v = Math.pow(10, v);
    if (v < 1)
      return 1;
    else
      return v;
  };

  var lastRenderedO = null;
  var lastRenderedV = null;
  render.update = function () {
    // Same indicates both underlying object identity hasn't changed and its
    // value hasn't changed.
    var serversSame = false;
    var messagesSame = false;
    if (lastRenderedO == state.current) {
      serversSame = util.equals(lastRenderedV.servers, state.current.servers);
      messagesSame = util.equals(lastRenderedV.messages, state.current.messages);
    }
    lastRenderedO = state;
    lastRenderedV = state.base();
    render.clock();
    render.servers(serversSame, svg);
    render.messages(messagesSame, svg);
    if (!serversSame)
      render.logs(svg);
  };

  // Time advancement, and translating wall clock time to a "model" time based
  // on the scaling selected is done in the following function.
  (function () {
    var last = null;
    var step = function (timestamp) {
      if (!playback.isPaused() && last !== null && timestamp - last < 500) {
        var wallMicrosElapsed = (timestamp - last) * 1000;
        var speed = speedSliderTransform($('#speed').slider('getValue'));
        var modelMicrosElapsed = wallMicrosElapsed / speed;
        var modelMicros = state.current.time + modelMicrosElapsed;
        state.seek(modelMicros);
        if (modelMicros >= state.getMaxTime() && onReplayDone !== undefined) {
          var f = onReplayDone;
          onReplayDone = undefined;
          f();
        }
        render.update();
      }
      last = timestamp;
      window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
  })();

  $(window).keyup(function (e) {
    if (e.target.id == "title")
      return;
    var leader = protocol.getLeader();
    if (e.keyCode == ' '.charCodeAt(0) ||
      e.keyCode == 190 /* dot, emitted by Logitech remote */) {
      $('.modal').modal('hide');
      playback.toggle();
    } else if (e.keyCode == 'C'.charCodeAt(0)) {
      //if paxos send clientRequestMessage
      if(activeProtocol == 'paxos'){
        state.fork();
        protocol.sendClientRequest(state.current);
        state.save();
        render.update();
        $('.modal').modal('hide');
      }
      if (leader !== null) {
        state.fork();
        protocol.clientRequest(state.current, leader);
        state.save();
        render.update();
        $('.modal').modal('hide');
      }
    } else if (e.keyCode == 'R'.charCodeAt(0)) {
      if (leader !== null) {
        state.fork();
        protocol.stop(state.current, leader);
        protocol.resume(state.current, leader);
        state.save();
        render.update();
        $('.modal').modal('hide');
      }
    } else if (e.keyCode == 'T'.charCodeAt(0)) {
      state.fork();
      protocol.spreadTimers(state.current);
      state.save();
      render.update();
      $('.modal').modal('hide');
    } else if (e.keyCode == 'A'.charCodeAt(0)) {
      state.fork();
      protocol.alignTimers(state.current);
      state.save();
      render.update();
      $('.modal').modal('hide');
    } else if (e.keyCode == 'L'.charCodeAt(0)) {
      state.fork();
      playback.pause();
      protocol.setupLogReplicationScenario(state.current);
      state.save();
      render.update();
      $('.modal').modal('hide');
    } else if (e.keyCode == 'B'.charCodeAt(0)) {
      state.fork();
      protocol.resumeAll(state.current);
      state.save();
      render.update();
      $('.modal').modal('hide');
    } else if (e.keyCode == 'F'.charCodeAt(0)) {
      state.fork();
      render.update();
      $('.modal').modal('hide');
    } else if (e.keyCode == 191 && e.shiftKey) { /* question mark */
      playback.pause();
      $('#modal-help').modal('show');
    }
  });

  $('#modal-details').on('show.bs.modal', function (e) {
    playback.pause();
  });

  $("#speed").slider({
    tooltip: 'always',
    formater: function (value) {
      return '1/' + speedSliderTransform(value).toFixed(0) + 'x';
    },
    reversed: true,
  });

  timeSlider = $('#time');
  timeSlider.slider({
    tooltip: 'always',
    formater: function (value) {
      return (value / 1e6).toFixed(3) + 's';
    },
  });
  timeSlider.on('slideStart', function () {
    playback.pause();
    sliding = true;
  });
  timeSlider.on('slideStop', function () {
    // If you click rather than drag,  there won't be any slide events, so you
    // have to seek and update here too.
    state.seek(timeSlider.slider('getValue'));
    sliding = false;
    render.update();
  });
  timeSlider.on('slide', function () {
    state.seek(timeSlider.slider('getValue'));
    render.update();
  });

  $('#time-button')
    .click(function () {
      playback.toggle();
      return false;
    });

  // Disabled for now, they don't seem to behave reliably.
  // // enable tooltips
  // $('[data-toggle="tooltip"]').tooltip();

  state.updater = function (state) {
    protocol.update(state.current);
    var time = state.current.time;
    var base = state.base(time);
    state.current.time = base.time;
    var same = util.equals(state.current, base);
    state.current.time = time;
    return !same;
  };

  state.init();
  render.update();
});

