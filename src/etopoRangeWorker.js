/**
 * Web Worker for generating ETOPO Range mesh geometry with triangulation
 * This offloads the CPU-intensive geoDelaunay triangulation to a background thread
 */

// Import d3-geo-voronoi using ES module syntax (Vite will bundle this)
import { geoDelaunay } from 'd3-geo-voronoi';

/**
 * Convert HEALPix NESTED pixel index to (theta, phi) in spherical coordinates
 * Inline implementation to avoid dependency issues in worker
 */
function pix2ang_nest(nside, ipix) {
  const npface = nside * nside;
  const ncap = 2 * nside * (nside - 1);
  
  if (ipix < ncap) {
    // North polar cap
    const iring = Math.floor((Math.sqrt(1 + 2 * ipix) + 1) / 2);
    const iphi = ipix - 2 * iring * (iring - 1);
    const phi = (iphi + 0.5) * Math.PI / (2 * iring);
    const theta = Math.acos(1 - iring * iring / (3 * nside * nside));
    return { theta, phi };
  } else if (ipix < 12 * npface - ncap) {
    // Equatorial region
    const ip = ipix - ncap;
    const iring = Math.floor(ip / (4 * nside)) + nside;
    const iphi = ip % (4 * nside);
    const phi = (iphi + 0.5) * Math.PI / (2 * nside);
    const theta = Math.acos((2 * nside - iring) * 2 / (3 * nside));
    return { theta, phi };
  } else {
    // South polar cap
    const ip = 12 * npface - ipix;
    const iring = Math.floor((Math.sqrt(1 + 2 * (ip - 1)) + 1) / 2);
    const iphi = ip - 2 * iring * (iring - 1) - 1;
    const phi = (iphi + 0.5) * Math.PI / (2 * iring);
    const theta = Math.acos(-1 + iring * iring / (3 * nside * nside));
    return { theta, phi };
  }
}

/**
 * Convert spherical coordinates (theta, phi) to Cartesian (x, y, z)
 * with optional radial displacement
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
 * Generate mesh geometry for a specific nside (returns geometry data)
 */
