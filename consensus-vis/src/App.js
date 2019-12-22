import React, { Component } from 'react';
import './App.css';
import RaftDemo from './api/RaftDemo';

class App extends Component {
  constructor() {
    super();
    this.state = {
      max_servers: 5,
      // TODO: this can be set by a UI button in future
      algorithm: "broadcast_demo"
    };
  }

  render() {
    const num_servers = this.state.max_servers;

    switch(this.state.algorithm) {

      case "broadcast_demo":
        return <RaftDemo
          num_nodes = {num_servers}
        />;

      default:
        return <div>No algorithm specified</div>;
    }
  }
}

export default App;
