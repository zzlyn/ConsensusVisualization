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
      currentX: props.startX,
      currentY: props.startY,
      radius: 10,
      flying: false,
    }
  }

  componentDidMount() {
  }

  componentDidUpdate() {
  }

  fire = (x, y, callback) => {
    if (this.state.flying) {
        console.log("Message already on the fly.");
        return;
    }
    
    this.setState({ flying: true });

    console.log("From X: " + this.state.currentX + " to " + x);

    anime({
      targets: "#msg-" + this.props.id,
      translateX: (x - this.state.currentX),
      translateY: (y - this.state.currentY),
      easing: 'linear',
      duration: 1000,
      begin: function() {
        console.log("Begin Callback");
      },
      complete: function() {
        // Update coordinates once travel completed.
        this.setState({ currentX: x, currentY: y});
        this.setState({ flying: false });
        console.log("Message docked");

        // Execute user defined callback.
        if (callback != null) {
            // callback();
        }
      }.bind(this),
    });
    
  }

  fireNoCallback = (x, y) => {
    this.fire(x, y, null);
  }

  render() {
    const hw = this.state.radius * 2;
    const div_coords = ctod(this.state.currentX, this.state.currentY, this.state.radius);

    console.log("Message render(), div_coords: " + div_coords.dist_left + ", " + div_coords.dist_top);

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
