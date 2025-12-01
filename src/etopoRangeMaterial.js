/**
 * ETOPO Range Material for three.js
 * Creates shader materials for visualizing elevation range data (min to max) on HEALPix meshes
 * Uses similar colormap to bedrock.html
 */

import * as THREE from 'three';

/**
 * Create a material for visualizing elevation range data with line segments
 * Each HEALPix cell is represented by a line from min to max elevation
 *
 * @param {number} minElevation - Minimum elevation value (default -11000m for ETOPO surface data)
 * @param {number} maxElevation - Maximum elevation value (default 9000m for ETOPO surface data)
 * @returns {THREE.ShaderMaterial} Material with elevation-based coloring
 */
export function createEtopoRangeMaterial(minElevation = -11000, maxElevation = 9000, maxAbsElevation = 11000) {
  const vertexShader = `
    attribute float elevation;
    uniform float alpha;
    uniform float maxAbsElevation;
    varying float vElevation;
    varying vec3 vPosition;

    void main() {
      vElevation = elevation;

      // Compute radial displacement: r = 1 + alpha * e / maxAbsElevation
      // Depths (negative) point inward, heights (positive) point outward
      float radius = 1.0 + alpha * elevation / maxAbsElevation;

      // Displace vertex radially
      vec3 displacedPosition = position * radius;

      vPosition = displacedPosition;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(displacedPosition, 1.0);
    }
  `;

  const fragmentShader = `
    uniform float minElevation;
    uniform float maxElevation;

    varying float vElevation;
    varying vec3 vPosition;

    void main() {
      // Colormap: black at lowest depth → blue → green → white at highest peak
      vec3 color;

      if (vElevation >= 0.0) {
        // Above sea level: green gradient toward white at highest peak
        float t = vElevation / maxElevation;
        t = clamp(t, 0.0, 1.0);
        color = mix(vec3(0.2, 0.7, 0.2), vec3(1.0, 1.0, 1.0), t);
      } else {
        // Below sea level: black at deepest → blue at sea level
        float t = vElevation / minElevation;
        t = clamp(t, 0.0, 1.0);
        color = mix(vec3(0.2, 0.4, 0.8), vec3(0.0, 0.0, 0.0), t);
      }

      gl_FragColor = vec4(color, 1.0);
    }
  `;

  return new THREE.ShaderMaterial({
    uniforms: {
      minElevation: { value: minElevation },
      maxElevation: { value: maxElevation },
      maxAbsElevation: { value: maxAbsElevation },
      alpha: { value: 0.1 }
    },
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide
  });
}
