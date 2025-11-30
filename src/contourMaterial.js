/**
 * Contour Material for three.js
 * Creates shader materials for visualizing contour polygons with elevation-based coloring
 * Unlike elevationMaterial, this doesn't displace vertices (they're already positioned)
 */

import * as THREE from 'three';

/**
 * Create a material for visualizing contour elevation data with FLAT shading
 * Uses fragment derivatives to compute face normals
 *
 * @param {number} minElevation - Minimum elevation value
 * @param {number} maxElevation - Maximum elevation value
 * @returns {THREE.ShaderMaterial} Material with elevation-based coloring
 */
export function createContourMaterial(minElevation = 0, maxElevation = 6000) {
  const vertexShader = `
    attribute float elevation;
    varying float vElevation;
    varying vec3 vPosition;

    void main() {
      vElevation = elevation;
      vPosition = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
    uniform float minElevation;
    uniform float maxElevation;
    uniform vec3 lightDirection;
    uniform vec3 lightDirection2;

    varying float vElevation;
    varying vec3 vPosition;

    void main() {
      // Vibrant color gradient with DISCONTINUITY at sea level (0m)
      vec3 color;

      if (vElevation < 0.0) {
        // Below sea level: dark blue gradient
        float oceanT = vElevation / minElevation;
        color = mix(vec3(0.0, 0.1, 0.3), vec3(0.0, 0.2, 0.5), oceanT);
      } else if (vElevation < 10.0) {
        // At sea level (0-10m): BRIGHT BLUE - discontinuous jump
        color = vec3(0.0, 0.4, 1.0);
      } else {
        // Above sea level: green -> yellow -> orange -> red
        float t = (vElevation - 10.0) / (maxElevation - 10.0);
        t = clamp(t, 0.0, 1.0);

        if (t < 0.25) {
          color = mix(vec3(0.0, 0.8, 0.2), vec3(0.5, 0.9, 0.2), t / 0.25);
        } else if (t < 0.5) {
          color = mix(vec3(0.5, 0.9, 0.2), vec3(1.0, 1.0, 0.0), (t - 0.25) / 0.25);
        } else if (t < 0.75) {
          color = mix(vec3(1.0, 1.0, 0.0), vec3(1.0, 0.5, 0.0), (t - 0.5) / 0.25);
        } else {
          color = mix(vec3(1.0, 0.5, 0.0), vec3(1.0, 0.0, 0.0), (t - 0.75) / 0.25);
        }
      }

      // Flat shading: compute face normal from position derivatives
      vec3 fdx = dFdx(vPosition);
      vec3 fdy = dFdy(vPosition);
      vec3 normal = normalize(cross(fdx, fdy));

      // Two-light setup for better depth perception
      // Main light (key light)
      vec3 lightDir1 = normalize(lightDirection);
      float diffuse1 = max(dot(normal, lightDir1), 0.0) * 0.6;

      // Secondary light (fill light)
      vec3 lightDir2 = normalize(lightDirection2);
      float diffuse2 = max(dot(normal, lightDir2), 0.0) * 0.3;

      // Ambient light
      float ambient = 0.2;

      float lighting = diffuse1 + diffuse2 + ambient;
      vec3 finalColor = color * lighting;

      gl_FragColor = vec4(finalColor, 1.0);
    }
  `;

  return new THREE.ShaderMaterial({
    uniforms: {
      minElevation: { value: minElevation },
      maxElevation: { value: maxElevation },
      lightDirection: { value: new THREE.Vector3(1, 1, 1).normalize() },
      lightDirection2: { value: new THREE.Vector3(-1, -0.5, 0.5).normalize() }
    },
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide,
    extensions: {
      derivatives: true
    }
  });
}
