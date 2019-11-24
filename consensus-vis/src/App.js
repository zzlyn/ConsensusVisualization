import React, { Component } from 'react';
import RaftNodeList from './logic/RaftNodeList';
import './App.css';

class App extends Component {
  constructor() {
    super();
    this.state = {
      max_servers: 5,
      // TODO: this can be set by a UI button in future
      algorithm: "raft"
    };
  }

  render() {
    const num_servers = this.state.max_servers;

    switch(this.state.algorithm) {
      case "raft":
        return <RaftNodeList
          num_nodes = {num_servers}
        />;
      default:
        return <div>No algorithm specified</div>;
    }
  }
}

export default App;
