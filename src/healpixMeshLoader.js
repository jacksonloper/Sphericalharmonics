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

  // Store elevation range as metadata
  const elevationArray = Array.from(elevation);
  geometry.userData.elevationMin = Math.min(...elevationArray);
  geometry.userData.elevationMax = Math.max(...elevationArray);

  console.log(`  Elevation range: ${geometry.userData.elevationMin.toFixed(1)} to ${geometry.userData.elevationMax.toFixed(1)} m`);

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
    uniform vec3 oceanColor;
    uniform vec3 lowColor;
    uniform vec3 midColor;
    uniform vec3 highColor;
    uniform vec3 lightDirection;

    varying float vElevation;
    varying vec3 vNormal;
    varying vec3 vPosition;

    void main() {
      // Normalize elevation to [0, 1]
      float t = (vElevation - minElevation) / (maxElevation - minElevation);
      t = clamp(t, 0.0, 1.0);

      // Color mapping
      vec3 color;
      if (vElevation < 0.0) {
        // Below sea level - ocean blue
        float oceanT = (vElevation - minElevation) / (0.0 - minElevation);
        color = mix(oceanColor, lowColor, oceanT);
      } else if (t < 0.33) {
        // Low elevation - green
        color = mix(lowColor, midColor, t / 0.33);
      } else if (t < 0.66) {
        // Mid elevation - brown/tan
        color = mix(midColor, highColor, (t - 0.33) / 0.33);
      } else {
        // High elevation - white
        color = highColor;
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
      oceanColor: { value: new THREE.Color(0x1e3a5f) }, // Deep blue
      lowColor: { value: new THREE.Color(0x4a7c59) },   // Green
      midColor: { value: new THREE.Color(0x9b6b4e) },   // Brown
      highColor: { value: new THREE.Color(0xffffff) },  // White
      lightDirection: { value: new THREE.Vector3(1, 1, 1).normalize() }
    },
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide
  });
}
