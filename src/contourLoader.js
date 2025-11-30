/**
 * Contour polygon loader - loads and processes contour data for 3D rendering
 * Converts lat/lon polygons to 3D spherical coordinates and creates extruded meshes
 */

import * as THREE from 'three';

/**
 * Load contour data from binary file
 * @param {string} url - Path to the contour binary file
 * @param {function} onProgress - Optional progress callback
 * @returns {Promise<Array>} Array of { elevation, polygons } objects
 */
export async function loadContourData(url, onProgress) {
  if (onProgress) onProgress({ type: 'status', message: 'Downloading contour data...' });
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  const dataView = new DataView(buffer);
  let offset = 0;

  // Read header (7 bytes: 'CONTOUR')
  const header = new TextDecoder().decode(new Uint8Array(buffer, offset, 7));
  offset += 7;

  if (header !== 'CONTOUR') {
    throw new Error('Invalid contour file format');
  }

  // Read number of levels
  const numLevels = dataView.getUint16(offset, true);
  offset += 2;

  if (onProgress) onProgress({ type: 'status', message: `Loading ${numLevels} contour levels...` });

  const levels = [];
  let totalPolygons = 0;

  for (let i = 0; i < numLevels; i++) {
    // Read elevation
    const elevation = dataView.getFloat32(offset, true);
    offset += 4;

    // Read number of polygons (uint32)
    const numPolygons = dataView.getUint32(offset, true);
    offset += 4;

    const polygons = [];
    for (let j = 0; j < numPolygons; j++) {
      // Read number of vertices (uint32)
      const numVertices = dataView.getUint32(offset, true);
      offset += 4;

      // Read vertices (lon, lat pairs as float32)
      const vertices = new Float32Array(numVertices * 2);
      for (let k = 0; k < numVertices * 2; k++) {
        vertices[k] = dataView.getFloat32(offset, true);
        offset += 4;
      }

      polygons.push(vertices);
    }

    if (polygons.length > 0) {
      levels.push({ elevation, polygons });
      totalPolygons += polygons.length;
    }

    if (onProgress) {
      onProgress({
        type: 'progress',
        current: i + 1,
        total: numLevels,
        message: `Level ${i + 1}/${numLevels}: ${elevation.toFixed(0)}m`
      });
    }
  }

  console.log(`Loaded ${levels.length} levels with ${totalPolygons} total polygons`);
  return levels;
}

/**
 * Convert lat/lon to 3D spherical coordinates
 * @param {number} lon - Longitude in degrees
 * @param {number} lat - Latitude in degrees
 * @param {number} radius - Sphere radius
 * @returns {THREE.Vector3}
 */
function latLonTo3D(lon, lat, radius) {
  const phi = (90 - lat) * Math.PI / 180;     // Polar angle (colatitude)
  const theta = (lon + 180) * Math.PI / 180;  // Azimuthal angle
  
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

/**
 * Create extruded geometry for a single polygon on a sphere
 * @param {Float32Array} vertices - Polygon vertices as [lon, lat, lon, lat, ...]
 * @param {number} baseRadius - Inner radius
 * @param {number} topRadius - Outer radius (after extrusion)
 * @returns {Object} - { positions, indices, normals } arrays
 */
function createExtrudedPolygon(vertices, baseRadius, topRadius) {
  const numPoints = vertices.length / 2;
  if (numPoints < 3) return null;

  // Convert to 3D points at both radii
  const basePoints = [];
  const topPoints = [];
  
  for (let i = 0; i < numPoints; i++) {
    const lon = vertices[i * 2];
    const lat = vertices[i * 2 + 1];
    basePoints.push(latLonTo3D(lon, lat, baseRadius));
    topPoints.push(latLonTo3D(lon, lat, topRadius));
  }

  // Create side faces (the "walls" of the extrusion)
  // We'll use quads split into triangles for the sides
  const positions = [];
  const indices = [];
  
  // Add all vertices: base ring, then top ring
  for (let i = 0; i < numPoints; i++) {
    positions.push(basePoints[i].x, basePoints[i].y, basePoints[i].z);
  }
  for (let i = 0; i < numPoints; i++) {
    positions.push(topPoints[i].x, topPoints[i].y, topPoints[i].z);
  }

  // Side faces (connecting base to top)
  for (let i = 0; i < numPoints; i++) {
    const next = (i + 1) % numPoints;
    
    // Two triangles for each quad
    // Base indices: 0 to numPoints-1
    // Top indices: numPoints to 2*numPoints-1
    const b1 = i;
    const b2 = next;
    const t1 = i + numPoints;
    const t2 = next + numPoints;
    
    // Triangle 1: b1, b2, t1
    indices.push(b1, b2, t1);
    // Triangle 2: b2, t2, t1
    indices.push(b2, t2, t1);
  }

  // Top cap - triangulate the polygon
  // Using fan triangulation from centroid
  const centroidTop = new THREE.Vector3();
  for (const p of topPoints) {
    centroidTop.add(p);
  }
  centroidTop.divideScalar(numPoints);
  
  // Add centroid as extra vertex
  const centroidIdx = positions.length / 3;
  positions.push(centroidTop.x, centroidTop.y, centroidTop.z);
  
  // Create triangles from centroid to each edge
  for (let i = 0; i < numPoints; i++) {
    const next = (i + 1) % numPoints;
    const t1 = i + numPoints;
    const t2 = next + numPoints;
    indices.push(t1, t2, centroidIdx);
  }

  // Bottom cap - same but reversed winding
  const centroidBase = new THREE.Vector3();
  for (const p of basePoints) {
    centroidBase.add(p);
  }
  centroidBase.divideScalar(numPoints);
  
  const centroidBaseIdx = positions.length / 3;
  positions.push(centroidBase.x, centroidBase.y, centroidBase.z);
  
  for (let i = 0; i < numPoints; i++) {
    const next = (i + 1) % numPoints;
    indices.push(i, centroidBaseIdx, next);
  }

  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices)
  };
}

