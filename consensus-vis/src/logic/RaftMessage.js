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

export default RaftNode;
