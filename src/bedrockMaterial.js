/**
 * Bedrock Material for three.js
 * Creates shader materials for visualizing bedrock elevation data on spherical meshes
 * Uses |e|/6000 + alpha for radius, green for above 0, blue for below 0
 */

import * as THREE from 'three';

/**
 * Create a material for visualizing bedrock elevation data with FLAT shading
 * Uses fragment derivatives to compute face normals (good for high-resolution meshes)
 *
 * @param {number} minElevation - Minimum elevation value
 * @param {number} maxElevation - Maximum elevation value
 * @returns {THREE.ShaderMaterial} Material with elevation-based coloring
 */
export function createBedrockMaterial(minElevation = -10000, maxElevation = 6000) {
  const vertexShader = `
    attribute float elevation;
    uniform float alpha;
    varying float vElevation;
    varying vec3 vPosition;

    void main() {
      vElevation = elevation;

      // Compute radial displacement: r = |e|/6000 + alpha
      float absE = abs(elevation);
      float radius = absE / 6000.0 + alpha;

      // Displace vertex radially
      vec3 displacedPosition = position * radius;

      vPosition = displacedPosition;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(displacedPosition, 1.0);
    }
  `;

  const fragmentShader = `
    uniform float minElevation;
    uniform float maxElevation;
    uniform vec3 lightDirection;

    varying float vElevation;
    varying vec3 vPosition;

    void main() {
      // Color based on sign: green for above 0, blue for below 0
      vec3 color;

      if (vElevation >= 0.0) {
        // Above sea level: green gradient
        float t = vElevation / maxElevation;
        t = clamp(t, 0.0, 1.0);
        color = mix(vec3(0.0, 0.5, 0.0), vec3(0.0, 1.0, 0.0), t);
      } else {
        // Below sea level: blue gradient
        float t = vElevation / minElevation;
        t = clamp(t, 0.0, 1.0);
        color = mix(vec3(0.0, 0.0, 0.5), vec3(0.0, 0.0, 1.0), t);
      }

      // Flat shading: compute face normal from position derivatives
      vec3 fdx = dFdx(vPosition);
      vec3 fdy = dFdy(vPosition);
      vec3 normal = normalize(cross(fdx, fdy));

      // Simple lighting: ambient + parallel sun light
      vec3 sunDir = normalize(lightDirection);
      float diffuse = max(dot(normal, sunDir), 0.0) * 0.7;
      float ambient = 0.3;

      float lighting = diffuse + ambient;
      vec3 finalColor = color * lighting;

      gl_FragColor = vec4(finalColor, 1.0);
    }
  `;

  return new THREE.ShaderMaterial({
    uniforms: {
      minElevation: { value: minElevation },
      maxElevation: { value: maxElevation },
      alpha: { value: 0.001 },
      lightDirection: { value: new THREE.Vector3(1, 0, 0).normalize() }  // Parallel sun light
    },
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide,
    extensions: {
      derivatives: true // Enable GL_OES_standard_derivatives
    }
  });
}