// Constants for geometry generation
const CONTOUR_BASE_OFFSET = 0.002;  // Offset to lift contours above base sphere
const RELIEF_SCALE_FACTOR = 0.1;    // Scale factor for elevation to radius mapping

/**
 * Create a THREE.js BufferGeometry from contour levels
 * @param {Array} levels - Array of { elevation, polygons } objects
 * @param {Object} options - Options for mesh generation
 * @param {number} options.baseRadius - Base radius for the sphere (default: 1.0)
 * @param {number} options.reliefScale - Scale factor for elevation extrusion (default: 1.0)
 * @param {number} options.minElevation - Minimum elevation in meters
 * @param {number} options.maxElevation - Maximum elevation in meters
 * @param {function} options.onProgress - Progress callback
 * @returns {THREE.BufferGeometry}
 */
export function createContourGeometry(levels, options = {}) {
  const {
    baseRadius = 1.0,
    reliefScale = 1.0,
    minElevation = -500,
    maxElevation = 6500,
    onProgress
  } = options;

  if (onProgress) onProgress({ type: 'status', message: 'Creating geometry...' });

  // Collect all positions and indices
  const allPositions = [];
  const allIndices = [];
  const allElevations = [];  // Store elevation per vertex for coloring
  
  let vertexOffset = 0;
  let polygonCount = 0;

  for (let levelIdx = 0; levelIdx < levels.length; levelIdx++) {
    const { elevation, polygons } = levels[levelIdx];
    
    // Calculate radius based on elevation
    // Map elevation to a radius value - add small offset so 0m contours are visible above base sphere
    const normalizedElev = Math.max(0, elevation) / maxElevation;
    const topRadius = baseRadius * (1 + CONTOUR_BASE_OFFSET + normalizedElev * reliefScale * RELIEF_SCALE_FACTOR);
    const innerRadius = baseRadius * (1 + CONTOUR_BASE_OFFSET);  // Inner surface at base offset

    for (const vertices of polygons) {
      const result = createExtrudedPolygon(vertices, innerRadius, topRadius);
      if (!result) continue;

      // Add positions
      for (let i = 0; i < result.positions.length; i++) {
        allPositions.push(result.positions[i]);
      }

      // Add indices (offset by current vertex count)
      for (let i = 0; i < result.indices.length; i++) {
        allIndices.push(result.indices[i] + vertexOffset);
      }

      // Store elevation for each vertex
      const numVerts = result.positions.length / 3;
      for (let i = 0; i < numVerts; i++) {
        allElevations.push(elevation);
      }

      vertexOffset += numVerts;
      polygonCount++;
    }

    if (onProgress) {
      onProgress({
        type: 'geometry',
        current: levelIdx + 1,
        total: levels.length,
        polygons: polygonCount,
        vertices: vertexOffset
      });
    }
  }

  console.log(`Created geometry: ${polygonCount} polygons, ${vertexOffset} vertices`);

  // Create BufferGeometry
  const geometry = new THREE.BufferGeometry();
  
  const positions = new Float32Array(allPositions);
  const indices = new Uint32Array(allIndices);
  const elevations = new Float32Array(allElevations);

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('elevation', new THREE.BufferAttribute(elevations, 1));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();

  // Store metadata
  geometry.userData.elevationMin = minElevation;
  geometry.userData.elevationMax = maxElevation;
  geometry.userData.polygonCount = polygonCount;
  geometry.userData.levelCount = levels.length;

  return geometry;
}
