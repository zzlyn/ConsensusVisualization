import React from 'react';
import Node from '../api/Node';

function getPeerIds(id, num_nodes) {
  let peers = [];
  for (let i = 0; i < num_nodes; i++) {
    if (i !== id) {
      peers.push(i);
    }
  }
  return peers;
}

const nodeTypes = {
  LEADER: "leader",
  CANDIDATE: "candidate",
  FOLLOWER: "follower",
  CRASHED: "crashed"
}

class RaftNode extends React.Component {
  constructor(props) {
    super(props);
    const peers = getPeerIds(props.id, props.num_nodes);
    this.state = {
      peers: peers,
      type: nodeTypes.FOLLOWER,
      term: 0,
      votedFor: 0,
      commitIndex: 0,
      electionAlarm: 0,
      // {id: voteGranted} map
      voteGranted: peers.reduce((map, id) => {map[id] = false; return map}, {}),
      log: [],
      // {id: matchIndex} map
      matchIndex: peers.reduce((map, id) => {map[id] = 0; return map}, {}),
      // {id: nextIndex} map
      nextIndex: peers.reduce((map, id) => {map[id] = 0; return map}, {}),
      // {id: heartbeatDue} map
      // Only set for elected leader
      heartbeatDue: peers.reduce((map, id) => {map[id] = 0; return map}, {}),
      // {id: rpcDue} map
      // Only set for elected leader
      rpcDue: peers.reduce((map, id) => {map[id] = 0; return map}, {}),
    }
  }

  render() {
    return <Node
        centX = {this.props.centX}
        centY = {this.props.centY}
        nextX = {this.props.nextX}
        nextY = {this.props.nextY}
      ><p>Raft: {this.state.type}</p></Node>
  }
}

export default RaftNode;

const messageTypes = {
  APPEND_ENTRIES: "AppendEntries",
  REQUEST_VOTE: "RequestVote"
}

class RaftMessage extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      type: messageTypes.APPEND_ENTRIES,
      from: 0,
      to: 0,
      term: 0,
      // Set for RequestVote only
      lastLogTerm: 0,
      lastLogIndex: 0,
      // Set for AppendEntries only
      entries: [],
      commitIndex: 0,
    }
  }

  render() {
    return <div>Raft: {this.state.type}</div>;
  }
}
