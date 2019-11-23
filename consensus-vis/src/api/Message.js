import React from "react";
import ReactDOM from "react-dom";
import anime from "animejs";

// TODO: Change to Message.css later.
import "./Node.css";

class Message extends React.Component {
	constructor(props) {
    		super(props);
		this.state = {
			id: props.id,
			initX: props.startX,
			initY: props.startY,
		}
  	}

	componentDidMount() {
	}

	componentDidUpdate() {
		this.anime();
	}

	anime = () => {
		anime({
			targets: ".msg" + this.state.id,
			cx: this.props.msgControlX,
			cy: this.props.msgControlY,
			easing: 'linear',
			duration: 1000,
			begin: function() {
				console.log("Begin Callback");
			},
			complete: this.props.onMessageArrival,
		});
	};

	render() {
		return (
			<circle className={"msg" + this.state.id} cx={this.state.initX} cy={this.state.initY} fill="white" r="10" stroke="black" strokeWidth="5"/>
		);
	}
}

export default Message;
