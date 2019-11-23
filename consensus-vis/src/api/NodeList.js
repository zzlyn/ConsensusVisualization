import React from 'react';
import Node from './Node';

import {ctod, dtoc} from './Util';

const NodeList = ({ num_nodes }) => {
	// get window height and width (dont want to call window object multiple times)
	var winHeight = window.innerHeight;
	var winWidth = window.innerWidth;
	var sizeOfWindow = Math.min(winHeight, winWidth);

	// set big circle properties
	var centerX = sizeOfWindow/1.5;
        var centerY = sizeOfWindow/3;
        var radius = 150;

	// returns center coordinates for nodes given a specific number of nodes
	function coordinates(num_nodes, cX, cY, rad){
	
		var coords = [];

    		for(var i = 0; i<num_nodes ; i++) {
			// multiplied with 1.5PI makes sure the first circle starts at highest point
        		var coordX = cX + Math.cos((2 * Math.PI * i / num_nodes) + (1.5*Math.PI))*rad;
        		var coordY = cY + Math.sin((2 * Math.PI * i / num_nodes) + (1.5*Math.PI))*rad;
        		coords.push({coordX,coordY});
    		}

		return coords;
	}

	var serverCoords = coordinates(num_nodes, centerX, centerY, radius);
	// a list of node tags that is returned fomr this NodeList function
	var list = []
	for (var i=0; i<num_nodes; i++) {
		var next = (i + 1) % num_nodes;

		list.push(<Node key={i+1} id={i} 
		centX = {serverCoords[i].coordX} 
		centY = {serverCoords[i].coordY}
		nextX = {serverCoords[next].coordX}
		nextY = {serverCoords[next].coordY}/>);
    }

    var background_circle_coords = ctod(centerX, centerY, radius);

	return (
		<div>			
		    <div className="circle" style={{position: 'absolute', 
                    left: background_circle_coords.dist_left, top: background_circle_coords.dist_top,
                    width: radius * 2, height: radius * 2
            }}/>
            {list}
		</div>
	);
}

export default NodeList;
