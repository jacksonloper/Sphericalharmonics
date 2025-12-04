/**
 * Web Worker for generating Population Height mesh geometry with pyramids
 * This worker loads population data and creates truncated square pyramids for each HEALPix cell
 * Each pyramid has volume proportional to population, providing accurate visual representation
 */

// Import HEALPix library for proper NESTED pixel ordering
import { pix2ang_nest, corners_nest } from '@hscmap/healpix';
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
 * Generate mesh geometry using truncated square pyramids (frustums) for each HEALPix cell
 * Each frustum's volume is proportional to the population, providing accurate visual representation
 */
function generateMeshGeometry(nside, populationData, maxPopulation) {
  const HEALPIX_BASE_FACES = 12;
  const numPixels = HEALPIX_BASE_FACES * nside * nside;
  
  self.postMessage({ type: 'progress', message: 'Step 1: Creating frustums for each HEALPix cell...', step: 1, total: 3 });
  
  // Arrays to store all frustum vertices and triangles
  const positions = [];
  const population = [];
  const triangles = [];
  
  let vertexOffset = 0;
  
  // Create a frustum for each HEALPix pixel
  for (let pixelIdx = 0; pixelIdx < numPixels; pixelIdx++) {
    if (pixelIdx % 10000 === 0) {
      self.postMessage({ 
        type: 'progress', 
        message: `Creating frustums: ${pixelIdx}/${numPixels}...`, 
        step: 2, 
        total: 3 
      });
    }
    
    const pop = populationData[pixelIdx];
    const normalizedPop = pop / maxPopulation;
    
    // Get the center of this HEALPix pixel
    const { theta, phi } = pix2ang_nest(nside, pixelIdx);
    
    // Get the four corners of this HEALPix pixel (returned as [x, y, z] arrays on unit sphere)
    const cornerCoords = corners_nest(nside, pixelIdx);
    
    // Validate that all corners are valid
    let hasInvalidCorner = false;
    for (const corner of cornerCoords) {
      if (!isFinite(corner[0]) || !isFinite(corner[1]) || !isFinite(corner[2])) {
        hasInvalidCorner = true;
        break;
      }
    }
    
    // Skip this pixel if any corner is invalid
    if (hasInvalidCorner || !isFinite(theta) || !isFinite(phi)) {
      continue;
    }
    
    // Calculate frustum height based on population
    // For a frustum: V = (h/3) * (A_base + A_top + sqrt(A_base * A_top))
    // We want V proportional to population
    // Assuming equal base and top areas (small height), V ≈ h * A
    // So h should be proportional to population
    const height = 0.3 * normalizedPop;  // Scale factor for visible displacement
    const topRadius = 1.0 + height;
    
    // Create base corners at r=1.0 (on sphere surface)
    const baseCorners = cornerCoords.map(c => [c[0], c[1], c[2]]);
    
    // Create top corners by extending each corner radially outward
    // This creates a proper box-like frustum perpendicular to the sphere
    const topCorners = cornerCoords.map(c => {
      const len = Math.sqrt(c[0]*c[0] + c[1]*c[1] + c[2]*c[2]);
      return [
        c[0] / len * topRadius,
        c[1] / len * topRadius,
        c[2] / len * topRadius
      ];
    });
    
    // Add base corners (indices 0-3)
    for (let i = 0; i < 4; i++) {
      positions.push(...baseCorners[i]);
      population.push(pop);
    }
    
    // Add top corners (indices 4-7)
    for (let i = 0; i < 4; i++) {
      positions.push(...topCorners[i]);
      population.push(pop);
    }
    
    // Create triangles for the full frustum (12 triangles total)
    // 4 side faces (2 triangles each = 8 triangles)
    // 1 top face (4 triangles from center - but we'll use 2 triangles for a quad)
    // We skip the base since it's on the sphere surface
    
    // Side faces: 4 quads, each split into 2 triangles
    for (let i = 0; i < 4; i++) {
      const next = (i + 1) % 4;
      
      // First triangle of side face (CCW from outside)
      triangles.push(
        vertexOffset + i,           // base corner i
        vertexOffset + 4 + i,       // top corner i
        vertexOffset + next         // base corner i+1
      );
      
      // Second triangle of side face (CCW from outside)
      triangles.push(
        vertexOffset + next,        // base corner i+1
        vertexOffset + 4 + i,       // top corner i
        vertexOffset + 4 + next     // top corner i+1
      );
    }
    
    // Top face: 2 triangles forming a quad (CCW from outside)
    triangles.push(
      vertexOffset + 4,             // top corner 0
      vertexOffset + 5,             // top corner 1
      vertexOffset + 6              // top corner 2
    );
    triangles.push(
      vertexOffset + 4,             // top corner 0
      vertexOffset + 6,             // top corner 2
      vertexOffset + 7              // top corner 3
    );
    
    vertexOffset += 8; // 8 vertices per frustum (4 base + 4 top)
  }
  
  self.postMessage({ type: 'progress', message: 'Step 3: Computing normals...', step: 3, total: 3 });
  
  // Convert to typed arrays
  const positionsArray = new Float32Array(positions);
  const populationArray = new Float32Array(population);
  const trianglesArray = new Uint32Array(triangles);
  
  // Compute normals
  const normalsArray = new Float32Array(positionsArray.length);
  
  for (let i = 0; i < trianglesArray.length; i += 3) {
    const i1 = trianglesArray[i];
    const i2 = trianglesArray[i + 1];
    const i3 = trianglesArray[i + 2];
    
    const ax = positionsArray[i1 * 3], ay = positionsArray[i1 * 3 + 1], az = positionsArray[i1 * 3 + 2];
    const bx = positionsArray[i2 * 3], by = positionsArray[i2 * 3 + 1], bz = positionsArray[i2 * 3 + 2];
    const cx = positionsArray[i3 * 3], cy = positionsArray[i3 * 3 + 1], cz = positionsArray[i3 * 3 + 2];
    
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    
    normalsArray[i1 * 3] += nx; normalsArray[i1 * 3 + 1] += ny; normalsArray[i1 * 3 + 2] += nz;
    normalsArray[i2 * 3] += nx; normalsArray[i2 * 3 + 1] += ny; normalsArray[i2 * 3 + 2] += nz;
    normalsArray[i3 * 3] += nx; normalsArray[i3 * 3 + 1] += ny; normalsArray[i3 * 3 + 2] += nz;
  }
  
  // Normalize normals
  for (let i = 0; i < normalsArray.length; i += 3) {
    const x = normalsArray[i], y = normalsArray[i + 1], z = normalsArray[i + 2];
    const len = Math.sqrt(x * x + y * y + z * z);
    if (len > 0) {
      normalsArray[i] /= len;
      normalsArray[i + 1] /= len;
      normalsArray[i + 2] /= len;
    }
  }
  
  self.postMessage({ type: 'progress', message: 'Pyramid generation complete!', step: 3, total: 3 });
  
  // Return geometry data
  return {
    positions: positionsArray,
    normals: normalsArray,
    population: populationArray,
    triangles: trianglesArray,
    numPixels
  };
}

