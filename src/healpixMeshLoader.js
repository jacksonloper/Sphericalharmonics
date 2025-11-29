/**
 * HEALPix Mesh Loader for three.js
 * Loads binary mesh files generated from HEALPix data
 */

import * as THREE from 'three';

/**
 * Load a HEALPix mesh file and create a THREE.BufferGeometry
 *
 * @param {string} url - Path to the .bin mesh file
 * @returns {Promise<THREE.BufferGeometry>} The loaded mesh geometry
 */
export async function loadHealpixMesh(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  const dataView = new DataView(buffer);

  let offset = 0;

  // Read header (6 bytes: 'HPMESH')
  const header = new TextDecoder().decode(new Uint8Array(buffer, offset, 6));
  offset += 6;

  if (header !== 'HPMESH') {
    throw new Error('Invalid mesh file format');
  }

  // Read metadata
  const numVertices = dataView.getUint32(offset, true);
  offset += 4;

  const numIndices = dataView.getUint32(offset, true);
  offset += 4;

  const indexType = dataView.getUint8(offset);
  offset += 1;

  console.log(`Loading HEALPix mesh:`);
  console.log(`  Vertices: ${numVertices.toLocaleString()}`);
  console.log(`  Triangles: ${(numIndices / 3).toLocaleString()}`);
  console.log(`  Index type: uint${indexType * 8}`);

  // Read positions (float32[numVertices * 3])
  // Copy data to avoid alignment issues
  const positions = new Float32Array(numVertices * 3);
  for (let i = 0; i < numVertices * 3; i++) {
    positions[i] = dataView.getFloat32(offset, true);
    offset += 4;
  }

  // Read indices (uint16 or uint32)
  let indices;
  if (indexType === 2) {
    indices = new Uint16Array(numIndices);
    for (let i = 0; i < numIndices; i++) {
      indices[i] = dataView.getUint16(offset, true);
      offset += 2;
    }
  } else {
    indices = new Uint32Array(numIndices);
    for (let i = 0; i < numIndices; i++) {
      indices[i] = dataView.getUint32(offset, true);
      offset += 4;
    }
  }

  // Read elevation data (float32[numVertices])
  const elevation = new Float32Array(numVertices);
  for (let i = 0; i < numVertices; i++) {
    elevation[i] = dataView.getFloat32(offset, true);
    offset += 4;
  }

  // Create geometry
  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('elevation', new THREE.BufferAttribute(elevation, 1));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));

  // Compute normals for lighting
  geometry.computeVertexNormals();

  // Store elevation range as metadata (avoid spread operator for large arrays)
  let elevationMin = elevation[0];
  let elevationMax = elevation[0];
  for (let i = 1; i < elevation.length; i++) {
    if (elevation[i] < elevationMin) elevationMin = elevation[i];
    if (elevation[i] > elevationMax) elevationMax = elevation[i];
  }
  geometry.userData.elevationMin = elevationMin;
  geometry.userData.elevationMax = elevationMax;

  console.log(`  Elevation range: ${elevationMin.toFixed(1)} to ${elevationMax.toFixed(1)} m`);

  return geometry;
}

/**
 * Create a material for visualizing elevation data
 *
 * @param {number} minElevation - Minimum elevation value
 * @param {number} maxElevation - Maximum elevation value
 * @returns {THREE.ShaderMaterial} Material with elevation-based coloring
 */
export function createElevationMaterial(minElevation = -500, maxElevation = 9000) {
  const vertexShader = `
    attribute float elevation;
    varying float vElevation;
    varying vec3 vNormal;
    varying vec3 vPosition;

    void main() {
      vElevation = elevation;
      vNormal = normalMatrix * normal;
      vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
    uniform float minElevation;
    uniform float maxElevation;
    uniform vec3 lightDirection;

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

      // Simple lighting
      vec3 normal = normalize(vNormal);
      vec3 lightDir = normalize(lightDirection);
      float diffuse = max(dot(normal, lightDir), 0.0);

      // Ambient + diffuse
      vec3 ambient = color * 0.4;
      vec3 diffuseColor = color * diffuse * 0.6;

      gl_FragColor = vec4(ambient + diffuseColor, 1.0);
    }
  `;

  return new THREE.ShaderMaterial({
    uniforms: {
      minElevation: { value: minElevation },
      maxElevation: { value: maxElevation },
      lightDirection: { value: new THREE.Vector3(1, 1, 1).normalize() }
    },
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide
  });
}
