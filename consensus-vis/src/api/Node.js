import React from 'react';
import './Node.css';
import Message from './Message.js';

import {ctod, dtoc} from './Util';

class Node extends React.Component {
	messageSent = false;

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
		}

		this.recycleMessage = this.recycleMessage.bind(this);
	}

	sendMessage() {
		this.setState({ messageX: this.state.nextX, messageY: this.state.nextY })
		this.messageSent = true;
	}
	
	// Test method for message callback.
	recycleMessage() {
		if (this.messageSent) {
			this.setState({ messageX: this.state.centX, messageY: this.state.centY })
		}
		this.messageSent = false;
	}

	render() {
		
        var div_coords = ctod(this.state.centX, this.state.centY, this.state.nodeRadius);

        var hw = this.state.nodeRadius * 2;

        return (
            <div>
		        <div className="circle" onClick={() => this.sendMessage()}
                    style={{position: 'absolute', width: hw, height: hw, left: div_coords.dist_left, top: div_coords.dist_top, background: "#8da0cb"}}/>
                <Message id={this.state.id} startX={this.state.centX} startY={this.state.centY} msgControlX={this.state.messageX} msgControlY={this.state.messageY} onMessageArrival={this.recycleMessage} />
            </div>
        );

	}
}

export default Node;

