import React from "react";
import anime from "animejs";

// TODO: Change to Message.css later.
import "./Node.css";
import {ctod} from './Util';

class Message extends React.Component {
  flying = false;

  constructor(props) {
    super(props);
    this.state = {
      initX: props.startX,
      initY: props.startY,
      radius: 10,
    }
  }

  componentDidMount() {
  }

  componentDidUpdate() {
  }

  reset = () => {
    anime.set("#msg-" + this.props.id, {
      translateX: 0,
      translateY: 0,
    })
  }

  // Render a flying message from (initX, initY) to (x, y). After
  // the message is delivered to destination it will be instantly
  // returned back to (initX, initY) without animation.
  fire = (x, y, callback) => {
    if (this.flying) {
        console.log("Message already on the fly.");
        return;
    }

    this.flying = true;

    // Attention: The resulting value of trasnlateX/Y is w.r.t the original initX & init Y. Thus,
    // { translateX: 10, translateY: 10 } will issue the message to goto (initX + 10, initY + 10).
    // And { trasnlateX: 0, trasnlateY: 0 } will move the message to (initX + 0, initY + 0) which
    // is the origin.
    anime({
      targets: "#msg-" + this.props.id,
      translateX: (x - this.state.initX),
      translateY: (y - this.state.initY),
      easing: 'linear',
      duration: 1000,
      begin: function() {
        console.log("Begin Callback");
      },
      complete: function() {
        // Update coordinates once travel completed.
        this.flying = false;

        // Recycle the message to its origin.
        this.reset();

        // Execute user defined callback.
        if (callback != null) {
            callback();
        }
      }.bind(this),
    });
  }

  fireNoCallback = (x, y) => {
    this.fire(x, y, null);
  }

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
