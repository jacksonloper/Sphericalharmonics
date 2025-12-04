/**
 * Web Worker for loading and processing population data
 * - Loads population_healpix128_NESTED.npy
 * - Downsamples from nside=128 to nside=32 by summing
 * - Generates truncated square pyramid geometry for each pixel
 */

import { pix2ang_nest } from '@hscmap/healpix';
import { load } from 'npyjs';

/**
 * Convert spherical coordinates (theta, phi) to Cartesian (x, y, z)
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
 * Get the 4 corners of a HEALPix pixel at a given radius
 * This creates a square-like patch on the sphere
 */
function getPixelCorners(nside, pixelIndex, r) {
  // Get center of pixel
  const { theta, phi } = pix2ang_nest(nside, pixelIndex);
  
  // HEALPix pixel angular size
  const pixelSize = Math.sqrt(4 * Math.PI / (12 * nside * nside));
  
  // Create approximate square corners around the center
  // These are approximate - the actual HEALPix pixels are more complex
  const dtheta = pixelSize / 2;
  // Account for convergence at poles, with safeguard for division by zero
  const sinTheta = Math.sin(theta);
  const dphi = sinTheta > 0.01 ? pixelSize / (2 * sinTheta) : pixelSize / 2;
  
  const corners = [
    sphericalToCartesian(theta - dtheta, phi - dphi, r),
    sphericalToCartesian(theta - dtheta, phi + dphi, r),
    sphericalToCartesian(theta + dtheta, phi + dphi, r),
    sphericalToCartesian(theta + dtheta, phi - dphi, r)
  ];
  
  return corners;
}

/**
 * Create a truncated square pyramid (frustum) from r=1 to r=r_outer
 * Returns geometry data with positions and indices
 */
function createTruncatedPyramid(nside, pixelIndex, r_outer) {
  // Get 4 corners at inner radius (r=1) and outer radius (r=r_outer)
  const innerCorners = getPixelCorners(nside, pixelIndex, 1.0);
  const outerCorners = getPixelCorners(nside, pixelIndex, r_outer);
  
  // 8 vertices total (4 inner + 4 outer)
  const positions = [];
  innerCorners.forEach(c => positions.push(...c));
  outerCorners.forEach(c => positions.push(...c));
  
  // Create 12 triangles (2 per face, 6 faces total)
  // Face indices: 0-3 are inner corners, 4-7 are outer corners
  const indices = [
    // Bottom face (inner square) - 2 triangles
    0, 1, 2,
    0, 2, 3,
    
    // Top face (outer square) - 2 triangles
    4, 6, 5,
    4, 7, 6,
    
    // Side faces - 4 faces × 2 triangles each = 8 triangles
    // Side 1: 0-1 inner, 4-5 outer
    0, 4, 5,
    0, 5, 1,
    
    // Side 2: 1-2 inner, 5-6 outer
    1, 5, 6,
    1, 6, 2,
    
    // Side 3: 2-3 inner, 6-7 outer
    2, 6, 7,
    2, 7, 3,
    
    // Side 4: 3-0 inner, 7-4 outer
    3, 7, 4,
    3, 4, 0
  ];
  
  return { positions: new Float32Array(positions), indices: new Uint16Array(indices) };
}

/**
 * Main processing function
 */
async function processPopulationData() {
  self.postMessage({ type: 'progress', message: 'Loading population data...', step: 1, total: 5 });
  
  // Load nside=128 population data using npyjs load function
  const filename = `${self.location.origin}/earthtoposources/population_healpix128_NESTED.npy`;
  const npyData = await load(filename);
  const pop_128 = npyData.data;
  
  self.postMessage({ type: 'progress', message: `Loaded ${pop_128.length} pixels at nside=128`, step: 2, total: 5 });
  
  // Verify total population
  const totalPop = pop_128.reduce((sum, val) => sum + val, 0);
  self.postMessage({ type: 'info', message: `Total population: ${(totalPop / 1e9).toFixed(2)} billion` });
  
  // Downsample from nside=128 to nside=32
  // In HEALPix NESTED ordering, the hierarchical structure guarantees that
  // child pixels are stored consecutively: pixels [i*ratio, (i+1)*ratio) at higher
  // resolution correspond exactly to pixel i at lower resolution.
  const nside_128 = 128;
  const nside_32 = 32;
  const npix_32 = 12 * nside_32 * nside_32;
  const ratio = (nside_128 / nside_32) ** 2; // 16 pixels per nside32 pixel
  
  self.postMessage({ type: 'progress', message: `Downsampling to nside=32 (${npix_32} pixels)...`, step: 3, total: 5 });
  
  const pop_32 = new Float32Array(npix_32);
  for (let i = 0; i < npix_32; i++) {
    const startIdx = i * ratio;
    const endIdx = startIdx + ratio;
    let sum = 0;
    for (let j = startIdx; j < endIdx; j++) {
      sum += pop_128[j];
    }
    pop_32[i] = sum;
  }
  
  // Sanity check
  const totalPop32 = pop_32.reduce((sum, val) => sum + val, 0);
  self.postMessage({ type: 'info', message: `Downsampled population: ${(totalPop32 / 1e9).toFixed(2)} billion` });
  
  // Calculate scaling constant C
  // Using cubic formula: r = (1 + 3*p/(C*A))^(1/3)
  // We want max r ≈ 2, so C = 3*p_max / (7*A)
  const maxPop = Math.max(...pop_32);
  const area_32 = 4 * Math.PI / npix_32; // HEALPix pixel area on unit sphere
  const C = 3 * maxPop / (7 * area_32);
  
  self.postMessage({ 
    type: 'info', 
    message: `Max population: ${(maxPop / 1e6).toFixed(2)} million, Scaling constant C: ${C.toExponential(2)}` 
  });
  
  self.postMessage({ type: 'progress', message: 'Generating pyramid geometry...', step: 4, total: 5 });
  
  // Generate geometry for all pixels
  // We'll combine all pyramids into one big geometry
  const allPositions = [];
  const allIndices = [];
  let vertexOffset = 0;
  
  for (let i = 0; i < npix_32; i++) {
    const population = pop_32[i];
    
    // Skip pixels with no population
    if (population <= 0) continue;
    
    // Calculate outer radius using cubic formula
    // r = (1 + 3*p/(C*A))^(1/3)
    const r_outer = Math.pow(1 + 3 * population / (C * area_32), 1/3);
    
    // Create truncated pyramid
    const pyramid = createTruncatedPyramid(nside_32, i, r_outer);
    
    // Add positions
    allPositions.push(...pyramid.positions);
    
    // Add indices with offset
    for (let j = 0; j < pyramid.indices.length; j++) {
      allIndices.push(pyramid.indices[j] + vertexOffset);
    }
    
    vertexOffset += pyramid.positions.length / 3;
    
    // Report progress occasionally
    if (i % 1000 === 0) {
      self.postMessage({ 
        type: 'progress', 
        message: `Generated ${i}/${npix_32} pyramids...`, 
        step: 4, 
        total: 5 
      });
    }
  }
  
  self.postMessage({ type: 'progress', message: 'Finalizing geometry...', step: 5, total: 5 });
  
  // Send final geometry data
  self.postMessage({
    type: 'complete',
    positions: new Float32Array(allPositions),
    indices: new Uint32Array(allIndices),
    numPyramids: vertexOffset / 8, // Each pyramid has 8 vertices
    totalPopulation: totalPop32
  });
}

// Start processing when worker is loaded
processPopulationData().catch(error => {
  self.postMessage({ type: 'error', message: error.message });
});
