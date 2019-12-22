import React from 'react';
import Node from '../api/Node';

import Message from '../api/Message.js';

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
      electionAlarm: 2000,
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

      // Message elements attached to this node.
      allMessages: [],
      allMessageRefs: [],
    }

    for(let i = 0; i < props.allNodes.length; i++) {
      if (i !== props.id) {
        let ref = React.createRef();
        this.state.allMessageRefs.push(ref);
        this.state.allMessages.push(<Message
            id={props.id * 10 + i}
            key={i}
            ref={ref}
            startX={props.centX}
            startY={props.centY}
        />);
      }
    }
  }

  broadcastMessages() {
    for (let i = 0; i < this.props.allNodes.length; i++) {
        const node = this.props.allNodes[i];
        if (i !== this.props.id) {
          this.sendMessage(node.props.centX, node.props.centY, i > this.props.id ? i - 1 : i);
        }
    }
  }

  sendMessage(x, y, i) {
    this.state.allMessageRefs[i].current.fire(x, y, function() {
        this.recycleMessage(this.props.centX, this.props.centY, i);
    }.bind(this));
  }

  recycleMessage(x, y, i) {
    console.log(this.state.voteGranted);
    this.state.allMessageRefs[i].current.fire(x, y, function() {
      const voteGranted = Object.assign(this.state.voteGranted);
      voteGranted[this.state.peers[i]] = true;
      this.setState({
        voteGranted: voteGranted
      });
    }.bind(this));
    // TODO: check if this node won the vote (majority true in voteGranted), and change `this.state.type` to `nodeTypes.LEADER` if so.
  }

  componentDidMount() {
    setTimeout(this.handleElectionTimeout, this.state.electionAlarm);
  }

  handleElectionTimeout = () => {
    this.setState({type: nodeTypes.CANDIDATE});
    this.broadcastMessages();
  }

  handleSelectTypeChange = (e) => {
    const newType = e.target.value;
    this.setState({type: newType});
  }

  render() {
    return <div onClick={() => this.broadcastMessages()}><Node
        id = {this.props.id}
        centX = {this.props.centX}
        centY = {this.props.centY}
        nodeColor = {getColorFromType(this.state.type)}
      >
        {/*Test passing an element through the Node element*/}
        <div>Raft: {this.state.type}</div>
        <NodeTypeSelect value={this.state.type} handleChange={(e) => this.handleSelectTypeChange(e)} />
        {this.state.allMessages}
      </Node></div>
  }
}

export default RaftNode;
