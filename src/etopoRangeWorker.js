/**
 * Web Worker for generating ETOPO Range mesh geometry with triangulation
 * This worker autonomously loads data and triangulates for all resolutions,
 * posting results back to main thread as each completes.
 */

// Import d3-geo-voronoi using ES module syntax (Vite will bundle this)
import { geoDelaunay } from 'd3-geo-voronoi';
// Import HEALPix library for proper NESTED pixel ordering
import { pix2ang_nest } from '@hscmap/healpix';
// Import npyjs for NPY file parsing
import { load } from 'npyjs';

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
  
  self.postMessage({ type: 'progress', nside, message: 'Step 1: Generating vertex positions on sphere...', step: 1, total: 6 });
  
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
  
  self.postMessage({ type: 'progress', nside, message: 'Step 2: Creating spherical Delaunay triangulation...', step: 2, total: 6 });
  
  // Use geoDelaunay for spherical Delaunay triangulation
  const delaunay = geoDelaunay(lonLatPoints);
  const triangles = delaunay.triangles.flat();
  
  self.postMessage({ type: 'progress', nside, message: `Generated ${triangles.length / 3} triangles`, step: 2, total: 6 });
  
  self.postMessage({ type: 'progress', nside, message: 'Step 3: Computing MIN normals...', step: 3, total: 6 });
  
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
  
  self.postMessage({ type: 'progress', nside, message: 'Step 4: Computing MAX normals...', step: 4, total: 6 });
  
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
  
  self.postMessage({ type: 'progress', nside, message: 'Triangulation complete!', step: 6, total: 6 });
  
  // Note: We don't return minElevations and maxElevations because they are
  // already available on the main thread. Transferring them back would cause
  // the arrays on the main thread to become neutered/detached.
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

/**
 * Process a single nside: load data and triangulate
 */
async function processNside(nside) {
  const startTime = performance.now();
  
  try {
    self.postMessage({ type: 'status', nside, message: `Loading data for nside=${nside}...` });
    
    // Load elevation data using npyjs
    // In a worker, we need to use an absolute path or construct it relative to the location
    const filename = `${self.location.origin}/earthtoposources/etopo2022_surface_min_mean_max_healpix${nside}_NESTED.npy`;
    const npyData = await load(filename);
    
    // Load water occurrence data
    const waterFilename = `${self.location.origin}/earthtoposources/water_occurrence_healpix${nside}_NESTED.npy`;
    let waterData = null;
    try {
      waterData = await load(waterFilename);
    } catch (waterError) {
      console.warn(`[nside=${nside}] Water data not available, using fallback values`);
      // Create fallback water data (all zeros = land)
      waterData = { data: new Float32Array(npyData.shape[0]).fill(0) };
    }
    
    self.postMessage({ type: 'status', nside, message: `Data loaded for nside=${nside}` });
    
    // Extract min, mean, max arrays
    const numPixels = npyData.shape[0];
    const minVals = new Float32Array(numPixels);
    const meanVals = new Float32Array(numPixels);
    const maxVals = new Float32Array(numPixels);
    const waterVals = new Float32Array(numPixels);
    
    let globalMin = Infinity;
    let globalMax = -Infinity;
    
    for (let i = 0; i < numPixels; i++) {
      const minVal = npyData.data[i * 3 + 0];
      const meanVal = npyData.data[i * 3 + 1];
      const maxVal = npyData.data[i * 3 + 2];
      minVals[i] = minVal;
      meanVals[i] = meanVal;
      maxVals[i] = maxVal;
      
      // Extract water occurrence value
      const waterVal = waterData.data[i];
      // Handle NaN, Inf, and negative values by marking them as -1 (no data, use elevation fallback)
      // Water occurrence should be in range [0, 255], so negative values are invalid
      waterVals[i] = (isFinite(waterVal) && waterVal >= 0) ? waterVal : -1;
      
      if (minVal < globalMin) globalMin = minVal;
      if (maxVal > globalMax) globalMax = maxVal;
    }
    
    const maxAbsElevation = Math.max(Math.abs(globalMin), Math.abs(globalMax));
    
    self.postMessage({ type: 'status', nside, message: `Starting triangulation for nside=${nside}...` });
    
    // Generate geometry
    const result = generateMeshGeometry(nside, minVals, maxVals, maxAbsElevation);
    
    const triangulationTime = performance.now() - startTime;
    
    // Send complete message with all data
    self.postMessage({
      type: 'complete',
      nside,
      positions: result.positions.buffer,
      minNormals: result.minNormals.buffer,
      maxNormals: result.maxNormals.buffer,
      minElevations: result.minElevations.buffer,
      maxElevations: result.maxElevations.buffer,
      waterOccurrence: waterVals.buffer,
      triangles: result.triangles.buffer,
      numPixels: result.numPixels,
      globalMin,
      globalMax,
      maxAbsElevation,
      triangulationTime
    }, [
      result.positions.buffer,
      result.minNormals.buffer,
      result.maxNormals.buffer,
      result.minElevations.buffer,
      result.maxElevations.buffer,
      waterVals.buffer,
      result.triangles.buffer
    ]);
    
  } catch (error) {
    self.postMessage({
      type: 'error',
      nside,
      message: error.message,
      stack: error.stack
    });
  }
}

// Start autonomous processing when worker is created
// Process all three resolutions in sequence
(async () => {
  const nsides = [64, 128, 256];
  for (const nside of nsides) {
    await processNside(nside);
  }
})();
