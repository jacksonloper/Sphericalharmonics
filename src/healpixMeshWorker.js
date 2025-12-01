/**
 * Web Worker for generating HEALPix-based mesh geometry
 * Creates a convex hull mesh from HEALPix pixel centers and computes normals
 * based on elevation data
 */

/**
 * Convert HEALPix NESTED pixel index to spherical coordinates
 * Simplified implementation for the worker
 */
function pix2angNest(nside, ipix) {
  // This is a basic implementation - ideally would use healpix library
  // For now, using approximation
  const npface = nside * nside;
  const face = Math.floor(ipix / npface);
  const ipf = ipix % npface;
  
  // Get coordinates within face using bit interleaving
  let ix = 0, iy = 0;
  for (let i = 0; i < 16; i++) {
    ix |= ((ipf >> (2 * i)) & 1) << i;
    iy |= ((ipf >> (2 * i + 1)) & 1) << i;
  }
  
  // Convert to spherical coordinates (approximate)
  const jr = (nside + 1) - iy;
  const jp = ix;
  
  // Calculate theta (colatitude) and phi (longitude)
  const z = 1.0 - (jr + 0.5) * 2.0 / nside / 4.0;
  const theta = Math.acos(Math.max(-1, Math.min(1, z)));
  const phi = (jp + 0.5) * Math.PI / (2 * nside) + face * Math.PI / 2;
  
  return { theta, phi };
}

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
    const { theta, phi } = pix2angNest(nside, i);
    const [x, y, z] = sphericalToCartesian(theta, phi, 1.0);
    
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
  }
  
  return positions;
}

/**
 * Generate indices for HEALPix mesh using Delaunay-like triangulation
 * For HEALPix, we can use the implicit connectivity
 */
function generateHealpixIndices(nside) {
  const npix = 12 * nside * nside;
  const indices = [];
  
  // For each HEALPix pixel, find its neighbors and create triangles
  // This is a simplified approach - proper implementation would use HEALPix neighbor functions
  
  const npface = nside * nside;
  
  for (let face = 0; face < 12; face++) {
    for (let iy = 0; iy < nside - 1; iy++) {
      for (let ix = 0; ix < nside - 1; ix++) {
        // Create two triangles for each quad
        const i1 = face * npface + iy * nside + ix;
        const i2 = face * npface + iy * nside + (ix + 1);
        const i3 = face * npface + (iy + 1) * nside + (ix + 1);
        const i4 = face * npface + (iy + 1) * nside + ix;
        
        // Triangle 1
        indices.push(i1, i2, i3);
        // Triangle 2
        indices.push(i1, i3, i4);
      }
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
