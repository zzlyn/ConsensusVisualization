import React from 'react';
import './Node.css';
import Message from './Message.js';

import {ctod} from './Util';

class Node extends React.Component {
  messageSent = false;
  shouldDisplayMessage = false;

  constructor(props) {
    super();
    this.state = {
      id: props.id,
      // Node self states.
      centX: props.centX,
      centY: props.centY,
      nodeRadius: 35,
      // States used to control messages.
      messageX: props.centX,
      messageY: props.centY,
      // Test temporary destination for updating message control coords.
      nextX: props.nextX,
      nextY: props.nextY,

      // All other nodes.
      allNodes: props.allNodes,
      allMessages: [],
      allMessageRefs: [],
    }
  
    this.recycleMessage = this.recycleMessage.bind(this);
    this.recycleAllMessages = this.recycleAllMessages.bind(this);

    for(let i = 0; i < this.state.allNodes.length; i++) {
        let ref = React.createRef();
        this.state.allMessageRefs.push(ref);
        this.state.allMessages.push(<Message
            id={this.state.id * 10 + i}
            key={i}
            ref={ref}
            startX={this.state.centX}
            startY={this.state.centY}
            onMessageArrival={this.recycleAllMessages}
            trigger={this.state.testTrigger}
        />);
    }
}

  sendAllMessages() {
    this.shouldDisplayMessage = true;
    if (this.messageSent)
          return;
    this.messageSent = true;
    for (let i = 0; i < this.state.allMessageRefs.length; i++) {
        const node = this.state.allNodes[i];
        if (i === this.state.self_index)
            continue;
        this.state.allMessageRefs[i].current.fire(node.coordX, node.coordY);
    }
  }

  sendMessage() {
    this.shouldDisplayMessage = true;
    this.setState({ messageX: this.state.nextX, messageY: this.state.nextY });
  }

  recycleAllMessages() {
    if (!this.messageSent)
          return;
    this.messageSent = false;
    for (let ref of this.state.allMessageRefs) {
        ref.current.fire(this.state.centX, this.state.centY);
    }
    this.shouldDisplayMessage = false;
  }

  // Test method for message callback.
  recycleMessage() {
    this.setState({ messageX: this.state.centX, messageY: this.state.centY });
    this.shouldDisplayMessage = false;
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

