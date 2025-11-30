/**
 * Contour mesh loader for marching-triangles-based contour data
 * Loads pre-computed triangle meshes for each elevation level
 */

import * as THREE from 'three';

/**
 * Load contour mesh data from binary file
 *
 * Format (CNTR3):
 *   Header: 'CNTR3' (5 bytes)
 *   num_levels: uint16
 *   For each level:
 *     elevation: float32
 *     num_vertices: uint32
 *     num_triangles: uint32
 *     index_format: uint8 (1=uint16, 0=uint32)
 *     vertices: int16[num_vertices * 3] (quantized)
 *     indices: uint16 or uint32[num_triangles * 3]
 *
 * @param {string} url - Path to the contour mesh file
 * @param {function} onProgress - Progress callback
 * @returns {Promise<Array>} Array of {elevation, vertices, indices} objects
 */
export async function loadContourMeshData(url, onProgress) {
  if (onProgress) onProgress({ type: 'status', message: 'Downloading contour mesh...' });

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  const dataView = new DataView(buffer);

  let offset = 0;

  // Read header
  const header = new TextDecoder().decode(new Uint8Array(buffer, offset, 5));
  offset += 5;

  if (header !== 'CNTR3') {
    throw new Error('Invalid contour mesh file format (expected CNTR3)');
  }

  // Read number of levels
  const numLevels = dataView.getUint16(offset, true);
  offset += 2;

  console.log(`Loading ${numLevels} contour levels...`);

  const levels = [];
  let totalTriangles = 0;
  let totalVertices = 0;

  for (let i = 0; i < numLevels; i++) {
    // Read elevation
    const elevation = dataView.getFloat32(offset, true);
    offset += 4;

    // Read counts
    const numVertices = dataView.getUint32(offset, true);
    offset += 4;

    const numTriangles = dataView.getUint32(offset, true);
    offset += 4;

    // Read index format flag
    const useUint16 = dataView.getUint8(offset) === 1;
    offset += 1;

    if (numTriangles === 0) {
      continue;
    }

    // Read quantized vertices and dequantize
    const vertices = new Float32Array(numVertices * 3);
    for (let j = 0; j < numVertices * 3; j++) {
      const quantized = dataView.getInt16(offset, true);
      vertices[j] = quantized / 32767.0;
      offset += 2;
    }

    // Read indices
    const indices = useUint16 ? new Uint16Array(numTriangles * 3) : new Uint32Array(numTriangles * 3);
    for (let j = 0; j < numTriangles * 3; j++) {
      indices[j] = useUint16 ? dataView.getUint16(offset, true) : dataView.getUint32(offset, true);
      offset += useUint16 ? 2 : 4;
    }

    levels.push({
      elevation,
      vertices,
      indices,
      triangleCount: numTriangles,
      vertexCount: numVertices
    });

    totalTriangles += numTriangles;
    totalVertices += numVertices;

    if (onProgress && (i % 5 === 0 || i === numLevels - 1)) {
      onProgress({
        type: 'progress',
        message: `Loaded ${i + 1}/${numLevels} levels (${totalTriangles.toLocaleString()} triangles)`,
        current: i + 1,
        total: numLevels
      });
    }
  }

  console.log(`  Total triangles: ${totalTriangles.toLocaleString()}`);
  console.log(`  Total vertices: ${totalVertices.toLocaleString()}`);

  return levels;
}

/**
 * Create THREE.js geometry from contour mesh data
 *
 * @param {Array} levels - Array of contour levels from loadContourMeshData
 * @param {Object} options - Options for geometry creation
 * @returns {THREE.BufferGeometry}
 */
export function createContourMeshGeometry(levels, options = {}) {
  const { onProgress } = options;

  if (onProgress) {
    onProgress({
      type: 'geometry',
      message: 'Building geometry...',
      levels: levels.length
    });
  }

  // Calculate total counts
  const totalVertices = levels.reduce((sum, level) => sum + level.vertexCount, 0);
  const totalIndices = levels.reduce((sum, level) => sum + level.triangleCount * 3, 0);
  const totalTriangles = levels.reduce((sum, level) => sum + level.triangleCount, 0);

  console.log(`Building geometry with ${totalTriangles.toLocaleString()} triangles...`);

  // Allocate buffers
  const positions = new Float32Array(totalVertices * 3);
  const elevations = new Float32Array(totalVertices);
  const indices = new Uint32Array(totalIndices);

  let vertexOffset = 0;
  let indexOffset = 0;
  let baseVertex = 0;

  // Process each level
  for (const level of levels) {
    const { elevation, vertices, indices: levelIndices, vertexCount, triangleCount } = level;

    // Copy vertices
    positions.set(vertices, vertexOffset * 3);

    // Fill elevation attribute
    for (let i = 0; i < vertexCount; i++) {
      elevations[vertexOffset + i] = elevation;
    }

    // Copy indices with offset
    for (let i = 0; i < levelIndices.length; i++) {
      indices[indexOffset + i] = baseVertex + levelIndices[i];
    }

    vertexOffset += vertexCount;
    indexOffset += levelIndices.length;
    baseVertex += vertexCount;
  }

  // Create geometry
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('elevation', new THREE.BufferAttribute(elevations, 1));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));

  // Compute normals
  geometry.computeVertexNormals();

  // Find elevation range
  const elevationValues = levels.map(l => l.elevation);
  const elevationMin = Math.min(...elevationValues);
  const elevationMax = Math.max(...elevationValues);

  // Store metadata
  geometry.userData.elevationMin = elevationMin;
  geometry.userData.elevationMax = elevationMax;
  geometry.userData.levelCount = levels.length;
  geometry.userData.triangleCount = totalTriangles;

  console.log(`  Geometry created: ${totalVertices.toLocaleString()} vertices`);
  console.log(`  Elevation range: ${elevationMin.toFixed(1)} to ${elevationMax.toFixed(1)} m`);

  return geometry;
}
