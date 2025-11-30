/**
 * Compact mesh loader - only stores elevation data
 * Generates icosahedral geometry procedurally with Web Worker support
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
 * Generate geometry using Web Worker for better performance
 * @param {number} subdivisions - Number of subdivisions
 * @param {Float32Array} elevationData - Elevation data to attach
 * @param {function} onProgress - Progress callback
 * @returns {Promise} Resolves with { positions, indices, normals }
 */
function generateGeometryWithWorker(subdivisions, elevationData, onProgress) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./meshWorker.js', import.meta.url), { type: 'module' });
    
    worker.onmessage = (e) => {
      const { type } = e.data;
      
      if (type === 'progress' && onProgress) {
        onProgress({
          type: 'subdivision',
          current: e.data.subdivision,
          total: e.data.totalSubdivisions,
          vertices: e.data.vertices
        });
      } else if (type === 'status' && onProgress) {
        onProgress({ type: 'status', message: e.data.message });
      } else if (type === 'complete') {
        const positions = new Float32Array(e.data.positions);
        const indices = new Uint32Array(e.data.indices);
        const normals = new Float32Array(e.data.normals);
        worker.terminate();
        resolve({ positions, indices, normals, numVertices: e.data.numVertices });
      }
    };
    
    worker.onerror = (err) => {
      worker.terminate();
      reject(err);
    };
    
    // Transfer elevation data to worker
    worker.postMessage({
      subdivisions,
      elevationData: elevationData.buffer
    }, [elevationData.buffer]);
  });
}

/**
 * Load compact elevation-only mesh file
 * Format: 'HPELEV' + subdivisions (1 byte) + elevation data (float32[])
 * 
 * @param {string} url - Path to the .bin mesh file
 * @param {Object} options - Loading options
 * @param {function} options.onProgress - Progress callback for long operations
 * @param {boolean} options.useWorker - Use Web Worker for geometry generation (recommended for subdivision >= 8)
 */
export async function loadCompactMesh(url, options = {}) {
  const { onProgress, useWorker = false } = options;
  
  if (onProgress) onProgress({ type: 'status', message: 'Downloading mesh data...' });
  
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
  if (onProgress) onProgress({ type: 'status', message: `Generating mesh (subdivision ${subdivisions})...` });

  let positions, indices, numVertices, normals;
  
  if (useWorker && typeof Worker !== 'undefined') {
    // Use Web Worker for heavy computation
    const result = await generateGeometryWithWorker(subdivisions, new Float32Array(0), onProgress);
    positions = result.positions;
    indices = result.indices;
    normals = result.normals;
    numVertices = result.numVertices;
  } else {
    // Generate geometry on main thread
    const result = generateIcosahedronGeometry(subdivisions);
    positions = result.positions;
    indices = result.indices;
    numVertices = result.numVertices;
  }

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

  // Use pre-computed normals from worker, or compute on main thread
  if (normals) {
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  } else {
    geometry.computeVertexNormals();
  }

  // Store elevation range (without spread operator to avoid stack overflow)
  let elevationMin = elevation[0];
  let elevationMax = elevation[0];
  for (let i = 1; i < elevation.length; i++) {
    if (elevation[i] < elevationMin) elevationMin = elevation[i];
    if (elevation[i] > elevationMax) elevationMax = elevation[i];
  }
  geometry.userData.elevationMin = elevationMin;
  geometry.userData.elevationMax = elevationMax;
  geometry.userData.subdivisions = subdivisions;

  console.log(`  Elevation range: ${elevationMin.toFixed(1)} to ${elevationMax.toFixed(1)} m`);

  return geometry;
}

/**
 * Load gradient mesh file with elevation + analytical gradients
 * Format: 'HPGRAD' + subdivisions (1 byte) + elevation[] + d_lat[] + d_lon[]
 * 
 * The gradients allow computing smooth vertex normals from the analytical
 * spherical harmonic derivatives, enabling smooth shading with fewer vertices.
 * 
 * @param {string} url - Path to the gradient .bin mesh file
 * @param {Object} options - Loading options
 * @param {function} options.onProgress - Progress callback for long operations
 * @param {boolean} options.useWorker - Use Web Worker for geometry generation
 */
