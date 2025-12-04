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
 * Generate mesh geometry using truncated square pyramids for each HEALPix cell
 * Each pyramid's volume is proportional to the population, providing accurate visual representation
 */
function generateMeshGeometry(nside, populationData, maxPopulation) {
  const HEALPIX_BASE_FACES = 12;
  const MESH_GENERATION_ALPHA = 0.3;  // Fixed displacement scale
  const numPixels = HEALPIX_BASE_FACES * nside * nside;
  
  self.postMessage({ type: 'progress', message: 'Step 1: Creating pyramids for each HEALPix cell...', step: 1, total: 3 });
  
  // Arrays to store all pyramid vertices and triangles
  const positions = [];
  const normals = [];
  const population = [];
  const triangles = [];
  
  let vertexOffset = 0;
  
  // Create a pyramid for each HEALPix pixel
  for (let pixelIdx = 0; pixelIdx < numPixels; pixelIdx++) {
    if (pixelIdx % 10000 === 0) {
      self.postMessage({ 
        type: 'progress', 
        message: `Creating pyramids: ${pixelIdx}/${numPixels}...`, 
        step: 2, 
        total: 3 
      });
    }
    
    const pop = populationData[pixelIdx];
    const normalizedPop = pop / maxPopulation;
    
    // Get the center of this HEALPix pixel
    const { theta, phi } = pix2ang_nest(nside, pixelIdx);
    
    // Get the four corners of this HEALPix pixel (returned as [x, y, z] arrays)
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
    
    // Top of pyramid at displaced height (base is implicit at r=1.0)
    const height = MESH_GENERATION_ALPHA * normalizedPop;
    const topRadius = 1.0 + height;
    const topCorners = cornerCoords.map(c => [c[0] * topRadius, c[1] * topRadius, c[2] * topRadius]);
    
    // Center of top for creating triangles
    const [topCenterX, topCenterY, topCenterZ] = sphericalToCartesian(theta, phi, topRadius);
    
    // Add top center vertex (index 0 relative to this pyramid)
    positions.push(topCenterX, topCenterY, topCenterZ);
    population.push(pop);
    
    // Add top corner vertices (indices 1-4)
    for (let i = 0; i < 4; i++) {
      positions.push(...topCorners[i]);
      population.push(pop);
    }
    
    // Create triangles for the pyramid top surface (5 vertices: 1 center + 4 corners)
    // Note: We render only the top surface, not full truncated pyramids with sides
    // The human eye judges population by the visible top area at different heights
    // This creates 4 triangles from the top center to the 4 top corners
    // Triangle winding is counter-clockwise when viewed from outside (for correct normals)
    
    for (let i = 0; i < 4; i++) {
      const next = (i + 1) % 4;
      // Counter-clockwise winding: center -> current -> next
      triangles.push(
        vertexOffset + 0,           // top center
        vertexOffset + 1 + i,       // top corner i (current)
        vertexOffset + 1 + next     // top corner i+1 (next)
      );
    }
    
    vertexOffset += 5; // 5 vertices per pyramid
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
