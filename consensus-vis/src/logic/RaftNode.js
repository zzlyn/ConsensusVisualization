import React from 'react';
import Node from '../api/Node';

import Message from '../api/Message.js';

const ELECTION_TIMEOUT = 5000;

const messageTypes = {
  APPEND_ENTRIES: "AppendEntries",
  REQUEST_VOTE: "RequestVote",
}

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
      term: 55,
      votedFor: null,
      commitIndex: 0,
      electionAlarm: this.makeElectionAlarm(),
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

    for(let i = 0; i < props.allNodeRefs.length; i++) {
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

  makeElectionAlarm() {
    const timeout = (Math.random() + 1) * ELECTION_TIMEOUT;
    setTimeout(this.handleElectionTimeout, timeout);
    return Date.now() + timeout;
  }

  sendRequestVotes() {
    for (let index = 0; index < this.props.allNodeRefs.length; index++) {
        if (index !== this.props.id) {
          this.sendRequestVoteTo(index);
        }
    }
  }

  getMessageIndex(nodeIndex) {
    return nodeIndex > this.props.id ? nodeIndex - 1 : nodeIndex;
  }

  sendRequestVoteTo(nodeIndex) {
    const messageIndex = this.getMessageIndex(nodeIndex);
    const targetNode = this.props.allNodeRefs[nodeIndex].current;

    this.state.allMessageRefs[messageIndex].current.fire(targetNode.props.centX, targetNode.props.centY, function() {
      targetNode.messageCallback({
        type: messageTypes.REQUEST_VOTE,
        direction: 'request',
        from: this.props.id,
        to: nodeIndex,
        term: this.state.term,
        // Set for RequestVote only
        lastLogTerm: 0, // TODO: set to term of last log entry
        lastLogIndex: 0, // TODO: set to index of last log entry
      });
    }.bind(this));
  }

  // The server received a RequestVote RPC from a candidate.
  handleRequestVoteRequest(message) {
    if (this.state.term < message.term) {
      // stepDown the this
    }
    
    const candidateID = message.from;
    const messageIndex = this.getMessageIndex(candidateID);

    console.log("this term: " + this.state.term + " message term: " + message.term + " this voted for: " + this.state.votedFor);

    let granted = false;
    if (this.state.term === message.term &&
        (this.state.votedFor === null ||
        this.state.votedFor === message.from) //&&
        // (request.lastLogTerm > logTerm(this.log, this.log.length) ||
        // (request.lastLogTerm == logTerm(this.log, this.log.length) &&
        //   request.lastLogIndex >= this.log.length))) {
    ){
      granted = true;
      this.setState({
        votedFor: message.from,
        electionAlarm: this.makeElectionAlarm(),
      });
    }

    console.log("granted: " + granted + " to " + message.from);

    let term = this.state.term;

    const candidateNode = this.props.allNodeRefs[candidateID].current;

    // Send a reply back to candidate node and let it know through calling its messageCallback function
    // with type set to REQUEST_VOTE and direction to `reply`.
    this.state.allMessageRefs[messageIndex].current.fire(candidateNode.props.centX, candidateNode.props.centY, function () {
      candidateNode.messageCallback({
        // Message type identification info.
        type: messageTypes.REQUEST_VOTE,
        direction: 'reply',
        // RequestVoteReply specific params.
        granted: granted,
        term: term,
        from: this.props.id
      });
    }.bind(this));
  }

  handleRequestVoteReply(message) {
    const messageRef = this.getMessageIndex(message.from);
    if (this.state.term < message.term) {
      // step down this
    }

    if (this.state.type === nodeTypes.CANDIDATE && this.state.term === message.term) {
      // set rpcdue to infinity
      const voteGranted = Object.assign(this.state.voteGranted);
      const peer_id = this.state.peers[messageRef];
      voteGranted[peer_id] = message.granted;
      this.setState({
        voteGranted: voteGranted
      });
    }

    function numTrue(voteGranted) {
      let count = 0;
      for (let [key, value] of Object.entries(voteGranted)) {
        console.log(key + " " + value);
        if (value === true) {
          count += 1;
        }
      }
      return count;
    }

    if (numTrue(this.state.voteGranted) + 1 > Math.floor(this.props.num_nodes / 2)) {
      this.setState({type: nodeTypes.LEADER});
    }
  }

  handleAppendEntriesRequest(message) {
    // To be implemented.
    return;
  }

  handleAppendEntriesReply(message) {
    // To be implemented.
    return;
  }

  messageCallback(message) {
    // Do nothing if the node is stopped.
    if (this.state.type === nodeTypes.CRASHED) {
      return;
    }

    if (message.type === messageTypes.REQUEST_VOTE) {
      if (message.direction === 'request') {
        this.handleRequestVoteRequest(message);
      } else {
        this.handleRequestVoteReply(message);
      }
    } else if (message.type === messageTypes.APPEND_ENTRIES) {
      if (message.direction === 'request') {
        this.handleAppendEntriesRequest(message);
      } else {
        this.handleAppendEntriesReply(message);
      }
    }
  }

  componentDidMount() {
    setTimeout(this.handleElectionTimeout, this.state.electionAlarm);
  }

  handleElectionTimeout = () => {
    if (Date.now() >= this.state.electionAlarm) {
      this.setState({type: nodeTypes.CANDIDATE});
      this.sendRequestVotes();
    }
  }

  handleSelectTypeChange = (e) => {
    const newType = e.target.value;
    this.setState({type: newType});
  }

  render() {
    return <div><div onClick={() => this.sendRequestVotes()}><Node
        id = {this.props.id}
        centX = {this.props.centX}
        centY = {this.props.centY}
        nodeColor = {getColorFromType(this.state.type)}
      >
        {/*Test passing an element through the Node element*/}
        {this.state.allMessages}
      </Node></div>
      <div>Raft: {this.state.type}</div>
      <NodeTypeSelect value={this.state.type} handleChange={(e) => this.handleSelectTypeChange(e)} />
      </div>
  }
}

export default RaftNode;
