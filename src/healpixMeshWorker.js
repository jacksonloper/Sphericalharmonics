/**
 * Web Worker for generating HEALPix-based mesh geometry
 * Creates mesh from HEALPix pixel centers and computes normals
 * based on elevation data
 */

// Import HEALPix library for proper neighbor finding
importScripts('https://cdn.jsdelivr.net/npm/@hscmap/healpix@1.0.1/dist/healpix.min.js');

/**
 * Convert spherical coordinates to Cartesian (x, y, z)
 * with y-up convention and correct chirality
 */
function sphericalToCartesian(theta, phi, r = 1.0) {
  const sinTheta = Math.sin(theta);
  const cosTheta = Math.cos(theta);
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  
  return [
    r * sinTheta * cosPhi,
    r * cosTheta,           // y-axis points to poles
    -r * sinTheta * sinPhi  // Negate for correct chirality
  ];
}

/**
 * Generate HEALPix pixel centers on unit sphere
 */
function generateHealpixCenters(nside) {
  const npix = 12 * nside * nside;
  const positions = new Float32Array(npix * 3);
  
  for (let i = 0; i < npix; i++) {
    const { theta, phi } = healpix.pix2ang_nest(nside, i);
    const [x, y, z] = sphericalToCartesian(theta, phi, 1.0);
    
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
  }
  
  return positions;
}

/**
 * Generate indices for HEALPix mesh using proper neighbor relationships
 */
function generateHealpixIndices(nside) {
  const npix = 12 * nside * nside;
  const indices = [];
  const processed = new Set();
  
  // For each pixel, find its neighbors and create triangles
  for (let ipix = 0; ipix < npix; ipix++) {
    try {
      // Get the 8 neighbors of this pixel
      const neighbors = healpix.neighbours_nest(nside, ipix);
      
      // Create triangles with valid neighbors
      // We'll create a fan of triangles around this center pixel
      for (let i = 0; i < neighbors.length; i++) {
        const n1 = neighbors[i];
        const n2 = neighbors[(i + 1) % neighbors.length];
        
        if (n1 >= 0 && n2 >= 0 && n1 < npix && n2 < npix) {
          // Create triangle key to avoid duplicates
          const triKey = [ipix, n1, n2].sort((a, b) => a - b).join(',');
          
          if (!processed.has(triKey)) {
            indices.push(ipix, n1, n2);
            processed.add(triKey);
          }
        }
      }
    } catch (e) {
      // Skip pixels where neighbor finding fails (e.g., at boundaries)
      continue;
    }
  }
  
  return new Uint32Array(indices);
}

/**
 * Displace vertices based on elevation data
 */
function displaceVertices(positions, elevationData, alpha, maxAbsElevation) {
  const numVertices = positions.length / 3;
  const displaced = new Float32Array(positions.length);
  
  for (let i = 0; i < numVertices; i++) {
    // Get position on unit sphere
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    
    // Get elevation for this pixel (min elevation)
    const elevation = elevationData[i * 3 + 0]; // Index 0 is min
    
    // Calculate displacement: r = 1 + alpha * e / maxAbsElevation
    const r = 1.0 + alpha * elevation / maxAbsElevation;
    
    // Apply displacement
    displaced[i * 3] = x * r;
    displaced[i * 3 + 1] = y * r;
    displaced[i * 3 + 2] = z * r;
  }
  
  return displaced;
}

/**
 * Compute vertex normals from displaced positions and indices
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
  const { nside, elevationData, maxAbsElevation } = e.data;
  
  self.postMessage({ type: 'status', message: 'Generating HEALPix pixel centers...' });
  
  // Generate pixel centers on unit sphere
  const basePositions = generateHealpixCenters(nside);
  
  self.postMessage({ type: 'status', message: 'Generating mesh connectivity...' });
  
  // Generate indices (triangulation)
  const indices = generateHealpixIndices(nside);
  
  self.postMessage({ type: 'status', message: 'Displacing vertices with elevation data...' });
  
  // Displace vertices using elevation data with alpha=0.11
  const alpha = 0.11;
  const displacedPositions = displaceVertices(basePositions, elevationData, alpha, maxAbsElevation);
  
  self.postMessage({ type: 'status', message: 'Computing normals...' });
  
  // Compute normals from displaced geometry
  const normals = computeVertexNormals(displacedPositions, indices);
  
  self.postMessage({ type: 'status', message: 'Finalizing...' });
  
  const numVertices = basePositions.length / 3;
  
  // Also create elevation attribute for shader (using min elevation)
  const elevations = new Float32Array(numVertices);
  for (let i = 0; i < numVertices; i++) {
    elevations[i] = elevationData[i * 3 + 0]; // Min elevation
  }
  
  // Transfer buffers to main thread (zero-copy)
  self.postMessage({
    type: 'complete',
    basePositions: basePositions.buffer,
    indices: indices.buffer,
    normals: normals.buffer,
    elevations: elevations.buffer,
    numVertices: numVertices,
    numTriangles: indices.length / 3
  }, [basePositions.buffer, indices.buffer, normals.buffer, elevations.buffer]);
};
