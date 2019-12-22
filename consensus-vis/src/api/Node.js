import React from 'react';
import './Node.css';

import {ctod} from './Util';

class Node extends React.Component {

  constructor(props) {
    super();
    this.state = {
      // Node self states.
      nodeRadius: 35,
    }
  }

  render() {
    const div_coords = ctod(this.props.centX, this.props.centY,this.state.nodeRadius);
    const hw =this.state.nodeRadius * 2;

    return (
      <div>
        <div
          className="circle"
          style={{
            position: 'absolute',
            width: hw,
            height: hw,
            left: div_coords.dist_left,
            top: div_coords.dist_top,
            background: this.props.nodeColor
          }}
        />
        {this.props.children}
      </div>
    );
  }
}

export default Node;

