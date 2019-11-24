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

// TODO: can bring this to the generic Node, given a nodeTypes which is specific to the algorithm.
const NodeTypeSelect = ({value, handleChange}) => {
  let options = Object.values(nodeTypes).map((item) => {
    return <option value={item}>{item}</option>;
  });
  return <select value={value} onChange={handleChange}>
    {options}
  </select>
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

      // Raft-specific display
      nodeColor: "#8da0cb",
    }
  }

  handleSelectTypeChange = (e) => {
    const newType = e.target.value;
    this.setState({type: newType, nodeColor: newType == "leader" ? "#33ff4f": "#8da0cb"});
  }

  render() {
    return <Node
        centX = {this.props.centX}
        centY = {this.props.centY}
        nextX = {this.props.nextX}
        nextY = {this.props.nextY}
        nodeColor = {this.state.nodeColor}
      >
        {/*Test passing an element through the Node element*/}
        <div>Raft: {this.state.type}</div>
        <NodeTypeSelect value={this.state.type} handleChange={(e) => this.handleSelectTypeChange(e)} />
      </Node>
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
