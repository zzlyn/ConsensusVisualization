import React from 'react';
import './Node.css';
import Message from './Message.js';

import {ctod} from './Util';

class Node extends React.Component {

  constructor(props) {
    super();
    this.state = {
      // Node self states.
      nodeRadius: 35,

      // All other nodes.
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
    this.state.allMessageRefs[i].current.fireNoCallback(x, y);
  }

  render() {
    const div_coords = ctod(this.props.centX, this.props.centY,this.state.nodeRadius);
    const hw =this.state.nodeRadius * 2;

    return (
        <div>
          <div
            className="circle"
            onClick={() => this.broadcastMessages()}
            style={{
              position: 'absolute',
              width: hw,
              height: hw,
              left: div_coords.dist_left,
              top: div_coords.dist_top,
              background: this.props.nodeColor
            }}
          />
          {this.state.allMessages}
          {this.props.children}
        </div>
    );
  }
}

export default Node;

