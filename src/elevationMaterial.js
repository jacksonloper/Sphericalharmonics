/**
 * Elevation Material for three.js
 * Creates shader materials for visualizing elevation data on spherical meshes
 */

import * as THREE from 'three';

/**
 * Create a material for visualizing elevation data with FLAT shading
 * Uses fragment derivatives to compute face normals (good for high-resolution meshes)
 *
 * @param {number} minElevation - Minimum elevation value
 * @param {number} maxElevation - Maximum elevation value
 * @returns {THREE.ShaderMaterial} Material with elevation-based coloring
 */
export function createElevationMaterial(minElevation = -500, maxElevation = 9000) {
  const vertexShader = `
    attribute float elevation;
    uniform float alpha;
    varying float vElevation;
    varying vec3 vPosition;

    void main() {
      vElevation = elevation;

      // Compute radial displacement: r = (clamp(e)/6006) + alpha * (1 - clamp(e)/6006)
      float e = max(0.0, elevation); // Clamp to non-negative
      float normalizedE = e / 6006.0;
      float radius = normalizedE + alpha * (1.0 - normalizedE);

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
      alpha: { value: 0.001 },
      lightDirection: { value: new THREE.Vector3(1, 1, 1).normalize() },     // Key light from top-right
      lightDirection2: { value: new THREE.Vector3(-1, -0.5, 0.5).normalize() } // Fill light from left-bottom
    },
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide,
    extensions: {
      derivatives: true // Enable GL_OES_standard_derivatives
    }
  });
}

/**
 * Create a material for visualizing elevation data with SMOOTH/VERTEX shading
 * Uses pre-computed vertex normals from analytical gradients (good for lower-resolution meshes)
 *
 * @param {number} minElevation - Minimum elevation value
 * @param {number} maxElevation - Maximum elevation value
 * @returns {THREE.ShaderMaterial} Material with elevation-based coloring and smooth normals
 */
export function createSmoothElevationMaterial(minElevation = -500, maxElevation = 9000) {
  const vertexShader = `
    attribute float elevation;
    uniform float alpha;
    varying float vElevation;
    varying vec3 vNormal;
    varying vec3 vPosition;

    void main() {
      vElevation = elevation;
      vNormal = normalMatrix * normal;  // Transform normal to view space

      // Compute radial displacement: r = (clamp(e)/6006) + alpha * (1 - clamp(e)/6006)
      float e = max(0.0, elevation); // Clamp to non-negative
      float normalizedE = e / 6006.0;
      float radius = normalizedE + alpha * (1.0 - normalizedE);

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
    uniform vec3 lightDirection2;

    varying float vElevation;
    varying vec3 vNormal;
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

      // Smooth shading: use interpolated vertex normal
      vec3 normal = normalize(vNormal);

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
      alpha: { value: 0.001 },
      lightDirection: { value: new THREE.Vector3(1, 1, 1).normalize() },
      lightDirection2: { value: new THREE.Vector3(-1, -0.5, 0.5).normalize() }
    },
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide
  });
}
