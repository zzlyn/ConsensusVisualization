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

function getColorFromType(type) {
  switch(type) {
    case nodeTypes.LEADER:
      return "#33ff4f";
    case nodeTypes.CANDIDATE:
      return "#e033ff";
    case nodeTypes.CRASHED:
      return "#afafaf"
    case nodeTypes.FOLLOWER:
    default:
      return "#8da0cb";
  }
}

// TODO: can bring this to the generic Node, given a nodeTypes which is specific to the algorithm.
const NodeTypeSelect = ({value, handleChange}) => {
  let options = Object.values(nodeTypes).map((item, i) => {
    return <option key={i} value={item}>{item}</option>;
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
      electionAlarm: 2,
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

  handleSelectTypeChange = (e) => {
    const newType = e.target.value;
    this.setState({type: newType});
  }

  render() {
    return <Node
        id = {this.props.id}
        centX = {this.props.centX}
        centY = {this.props.centY}
        nodeColor = {getColorFromType(this.state.type)}
        allNodes = {this.props.allNodes}
      >
        {/*Test passing an element through the Node element*/}
        <div>Raft: {this.state.type}</div>
        <NodeTypeSelect value={this.state.type} handleChange={(e) => this.handleSelectTypeChange(e)} />
      </Node>
  }
}

export default RaftNode;