function generateMeshGeometry(nside, minElevations, maxElevations, maxAbsElevation) {
  const HEALPIX_BASE_FACES = 12;
  const MESH_GENERATION_ALPHA = 0.11;
  const numPixels = HEALPIX_BASE_FACES * nside * nside;
  
  self.postMessage({ type: 'progress', message: 'Step 1: Generating vertex positions on sphere...', step: 1, total: 6 });
  
  const positions = new Float32Array(numPixels * 3);
  const lonLatPoints = []; // [longitude, latitude] pairs for geoDelaunay
  
  for (let i = 0; i < numPixels; i++) {
    const { theta, phi } = pix2ang_nest(nside, i);
    const [x, y, z] = sphericalToCartesian(theta, phi, 1.0);
    
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    
    // Convert to longitude/latitude for geoDelaunay
    let longitude = phi * 180 / Math.PI;
    if (longitude > 180) longitude -= 360;
    const latitude = 90 - (theta * 180 / Math.PI);
    lonLatPoints.push([longitude, latitude]);
  }
  
  self.postMessage({ type: 'progress', message: 'Step 2: Creating spherical Delaunay triangulation...', step: 2, total: 6 });
  
  // Use geoDelaunay for spherical Delaunay triangulation
  const delaunay = geoDelaunay(lonLatPoints);
  const triangles = delaunay.triangles.flat();
  
  self.postMessage({ type: 'progress', message: `Generated ${triangles.length / 3} triangles`, step: 2, total: 6 });
  
  self.postMessage({ type: 'progress', message: 'Step 3: Computing MIN normals...', step: 3, total: 6 });
  
  // Displace vertices temporarily based on MIN elevation
  const displacedMinPositions = new Float32Array(positions.length);
  const alpha = MESH_GENERATION_ALPHA;
  
  for (let i = 0; i < numPixels; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    
    const elevation = minElevations[i];
    const r = 1.0 + alpha * elevation / maxAbsElevation;
    
    displacedMinPositions[i * 3] = x * r;
    displacedMinPositions[i * 3 + 1] = y * r;
    displacedMinPositions[i * 3 + 2] = z * r;
  }
  
  // Compute normals from displaced MIN geometry
  const minNormals = new Float32Array(numPixels * 3);
  
  for (let i = 0; i < triangles.length; i += 3) {
    const i1 = triangles[i], i2 = triangles[i + 1], i3 = triangles[i + 2];
    
    const ax = displacedMinPositions[i1 * 3], ay = displacedMinPositions[i1 * 3 + 1], az = displacedMinPositions[i1 * 3 + 2];
    const bx = displacedMinPositions[i2 * 3], by = displacedMinPositions[i2 * 3 + 1], bz = displacedMinPositions[i2 * 3 + 2];
    const cx = displacedMinPositions[i3 * 3], cy = displacedMinPositions[i3 * 3 + 1], cz = displacedMinPositions[i3 * 3 + 2];
    
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    
    minNormals[i1 * 3] += nx; minNormals[i1 * 3 + 1] += ny; minNormals[i1 * 3 + 2] += nz;
    minNormals[i2 * 3] += nx; minNormals[i2 * 3 + 1] += ny; minNormals[i2 * 3 + 2] += nz;
    minNormals[i3 * 3] += nx; minNormals[i3 * 3 + 1] += ny; minNormals[i3 * 3 + 2] += nz;
  }
  
  // Normalize min normals
  for (let i = 0; i < numPixels; i++) {
    const x = minNormals[i * 3], y = minNormals[i * 3 + 1], z = minNormals[i * 3 + 2];
    const len = Math.sqrt(x * x + y * y + z * z);
    if (len > 0) {
      minNormals[i * 3] /= len;
      minNormals[i * 3 + 1] /= len;
      minNormals[i * 3 + 2] /= len;
    }
  }
  
  self.postMessage({ type: 'progress', message: 'Step 4: Computing MAX normals...', step: 4, total: 6 });
  
  // Displace vertices temporarily based on MAX elevation
  const displacedMaxPositions = new Float32Array(positions.length);
  
  for (let i = 0; i < numPixels; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    
    const elevation = maxElevations[i];
    const r = 1.0 + alpha * elevation / maxAbsElevation;
    
    displacedMaxPositions[i * 3] = x * r;
    displacedMaxPositions[i * 3 + 1] = y * r;
    displacedMaxPositions[i * 3 + 2] = z * r;
  }
  
  // Compute normals from displaced MAX geometry
  const maxNormals = new Float32Array(numPixels * 3);
  
  for (let i = 0; i < triangles.length; i += 3) {
    const i1 = triangles[i], i2 = triangles[i + 1], i3 = triangles[i + 2];
    
    const ax = displacedMaxPositions[i1 * 3], ay = displacedMaxPositions[i1 * 3 + 1], az = displacedMaxPositions[i1 * 3 + 2];
    const bx = displacedMaxPositions[i2 * 3], by = displacedMaxPositions[i2 * 3 + 1], bz = displacedMaxPositions[i2 * 3 + 2];
    const cx = displacedMaxPositions[i3 * 3], cy = displacedMaxPositions[i3 * 3 + 1], cz = displacedMaxPositions[i3 * 3 + 2];
    
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    
    maxNormals[i1 * 3] += nx; maxNormals[i1 * 3 + 1] += ny; maxNormals[i1 * 3 + 2] += nz;
    maxNormals[i2 * 3] += nx; maxNormals[i2 * 3 + 1] += ny; maxNormals[i2 * 3 + 2] += nz;
    maxNormals[i3 * 3] += nx; maxNormals[i3 * 3 + 1] += ny; maxNormals[i3 * 3 + 2] += nz;
  }
  
  // Normalize max normals
  for (let i = 0; i < numPixels; i++) {
    const x = maxNormals[i * 3], y = maxNormals[i * 3 + 1], z = maxNormals[i * 3 + 2];
    const len = Math.sqrt(x * x + y * y + z * z);
    if (len > 0) {
      maxNormals[i * 3] /= len;
      maxNormals[i * 3 + 1] /= len;
      maxNormals[i * 3 + 2] /= len;
    }
  }
  
  self.postMessage({ type: 'progress', message: 'Triangulation complete!', step: 6, total: 6 });
  
  return {
    positions,
    minNormals,
    maxNormals,
    minElevations,
    maxElevations,
    triangles: new Uint32Array(triangles),
    numPixels
  };
}

// Handle messages from main thread
self.onmessage = function(e) {
  const { nside, minElevations, maxElevations, maxAbsElevation } = e.data;
  
  self.postMessage({ type: 'status', message: `Starting triangulation for nside=${nside}...` });
  
  const startTime = performance.now();
  
  try {
    // Generate geometry
    const result = generateMeshGeometry(nside, minElevations, maxElevations, maxAbsElevation);
    
    const triangulationTime = performance.now() - startTime;
    console.log(`[Worker] Triangulation for nside=${nside} completed in ${triangulationTime.toFixed(2)}ms`);
    
    // Transfer buffers to main thread (zero-copy)
    self.postMessage({
      type: 'complete',
      positions: result.positions.buffer,
      minNormals: result.minNormals.buffer,
      maxNormals: result.maxNormals.buffer,
      minElevations: result.minElevations.buffer,
      maxElevations: result.maxElevations.buffer,
      triangles: result.triangles.buffer,
      numPixels: result.numPixels,
      triangulationTime: triangulationTime
    }, [
      result.positions.buffer,
      result.minNormals.buffer,
      result.maxNormals.buffer,
      result.minElevations.buffer,
      result.maxElevations.buffer,
      result.triangles.buffer
    ]);
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error.message,
      stack: error.stack
    });
  }
};
