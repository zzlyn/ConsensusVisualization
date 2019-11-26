
// Utility methods to convert from div top-left corner coordinates to circle-center coordinates.

export function dtoc(dist_left, dist_top, radius) {
  return {x: dist_left + radius, y: dist_top + radius};
}

export function ctod(x, y, radius) {
  return {dist_left: x - radius, dist_top: y - radius};
}