export async function loadGradientMesh(url, options = {}) {
  const { onProgress, useWorker = false } = options;
  
  if (onProgress) onProgress({ type: 'status', message: 'Downloading gradient mesh data...' });
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  const dataView = new DataView(buffer);

  let offset = 0;

  // Read header (6 bytes: 'HPGRAD')
  const header = new TextDecoder().decode(new Uint8Array(buffer, offset, 6));
  offset += 6;

  if (header !== 'HPGRAD') {
    throw new Error('Invalid gradient mesh file format');
  }

  // Read subdivision level
  const subdivisions = dataView.getUint8(offset);
  offset += 1;

  console.log(`Loading gradient mesh: subdivision ${subdivisions}`);
  if (onProgress) onProgress({ type: 'status', message: `Generating mesh (subdivision ${subdivisions})...` });

  let positions, indices, numVertices;
  
  if (useWorker && typeof Worker !== 'undefined') {
    const result = await generateGeometryWithWorker(subdivisions, new Float32Array(0), onProgress);
    positions = result.positions;
    indices = result.indices;
    numVertices = result.numVertices;
  } else {
    const result = generateIcosahedronGeometry(subdivisions);
    positions = result.positions;
    indices = result.indices;
    numVertices = result.numVertices;
  }

  // Read elevation data
  const elevation = new Float32Array(numVertices);
  for (let i = 0; i < numVertices; i++) {
    elevation[i] = dataView.getFloat32(offset, true);
    offset += 4;
  }

  // Read gradient data (d_lat, d_lon)
  const d_lat = new Float32Array(numVertices);
  for (let i = 0; i < numVertices; i++) {
    d_lat[i] = dataView.getFloat32(offset, true);
    offset += 4;
  }

  const d_lon = new Float32Array(numVertices);
  for (let i = 0; i < numVertices; i++) {
    d_lon[i] = dataView.getFloat32(offset, true);
    offset += 4;
  }

  console.log(`  Vertices: ${numVertices.toLocaleString()}`);
  console.log(`  Triangles: ${(indices.length / 3).toLocaleString()}`);

  // Compute analytical vertex normals from gradients
  // The gradient (d_lat, d_lon) gives the tangent plane to the elevation surface
  // We compute the normal by cross product of tangent vectors
  const normals = computeNormalsFromGradients(positions, d_lat, d_lon);

  // Create geometry
  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('elevation', new THREE.BufferAttribute(elevation, 1));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));

  // Store elevation range
  let elevationMin = elevation[0];
  let elevationMax = elevation[0];
  for (let i = 1; i < elevation.length; i++) {
    if (elevation[i] < elevationMin) elevationMin = elevation[i];
    if (elevation[i] > elevationMax) elevationMax = elevation[i];
  }
  geometry.userData.elevationMin = elevationMin;
  geometry.userData.elevationMax = elevationMax;
  geometry.userData.subdivisions = subdivisions;
  geometry.userData.hasGradients = true;

  console.log(`  Elevation range: ${elevationMin.toFixed(1)} to ${elevationMax.toFixed(1)} m`);

  return geometry;
}

/**
 * Compute vertex normals from analytical gradients (d_lat, d_lon)
 * 
 * At each vertex on the sphere, we have:
 * - Position (x, y, z) on unit sphere
 * - d_elev/d_lat and d_elev/d_lon (elevation gradients)
 * 
 * The surface normal is computed by finding tangent vectors in lat/lon directions
 * and taking their cross product.
 */
function computeNormalsFromGradients(positions, d_lat, d_lon) {
  const numVertices = positions.length / 3;
  const normals = new Float32Array(numVertices * 3);

  for (let i = 0; i < numVertices; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];

    // Compute lat/lon from position
    const lat = Math.asin(Math.max(-1, Math.min(1, z)));
    const lon = Math.atan2(y, x);
    const cosLat = Math.cos(lat);

    // Scale factor: elevation gradients are in m/degree
    // Convert to appropriate scale for visualization
    // We want the normal to point outward with gradient contribution
    const scale = 0.0001; // Adjust for visible effect

    // Tangent vector in latitude direction (pointing north)
    // d(x,y,z)/d_lat at constant lon
    const tLatX = -Math.sin(lat) * Math.cos(lon);
    const tLatY = -Math.sin(lat) * Math.sin(lon);
    const tLatZ = Math.cos(lat);

    // Tangent vector in longitude direction (pointing east)  
    // d(x,y,z)/d_lon at constant lat
    const tLonX = -Math.sin(lon) * cosLat;
    const tLonY = Math.cos(lon) * cosLat;
    const tLonZ = 0;

    // Surface gradient contribution
    // The elevation function f(lat, lon) creates a surface r = 1 + f
    // The gradient vectors become:
    // T_lat = (tLat) + scale * d_lat[i] * radial
    // T_lon = (tLon) + scale * d_lon[i] * radial
    const dLat = d_lat[i] * scale;
    const dLon = d_lon[i] * scale;

    // Modified tangent vectors including elevation gradient
    const t1x = tLatX + dLat * x;
    const t1y = tLatY + dLat * y;
    const t1z = tLatZ + dLat * z;

    const t2x = tLonX + dLon * x;
    const t2y = tLonY + dLon * y;
    const t2z = tLonZ + dLon * z;

    // Cross product t1 × t2 gives normal
    let nx = t1y * t2z - t1z * t2y;
    let ny = t1z * t2x - t1x * t2z;
    let nz = t1x * t2y - t1y * t2x;

    // Normalize
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len > 0) {
      nx /= len;
      ny /= len;
      nz /= len;
    }

    // Ensure normal points outward (dot with position should be positive)
    const dot = nx * x + ny * y + nz * z;
    if (dot < 0) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }

    normals[i * 3] = nx;
    normals[i * 3 + 1] = ny;
    normals[i * 3 + 2] = nz;
  }

  return normals;
}
