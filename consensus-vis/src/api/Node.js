import React from 'react';
import './Node.css';
import Message from './Message.js';

import {ctod} from './Util';

class Node extends React.Component {

  constructor(props) {
    super();
    this.state = {
      id: props.id,
      // Node self states.
      centX: props.centX,
      centY: props.centY,
      nodeRadius: 35,

      // All other nodes.
      allNodes: props.allNodes,
      allMessages: [],
      allMessageRefs: [],
    }
  
    for(let i = 0; i < this.state.allNodes.length; i++) {
        let ref = React.createRef();
        this.state.allMessageRefs.push(ref);
        this.state.allMessages.push(<Message
            id={this.state.id * 10 + i}
            key={i}
            ref={ref}
            startX={this.state.centX}
            startY={this.state.centY}
        />);
    }
  }

  sendAllMessages() {
    for (let i = 0; i < this.state.allMessageRefs.length; i++) {
        const node = this.state.allNodes[i];
        this.sendMessage(node.coordX, node.coordY, i);
    }
  }

  sendMessage(x, y, i) {
    this.state.allMessageRefs[i].current.fire(x, y, function() { 
        this.recycleMessage(this.state.centX, this.state.centY, i); 
    }.bind(this));
  }

  recycleMessage(x, y, i) {
    this.state.allMessageRefs[i].current.fireNoCallback(x, y);
  }

  render() {
    const div_coords = ctod(this.state.centX, this.state.centY, this.state.nodeRadius);
    const hw = this.state.nodeRadius * 2;

    return (
        <div>
          <div
            className="circle" 
            onClick={() => this.sendAllMessages()}
            style={{
              position: 'absolute',
              width: hw,
              height: hw,
              left: div_coords.dist_left,
              top: div_coords.dist_top,
              background: "#8da0cb"
            }}
          />
          {
           this.state.allMessages
          }
        </div>
    );
  }
}

export default Node;

