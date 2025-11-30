/**
 * Bedrock Material for three.js
 * Creates shader materials for visualizing bedrock elevation data on spherical meshes
 * Uses alpha + (1-alpha)|e|/6000 for radius
 * Colormap: black at lowest depth → blue → green → white at highest peak
 * 
 * Note: Bedrock data has a wider elevation range than surface data:
 * - Bedrock min is around -10500m (deepest ocean trenches)
 * - Bedrock max is around +6300m (highest peaks)
 * The 6000 divisor is chosen to normalize the visualization appropriately.
 */

import * as THREE from 'three';

/**
 * Create a material for visualizing bedrock elevation data with FLAT shading
 * Uses fragment derivatives to compute face normals (good for high-resolution meshes)
 * Uses multiple lights for full illumination from all angles
 *
 * @param {number} minElevation - Minimum elevation value (default -10000m for deep ocean)
 * @param {number} maxElevation - Maximum elevation value (default 6000m for land peaks)
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

      // Compute radial displacement: r = alpha + (1-alpha)|e|/6000
      // The 6000 divisor normalizes bedrock elevations (typically -10500m to +6300m)
      // to produce a reasonable visual radius range for the sphere
      float absE = abs(elevation);
      float radius = alpha + (1.0 - alpha) * absE / 6000.0;

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
        // From green at sea level to white at highest peak
        color = mix(vec3(0.2, 0.7, 0.2), vec3(1.0, 1.0, 1.0), t);
      } else {
        // Below sea level: black at deepest → blue at sea level
        float t = vElevation / minElevation;
        t = clamp(t, 0.0, 1.0);
        // From blue at sea level (t=0) to black at deepest (t=1)
        color = mix(vec3(0.2, 0.4, 0.8), vec3(0.0, 0.0, 0.0), t);
      }

      // Flat shading: compute face normal from position derivatives
      vec3 fdx = dFdx(vPosition);
      vec3 fdy = dFdy(vPosition);
      vec3 normal = normalize(cross(fdx, fdy));

      // Multi-directional lighting for full illumination
      // Multiple lights from different directions ensure all surfaces are well lit
      vec3 light1 = normalize(vec3(1.0, 1.0, 1.0));
      vec3 light2 = normalize(vec3(-1.0, 0.5, -0.5));
      vec3 light3 = normalize(vec3(0.0, -1.0, 0.5));
      vec3 light4 = normalize(vec3(-0.5, 1.0, -1.0));

      float diffuse1 = max(dot(normal, light1), 0.0) * 0.25;
      float diffuse2 = max(dot(normal, light2), 0.0) * 0.2;
      float diffuse3 = max(dot(normal, light3), 0.0) * 0.15;
      float diffuse4 = max(dot(normal, light4), 0.0) * 0.15;
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
      alpha: { value: 0.75 }
    },
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide,
    extensions: {
      derivatives: true // Enable GL_OES_standard_derivatives
    }
  });
}
