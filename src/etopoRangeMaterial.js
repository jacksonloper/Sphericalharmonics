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
    varying vec3 vNormal;
    varying vec3 vPosition;

    void main() {
      vElevation = elevation;

      // Use precomputed normals from geometry (computed at alpha=0.11)
      // Transform to view space for lighting calculations
      vNormal = normalize(normalMatrix * normal);

      // Compute radial displacement: r = 1 + alpha * e / maxAbsElevation
      // Depths (negative) point inward, heights (positive) point outward
      float radius = 1.0 + alpha * elevation / maxAbsElevation;

      // Displace vertex radially (positions are on unit sphere)
      vec3 displacedPosition = position * radius;

      vPosition = displacedPosition;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(displacedPosition, 1.0);
    }
  `;

  const fragmentShader = `
    uniform float minElevation;
    uniform float maxElevation;

    varying float vElevation;
    varying vec3 vNormal;
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

      // Multi-directional lighting for full illumination
      // Multiple lights from different directions ensure all surfaces are well lit
      vec3 light1 = normalize(vec3(1.0, 1.0, 1.0));
      vec3 light2 = normalize(vec3(-1.0, 0.5, -0.5));
      vec3 light3 = normalize(vec3(0.0, -1.0, 0.5));
      vec3 light4 = normalize(vec3(-0.5, 1.0, -1.0));

      float diffuse1 = max(dot(vNormal, light1), 0.0) * 0.25;
      float diffuse2 = max(dot(vNormal, light2), 0.0) * 0.2;
      float diffuse3 = max(dot(vNormal, light3), 0.0) * 0.15;
      float diffuse4 = max(dot(vNormal, light4), 0.0) * 0.15;
      float ambient = 0.8;

      float lighting = diffuse1 + diffuse2 + diffuse3 + diffuse4 + ambient;
      vec3 finalColor = color * lighting;

      gl_FragColor = vec4(finalColor, 1.0);
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
