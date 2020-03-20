/* jshint globalstrict: true */
/* jshint browser: true */
/* jshint devel: true */
/* jshint jquery: true */
'use strict';

var util = {};

// Really big number. Infinity is problematic because
// JSON.stringify(Infinity) returns 'null'.
util.Inf = 1e300;

util.value = function(v) {
  return function() { return v; };
};

// Use with sort for numbers.
util.numericCompare = function(a, b) {
  return a - b;
};

util.circleCoord = function(frac, cx, cy, r) {
  var radians = 2 * Math.PI * (0.75 + frac);
  return {
    x: cx + r * Math.cos(radians),
    y: cy + r * Math.sin(radians),
  };
};

util.paxosLayoutCoord = function(frac, state, cx, cy, r) {
  if (state != 'client') {
    return {
      x: (cx - r) + (r - r*Math.cos(2*Math.PI*frac)),
      y: cy - r*Math.sin(2*Math.PI*frac),
    };
  }
  else {
    return {
      x: 150,
      y: cy,
    };
  }
};

util.verticalCoord = function(type,num,xGap,yGap,cx,cy,NUM_P,NUM_A,NUM_L){
  var offset;
  if(type == 'client'){
    offset = yGap/2;
    return{
      x: cx - 1.5*xGap,
      y: cy - (1-1)*yGap/2 + num*yGap - offset,
    }
  } else if(type == 'proposer'){
    if(NUM_P%2 == 0){
      offset = 0;
    } else{
      offset = yGap/2;
    }
    return{
      x: cx - 0.5*xGap,
      y: cy - (NUM_P)*yGap/2 + num*yGap - offset,
    }
  } else if(type == 'acceptor'){
    if(NUM_A%2 == 0){
      offset = 0;
    } else{
      offset = yGap/2;
    }
    return{
      x: cx + 0.5*xGap,
      y: cy - (NUM_A-1)*yGap/2 + num*yGap - offset,
    }
  } else if(type == 'learner'){
    if(NUM_L%2 == 0){
      offset = 0;
    } else{
      offset = yGap/2;
    }
    return{
      x: cx + 1.5*xGap,
      y: cy - (NUM_L-1)*yGap/2 + num*yGap - offset,
    }
  };
};

util.countTrue = function(bools) {
  var count = 0;
  bools.forEach(function(b) {
    if (b)
      count += 1;
  });
  return count;
};

util.makeMap = function(keys, value) {
  var m = {};
  keys.forEach(function(key) {
    m[key] = value;
  });
  return m;
};

util.mapValues = function(m) {
  return $.map(m, function(v) { return v; });
};

util.clone = function(object) {
  return jQuery.extend(true, {}, object);
};

// From http://stackoverflow.com/a/6713782
util.equals = function(x, y) {
  if ( x === y ) return true;
    // if both x and y are null or undefined and exactly the same

  if ( ! ( x instanceof Object ) || ! ( y instanceof Object ) ) return false;
    // if they are not strictly equal, they both need to be Objects

  if ( x.constructor !== y.constructor ) return false;
    // they must have the exact same prototype chain, the closest we can do is
    // test there constructor.

  var p;
  for ( p in x ) {
    if ( ! x.hasOwnProperty( p ) ) continue;
      // other properties were tested using x.constructor === y.constructor

    if ( ! y.hasOwnProperty( p ) ) return false;
      // allows to compare x[ p ] and y[ p ] when set to undefined

    if ( x[ p ] === y[ p ] ) continue;
      // if they have the same strict value or identity then they are equal

    if ( typeof( x[ p ] ) !== "object" ) return false;
      // Numbers, Strings, Functions, Booleans must be strictly equal

    if ( ! util.equals( x[ p ],  y[ p ] ) ) return false;
      // Objects and Arrays must be tested recursively
  }

  for ( p in y ) {
    if ( y.hasOwnProperty( p ) && ! x.hasOwnProperty( p ) ) return false;
      // allows x[ p ] to be set to undefined
  }
  return true;
};

util.greatestLower = function(a, gt) {
  var bs = function(low, high) {
    if (high < low)
      return low - 1;
    var mid = Math.floor((low + high) / 2);
    if (gt(a[mid]))
      return bs(low, mid - 1);
    else
      return bs(mid + 1, high);
  };
  return bs(0, a.length - 1);
};

util.clamp = function(value, low, high) {
  if (value < low)
    return low;
  if (value > high)
    return high;
  return value;
};

util.SVG = function(tag) {
  return $(document.createElementNS('http://www.w3.org/2000/svg', tag));
};

util.relTime = function(time, now) {
  if (time == util.Inf)
    return 'infinity';
  var sign = time > now ? '+' : '';
  return sign + ((time - now) / 1e3).toFixed(3) + 'ms';
};

util.button = function(label) {
  return $('<button type="button" class="btn btn-default"></button>')
    .text(label);
};

//for paxos only for now
util.groupServers = function(model){
  var client = [];
  var proposers = [];
  var acceptors = [];
  var learners = [];
  model.servers.forEach(function(server){
    if(server.state == 'client'){
      client.push(server);
    } else if(server.state == 'proposer'){
      proposers.push(server);
    } else if(server.state == 'acceptor'){
      acceptors.push(server);
    } else if(server.state == 'learner'){
      learners.push(server);
    }
  })
  var group = [];
  group.push(client);
  group.push(proposers);
  group.push(acceptors);
  group.push(learners);
  return group;
};

//select algorithm and activate
util.select = function(algorithm,algorithmName){
  protocol = algorithm;
  activeProtocol = algorithmName;
  util.activate();
}

util.serverIdtoNumInGroup = function(Id, model){
  var num;
  var ans;
  var group = util.groupServers(model);
  group.forEach(function(type){
    num = 1;
    type.forEach(function(server){
      if(server.id == Id){
        ans = num
      }
      num++;
    })
  });
  return ans;
}

util.resetStates = function(model){
  var groupedServers = util.groupServers(model);
  groupedServers[2].forEach(function(server){//acceptor
    server.promisedTerm = -1;
    server.acceptedTerm = -1;
    server.acceptedValue = null;
    server.term = 1;
  })
  groupedServers[1].forEach(function(server){//proposer
    server.proposeValue = Math.random().toString(36).substring(7);
    server.term = 1;
  })
  groupedServers[3].forEach(function(server){
    server.learnedValue = null;
    server.term = 1;
  })
}

util.makeArrayOfArrays = function(length) {
  return Array.from({length: length}, () => []);
}

util.pbftGetClient = function(model){
  var id;
  model.servers.forEach(function(server){
    if(server.state == "pbft_client")
      id = server.id;
  })
  return id;
}

util.pbftGetReplicas = function(model){
  var nonClients = [];
  model.servers.forEach(function(server){
    if(server.state != 'pbft_client')
    nonClients.push(server.id);
  })
  return nonClients;
}