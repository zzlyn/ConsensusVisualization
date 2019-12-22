import React from 'react';
import Node from './Node';

import {ctod} from './Util';

const RaftDemo = ({ num_nodes }) => {
  // get window height and width (dont want to call window object multiple times)
  const winHeight = window.innerHeight;
  const winWidth = window.innerWidth;
  const sizeOfWindow = Math.min(winHeight, winWidth);

  // set big circle properties
  const centerX = sizeOfWindow/1.5;
  const centerY = sizeOfWindow/3;
  const radius = 150;

  const circleDimensions = {centerX: centerX, centerY: centerY, radius: radius};

  function getNodeCoords(id, num_nodes, centerX, centerY, radius) {
    // multiplied with 1.5PI makes sure the first circle starts at highest point
    const coordX = centerX + Math.cos((2 * Math.PI * id / num_nodes) + (1.5 * Math.PI))*radius;
    const coordY = centerY + Math.sin((2 * Math.PI * id / num_nodes) + (1.5 * Math.PI))*radius;
    return {coordX, coordY};
  }

  // returns center coordinates for nodes given a specific number of nodes
  function coordinates(num_nodes, circleDimensions) {
    let coords = [];
    for(let i = 0; i < num_nodes; i++) {
      const nodeCoords = getNodeCoords(i, num_nodes, circleDimensions.centerX, circleDimensions.centerY, circleDimensions.radius);
      coords.push(nodeCoords);
    }
    return coords;
  }

  const serverCoords = coordinates(num_nodes, circleDimensions);
  // a list of node tags that is returned fomr this NodeList function
  let list = [];
  for (let i = 0; i < num_nodes; i++) {
    const next = (i + 1) % num_nodes;

    list.push(<Node
        key={i+1}
        id={i}
        centX = {serverCoords[i].coordX}
        centY = {serverCoords[i].coordY}
        nextX = {serverCoords[next].coordX}
        nextY = {serverCoords[next].coordY}
        allNodes = {serverCoords.filter(coord => coord.coordX !== serverCoords[i].coordX && coord.coordY !== serverCoords[i].coordY)}
        nodeColor = "#8da0cb"
    />);
  }

  const background_circle_coords = ctod(circleDimensions.centerX, circleDimensions.centerY, circleDimensions.radius);

  return (
    <div>
      <div
        className="circle"
        style={{
          position: 'absolute',
          left: background_circle_coords.dist_left,
          top: background_circle_coords.dist_top,
          width: radius * 2,
          height: radius * 2
        }}
      />
      {list}
    </div>
  );
}

export default RaftDemo;