/**
 * Downsample HEALPix data from nside_in to nside_out by aggregating (summing) pixels
 */
function downsampleHealpix(dataIn, nsideIn, nsideOut) {
  const HEALPIX_BASE_FACES = 12;
  const numPixelsIn = HEALPIX_BASE_FACES * nsideIn * nsideIn;
  const numPixelsOut = HEALPIX_BASE_FACES * nsideOut * nsideOut;
  const dataOut = new Float32Array(numPixelsOut);
  
  // Each output pixel corresponds to (nsideIn/nsideOut)^2 input pixels
  const ratio = nsideIn / nsideOut;
  const ratioSq = ratio * ratio;
  
  // For each output pixel, sum the corresponding input pixels
  for (let outIdx = 0; outIdx < numPixelsOut; outIdx++) {
    let sum = 0;
    
    // Find all input pixels that map to this output pixel
    // In NESTED ordering, this is straightforward: output pixel i maps to
    // input pixels [i*ratioSq, (i+1)*ratioSq)
    const startIdx = outIdx * ratioSq;
    const endIdx = startIdx + ratioSq;
    
    for (let inIdx = startIdx; inIdx < endIdx; inIdx++) {
      if (inIdx < numPixelsIn) {
        sum += dataIn[inIdx];
      }
    }
    
    dataOut[outIdx] = sum;
  }
  
  return dataOut;
}

/**
 * Process population data: load and triangulate
 */
async function processPopulationData() {
  const startTime = performance.now();
  const loadNside = 128;  // Load at full resolution
  const renderNside = 64;  // Downsample for rendering (better performance)
  
  try {
    self.postMessage({ type: 'status', message: `Loading population data for nside=${loadNside}...` });
    
    // Load population data using npyjs
    const filename = `${self.location.origin}/${DATA_PATH}/population_healpix${loadNside}_NESTED.npy`;
    const npyData = await load(filename);
    
    self.postMessage({ type: 'status', message: `Population data loaded for nside=${loadNside}` });
    
    // Extract population values at full resolution
    const numPixelsIn = npyData.shape[0];
    const populationDataFull = new Float32Array(numPixelsIn);
    
    for (let i = 0; i < numPixelsIn; i++) {
      populationDataFull[i] = npyData.data[i];
    }
    
    // Downsample to renderNside for better performance
    self.postMessage({ type: 'status', message: `Downsampling from nside=${loadNside} to nside=${renderNside}...` });
    const populationData = downsampleHealpix(populationDataFull, loadNside, renderNside);
    
    // Find max population in downsampled data
    let maxPopulation = 0;
    for (let i = 0; i < populationData.length; i++) {
      if (populationData[i] > maxPopulation) {
        maxPopulation = populationData[i];
      }
    }
    
    self.postMessage({ type: 'status', message: `Starting frustum generation for nside=${renderNside}...` });
    
    // Generate geometry at render resolution
    const result = generateMeshGeometry(renderNside, populationData, maxPopulation);
    
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
