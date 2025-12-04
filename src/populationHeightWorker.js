/**
 * Web Worker for generating Population Height mesh geometry with triangulation
 * This worker loads population data and triangulates it using spherical Delaunay
 */

// Import d3-geo-voronoi using ES module syntax (Vite will bundle this)
import { geoDelaunay } from 'd3-geo-voronoi';
// Import HEALPix library for proper NESTED pixel ordering
import { pix2ang_nest } from '@hscmap/healpix';
// Import npyjs for NPY file parsing
import { load } from 'npyjs';

// Data path constant
const DATA_PATH = 'earthtoposources';

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
 * Generate mesh geometry for population data (nside=128 only)
 */
function generateMeshGeometry(nside, populationData, maxPopulation) {
  const HEALPIX_BASE_FACES = 12;
  const MESH_GENERATION_ALPHA = 0.3;  // Fixed displacement scale for normal computation
  const numPixels = HEALPIX_BASE_FACES * nside * nside;
  
  self.postMessage({ type: 'progress', message: 'Step 1: Generating vertex positions on sphere...', step: 1, total: 4 });
  
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
  
  self.postMessage({ type: 'progress', message: 'Step 2: Creating spherical Delaunay triangulation...', step: 2, total: 4 });
  
  // Use geoDelaunay for spherical Delaunay triangulation (Voronoi dual)
  const delaunay = geoDelaunay(lonLatPoints);
  const triangles = delaunay.triangles.flat();
  
  self.postMessage({ type: 'progress', message: `Generated ${triangles.length / 3} triangles`, step: 2, total: 4 });
  
  self.postMessage({ type: 'progress', message: 'Step 3: Computing normals from displaced geometry...', step: 3, total: 4 });
  
  // Displace vertices temporarily based on population for normal computation
  const displacedPositions = new Float32Array(positions.length);
  const alpha = MESH_GENERATION_ALPHA;
  
  for (let i = 0; i < numPixels; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    
    const pop = populationData[i];
    const normalizedPop = pop / maxPopulation;
    const r = 1.0 + alpha * normalizedPop;
    
    displacedPositions[i * 3] = x * r;
    displacedPositions[i * 3 + 1] = y * r;
    displacedPositions[i * 3 + 2] = z * r;
  }
  
  // Compute normals from displaced geometry
  const normals = new Float32Array(numPixels * 3);
  
  for (let i = 0; i < triangles.length; i += 3) {
    const i1 = triangles[i], i2 = triangles[i + 1], i3 = triangles[i + 2];
    
    const ax = displacedPositions[i1 * 3], ay = displacedPositions[i1 * 3 + 1], az = displacedPositions[i1 * 3 + 2];
    const bx = displacedPositions[i2 * 3], by = displacedPositions[i2 * 3 + 1], bz = displacedPositions[i2 * 3 + 2];
    const cx = displacedPositions[i3 * 3], cy = displacedPositions[i3 * 3 + 1], cz = displacedPositions[i3 * 3 + 2];
    
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    
    normals[i1 * 3] += nx; normals[i1 * 3 + 1] += ny; normals[i1 * 3 + 2] += nz;
    normals[i2 * 3] += nx; normals[i2 * 3 + 1] += ny; normals[i2 * 3 + 2] += nz;
    normals[i3 * 3] += nx; normals[i3 * 3 + 1] += ny; normals[i3 * 3 + 2] += nz;
  }
  
  // Normalize normals
  for (let i = 0; i < numPixels; i++) {
    const x = normals[i * 3], y = normals[i * 3 + 1], z = normals[i * 3 + 2];
    const len = Math.sqrt(x * x + y * y + z * z);
    if (len > 0) {
      normals[i * 3] /= len;
      normals[i * 3 + 1] /= len;
      normals[i * 3 + 2] /= len;
    }
  }
  
  self.postMessage({ type: 'progress', message: 'Triangulation complete!', step: 4, total: 4 });
  
  // Return geometry data including normals and population values
  return {
    positions,
    normals,
    population: populationData,
    triangles: new Uint32Array(triangles),
    numPixels
  };
}

/**
 * Process population data: load and triangulate
 */
async function processPopulationData() {
  const startTime = performance.now();
  const nside = 128;  // Fixed nside for population data
  
  try {
    self.postMessage({ type: 'status', message: `Loading population data for nside=${nside}...` });
    
    // Load population data using npyjs
    const filename = `${self.location.origin}/${DATA_PATH}/population_healpix${nside}_NESTED.npy`;
    const npyData = await load(filename);
    
    self.postMessage({ type: 'status', message: `Population data loaded for nside=${nside}` });
    
    // Extract population values
    const numPixels = npyData.shape[0];
    const populationData = new Float32Array(numPixels);
    
    let maxPopulation = 0;
    
    for (let i = 0; i < numPixels; i++) {
      const pop = npyData.data[i];
      populationData[i] = pop;
      
      if (pop > maxPopulation) {
        maxPopulation = pop;
      }
    }
    
    self.postMessage({ type: 'status', message: `Starting triangulation for nside=${nside}...` });
    
    // Generate geometry
    const result = generateMeshGeometry(nside, populationData, maxPopulation);
    
    const triangulationTime = performance.now() - startTime;
    
    // Send complete message with all data
    self.postMessage({
      type: 'complete',
      positions: result.positions.buffer,
      normals: result.normals.buffer,
      population: result.population.buffer,
      triangles: result.triangles.buffer,
      numPixels: result.numPixels,
      maxPopulation,
      triangulationTime
    }, [
      result.positions.buffer,
      result.normals.buffer,
      result.population.buffer,
      result.triangles.buffer
    ]);
    
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error.message,
      stack: error.stack
    });
  }
}

// Start processing when worker is created
processPopulationData();
