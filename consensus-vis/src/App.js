import React, { Component } from 'react';
import BroadcastDemo from './api/BroadcastDemo';
import './App.css';

class App extends Component {
  constructor() {
    super();
    this.state = {
      max_servers: 5
    };
  }

  render() {
    const num_servers = this.state.max_servers;

    return (
      <BroadcastDemo num_nodes = {num_servers} />
    );
  }
}

export default App;
