/**
 * Contour mesh loader for marching-triangles-based contour data
 * Loads pre-computed triangle meshes for each elevation level
 */

import * as THREE from 'three';

/**
 * Load contour mesh data from binary file
 *
 * Format:
 *   Header: 'CONTOUR' (7 bytes)
 *   num_levels: uint16
 *   For each level:
 *     elevation: float32
 *     num_triangles: uint32
 *     For each triangle:
 *       9 float32 values (3 vertices × 3 coordinates)
 *
 * @param {string} url - Path to the contour mesh file
 * @param {function} onProgress - Progress callback
 * @returns {Promise<Array>} Array of {elevation, triangles} objects
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
  const header = new TextDecoder().decode(new Uint8Array(buffer, offset, 7));
  offset += 7;

  if (header !== 'CONTOUR') {
    throw new Error('Invalid contour mesh file format');
  }

  // Read number of levels
  const numLevels = dataView.getUint16(offset, true);
  offset += 2;

  console.log(`Loading ${numLevels} contour levels...`);

  const levels = [];
  let totalTriangles = 0;

  for (let i = 0; i < numLevels; i++) {
    // Read elevation
    const elevation = dataView.getFloat32(offset, true);
    offset += 4;

    // Read number of triangles
    const numTriangles = dataView.getUint32(offset, true);
    offset += 4;

    if (numTriangles === 0) {
      continue;
    }

    // Read triangle vertices (3 vertices × 3 coords × 4 bytes per triangle)
    const triangleData = new Float32Array(numTriangles * 9);
    for (let j = 0; j < numTriangles * 9; j++) {
      triangleData[j] = dataView.getFloat32(offset, true);
      offset += 4;
    }

    levels.push({
      elevation,
      triangles: triangleData,
      triangleCount: numTriangles
    });

    totalTriangles += numTriangles;

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

  // Calculate total triangles
  const totalTriangles = levels.reduce((sum, level) => sum + level.triangleCount, 0);
  const totalVertices = totalTriangles * 3;

  console.log(`Building geometry with ${totalTriangles.toLocaleString()} triangles...`);

  // Allocate buffers
  const positions = new Float32Array(totalVertices * 3);
  const elevations = new Float32Array(totalVertices);

  let vertexOffset = 0;

  // Process each level
  for (const level of levels) {
    const { elevation, triangles, triangleCount } = level;

    // Copy triangle data to positions
    positions.set(triangles, vertexOffset * 3);

    // Fill elevation attribute
    for (let i = 0; i < triangleCount * 3; i++) {
      elevations[vertexOffset + i] = elevation;
    }

    vertexOffset += triangleCount * 3;
  }

  // Create geometry
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('elevation', new THREE.BufferAttribute(elevations, 1));

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
