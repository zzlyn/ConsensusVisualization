import React from "react";
import anime from "animejs";

// TODO: Change to Message.css later.
import "./Node.css";
import {ctod} from './Util';

class Message extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      id: props.id,
      initX: props.startX,
      initY: props.startY,
      radius: 10,
      destX: props.startX,
      destY: props.startY,
    }
  }

  componentDidMount() {
  }

  componentDidUpdate() {
    this.anime();
  }

  fire = (x, y) => {
    this.setState({
        destX: x,
        destY: y,
    });
  }

  anime = () => {
    anime({
      targets: "#msg-" + this.props.id,
      translateX: this.state.destX - this.props.startX,
      translateY: this.state.destY - this.props.startY,
      easing: 'linear',
      duration: 1000,
      begin: function() {
        console.log("Begin Callback");
      },
      complete: this.props.onMessageArrival,
    });
  };

  render() {
    const hw = this.state.radius * 2;
    const div_coords = ctod(this.state.initX, this.state.initY, this.state.radius);

    return (
      <div
        className="circle"
        id={"msg-" + this.props.id}
        style={{
          position: 'absolute',
          zIndex: "10",
          width: hw,
          height: hw,
          left: div_coords.dist_left,
          top: div_coords.dist_top,
          background: "white"
        }}
      />
    );
  }
}

export default Message;
