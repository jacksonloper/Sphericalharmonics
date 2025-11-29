/**
 * Compact mesh loader - only stores elevation data
 * Generates icosahedral geometry procedurally
 */

import * as THREE from 'three';

/**
 * Create icosahedron base mesh (same as our generator)
 */
function createIcosahedron() {
  const t = (1 + Math.sqrt(5)) / 2;

  const positions = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]
  ];

  const vertices = positions.map(([x, y, z]) => {
    const len = Math.sqrt(x * x + y * y + z * z);
    return [x / len, y / len, z / len];
  });

  const indices = [
    0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11,
    1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
    3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9,
    4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1
  ];

  return { vertices, indices };
}

/**
 * Subdivide mesh (same as our generator)
 */
function subdivideMesh(vertices, indices) {
  const midpointCache = new Map();

  function getMidpoint(i1, i2) {
    const key = i1 < i2 ? `${i1},${i2}` : `${i2},${i1}`;
    if (midpointCache.has(key)) return midpointCache.get(key);

    const [x1, y1, z1] = vertices[i1];
    const [x2, y2, z2] = vertices[i2];

    let x = (x1 + x2) / 2;
    let y = (y1 + y2) / 2;
    let z = (z1 + z2) / 2;

    const len = Math.sqrt(x * x + y * y + z * z);
    x /= len; y /= len; z /= len;

    const index = vertices.length;
    vertices.push([x, y, z]);
    midpointCache.set(key, index);
    return index;
  }

  const newIndices = [];
  for (let i = 0; i < indices.length; i += 3) {
    const v1 = indices[i], v2 = indices[i + 1], v3 = indices[i + 2];
    const a = getMidpoint(v1, v2);
    const b = getMidpoint(v2, v3);
    const c = getMidpoint(v3, v1);

    newIndices.push(v1, a, c, v2, b, a, v3, c, b, a, b, c);
  }

  return { vertices, indices: newIndices };
}

/**
 * Generate icosahedral mesh geometry
 */
function generateIcosahedronGeometry(subdivisions) {
  let { vertices, indices } = createIcosahedron();

  for (let i = 0; i < subdivisions; i++) {
    const result = subdivideMesh(vertices, indices);
    vertices = result.vertices;
    indices = result.indices;
  }

  // Flatten to typed arrays
  const positions = new Float32Array(vertices.length * 3);
  for (let i = 0; i < vertices.length; i++) {
    positions[i * 3] = vertices[i][0];
    positions[i * 3 + 1] = vertices[i][1];
    positions[i * 3 + 2] = vertices[i][2];
  }

  const indicesArray = new Uint32Array(indices);

  return { positions, indices: indicesArray, numVertices: vertices.length };
}

/**
 * Load compact elevation-only mesh file
 * Format: 'HPELEV' + subdivisions (1 byte) + elevation data (float32[])
 */
export async function loadCompactMesh(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  const dataView = new DataView(buffer);

  let offset = 0;

  // Read header (6 bytes: 'HPELEV')
  const header = new TextDecoder().decode(new Uint8Array(buffer, offset, 6));
  offset += 6;

  if (header !== 'HPELEV') {
    throw new Error('Invalid compact mesh file format');
  }

  // Read subdivision level
  const subdivisions = dataView.getUint8(offset);
  offset += 1;

  console.log(`Loading compact mesh: subdivision ${subdivisions}`);

  // Generate geometry procedurally
  const { positions, indices, numVertices } = generateIcosahedronGeometry(subdivisions);

  // Read elevation data
  const elevation = new Float32Array(numVertices);
  for (let i = 0; i < numVertices; i++) {
    elevation[i] = dataView.getFloat32(offset, true);
    offset += 4;
  }

  console.log(`  Vertices: ${numVertices.toLocaleString()}`);
  console.log(`  Triangles: ${(indices.length / 3).toLocaleString()}`);

  // Create geometry
  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('elevation', new THREE.BufferAttribute(elevation, 1));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));

  geometry.computeVertexNormals();

  // Store elevation range (without spread operator to avoid stack overflow)
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
