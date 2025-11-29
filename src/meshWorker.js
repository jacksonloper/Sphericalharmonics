/**
 * Web Worker for generating icosahedral mesh geometry
 * This offloads the CPU-intensive subdivision calculations to a background thread
 */

/**
 * Create icosahedron base mesh
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
 * Subdivide mesh
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
 * Generate icosahedral mesh geometry with progress reporting
 */
function generateIcosahedronGeometry(subdivisions) {
  let { vertices, indices } = createIcosahedron();

  for (let i = 0; i < subdivisions; i++) {
    const result = subdivideMesh(vertices, indices);
    vertices = result.vertices;
    indices = result.indices;
    
    // Report progress after each subdivision
    self.postMessage({
      type: 'progress',
      subdivision: i + 1,
      totalSubdivisions: subdivisions,
      vertices: vertices.length,
      triangles: indices.length / 3
    });
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
 * Compute vertex normals from positions and indices
 */
function computeVertexNormals(positions, indices) {
  const numVertices = positions.length / 3;
  const normals = new Float32Array(positions.length);
  
  // Accumulate face normals for each vertex
  for (let i = 0; i < indices.length; i += 3) {
    const i1 = indices[i], i2 = indices[i + 1], i3 = indices[i + 2];
    
    const ax = positions[i1 * 3], ay = positions[i1 * 3 + 1], az = positions[i1 * 3 + 2];
    const bx = positions[i2 * 3], by = positions[i2 * 3 + 1], bz = positions[i2 * 3 + 2];
    const cx = positions[i3 * 3], cy = positions[i3 * 3 + 1], cz = positions[i3 * 3 + 2];
    
    // Edge vectors
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    
    // Cross product (face normal)
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    
    // Add to each vertex
    normals[i1 * 3] += nx; normals[i1 * 3 + 1] += ny; normals[i1 * 3 + 2] += nz;
    normals[i2 * 3] += nx; normals[i2 * 3 + 1] += ny; normals[i2 * 3 + 2] += nz;
    normals[i3 * 3] += nx; normals[i3 * 3 + 1] += ny; normals[i3 * 3 + 2] += nz;
  }
  
  // Normalize
  for (let i = 0; i < numVertices; i++) {
    const x = normals[i * 3], y = normals[i * 3 + 1], z = normals[i * 3 + 2];
    const len = Math.sqrt(x * x + y * y + z * z);
    if (len > 0) {
      normals[i * 3] /= len;
      normals[i * 3 + 1] /= len;
      normals[i * 3 + 2] /= len;
    }
  }
  
  return normals;
}

// Handle messages from main thread
self.onmessage = function(e) {
  const { subdivisions, elevationData } = e.data;
  
  self.postMessage({ type: 'status', message: 'Generating mesh geometry...' });
  
  // Generate geometry
  const { positions, indices, numVertices } = generateIcosahedronGeometry(subdivisions);
  
  self.postMessage({ type: 'status', message: 'Computing normals...' });
  
  // Compute normals in worker
  const normals = computeVertexNormals(positions, indices);
  
  self.postMessage({ type: 'status', message: 'Finalizing...' });
  
  // Transfer buffers to main thread (zero-copy)
  self.postMessage({
    type: 'complete',
    positions: positions.buffer,
    indices: indices.buffer,
    normals: normals.buffer,
    elevationData: elevationData,
    numVertices: numVertices
  }, [positions.buffer, indices.buffer, normals.buffer]);
};
