/**
 * Web Worker for loading and processing population data
 * - Loads population_healpix128_NESTED.npy
 * - Downsamples from nside=128 to nside=32 by summing
 * - Generates truncated square pyramid geometry for each pixel
 */

import { pix2ang_nest, corners_nest } from '@hscmap/healpix';
import { load } from 'npyjs';

/**
 * Turbo colormap - maps value in [0, 1] to RGB
 * Based on the Turbo colormap by Anton Mikhailov
 */
function turboColormap(t) {
  // Clamp to [0, 1]
  t = Math.max(0, Math.min(1, t));
  
  // Turbo colormap polynomial approximation
  const r = Math.max(0, Math.min(1, 
    0.13572138 + t * (4.61539260 + t * (-42.66032258 + t * (132.13108234 + t * (-152.94239396 + t * 59.28637943))))
  ));
  const g = Math.max(0, Math.min(1,
    0.09140261 + t * (2.19418839 + t * (4.84296658 + t * (-14.18503333 + t * (4.27729857 + t * 2.82956604))))
  ));
  const b = Math.max(0, Math.min(1,
    0.10667330 + t * (12.64194608 + t * (-60.58204836 + t * (110.36276771 + t * (-89.90310912 + t * 27.34824973))))
  ));
  
  return [r, g, b];
}

/**
 * Get the 4 corners of a HEALPix pixel at a given radius
 * Uses the actual HEALPix corner calculation for precise boundaries
 */
function getPixelCorners(nside, pixelIndex, r) {
  // Get the actual HEALPix pixel corners on the unit sphere
  // corners_nest returns 4 vectors [x, y, z] in the HEALPix convention
  // where z points to north pole
  const unitCorners = corners_nest(nside, pixelIndex);
  
  // Transform from HEALPix coordinates (z=north) to THREE.js coordinates (y=north)
  // HEALPix: (x, y, z) where z points to north pole
  // THREE.js: (x, y, z) where y points to north pole
  // Transformation: (x_hp, y_hp, z_hp) -> (x_hp, z_hp, -y_hp)
  const corners = unitCorners.map(([x, y, z]) => [
    x * r,
    z * r,      // z from HEALPix becomes y in THREE.js (north pole)
    -y * r      // -y from HEALPix becomes z in THREE.js (for correct chirality)
  ]);
  
  return corners;
}

/**
 * Create a truncated square pyramid (frustum) from r=1 to r=r_outer
 * Returns geometry data with positions (at r=1), radiusTarget, indices, and colors
 * The shader will use radiusTarget to adjust the height based on a relief uniform
 */
function createTruncatedPyramid(nside, pixelIndex, r_outer, color) {
  // Get 4 corners at base radius (r=1) - this is where all vertices start
  const baseCorners = getPixelCorners(nside, pixelIndex, 1.0);
  
  // 8 vertices total (4 inner + 4 outer)
  // All positions are stored at r=1, the shader will displace them
  const positions = [];
  const radiusTargets = [];  // Target radius for each vertex
  const colors = [];
  
  // Inner corners stay at r=1
  baseCorners.forEach(c => {
    positions.push(...c);
    radiusTargets.push(1.0);  // Inner radius is always 1
    colors.push(...color);
  });
  
  // Outer corners start at r=1 but have target of r_outer
  baseCorners.forEach(c => {
    positions.push(...c);
    radiusTargets.push(r_outer);  // Outer radius is r_outer
    colors.push(...color);
  });
  
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
  
  return { 
    positions: new Float32Array(positions), 
    radiusTargets: new Float32Array(radiusTargets),
    colors: new Float32Array(colors),
    indices: new Uint16Array(indices) 
  };
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
  
  // Downsample from nside=128 to nside=64
  // In HEALPix NESTED ordering, the hierarchical structure guarantees that
  // child pixels are stored consecutively: pixels [i*ratio, (i+1)*ratio) at higher
  // resolution correspond exactly to pixel i at lower resolution.
  const nside_128 = 128;
  const nside_64 = 64;
  const npix_64 = 12 * nside_64 * nside_64;
  const ratio = (nside_128 / nside_64) ** 2; // 4 pixels per nside64 pixel
  
  self.postMessage({ type: 'progress', message: `Downsampling to nside=64 (${npix_64} pixels)...`, step: 3, total: 5 });
  
  const pop_64 = new Float32Array(npix_64);
  for (let i = 0; i < npix_64; i++) {
    const startIdx = i * ratio;
    const endIdx = startIdx + ratio;
    let sum = 0;
    for (let j = startIdx; j < endIdx; j++) {
      sum += pop_128[j];
    }
    pop_64[i] = sum;
  }
  
  // Sanity check
  const totalPop64 = pop_64.reduce((sum, val) => sum + val, 0);
  self.postMessage({ type: 'info', message: `Downsampled population: ${(totalPop64 / 1e9).toFixed(2)} billion` });
  
  // Calculate scaling constant C
  // Using cubic formula: r = (1 + 3*p/(C*A))^(1/3)
  // We want max r ≈ 2, so C = 3*p_max / (7*A)
  const maxPop = Math.max(...pop_64);
  const area_64 = 4 * Math.PI / npix_64; // HEALPix pixel area on unit sphere
  const C = 3 * maxPop / (7 * area_64);
  
  self.postMessage({ 
    type: 'info', 
    message: `Max population: ${(maxPop / 1e6).toFixed(2)} million, Scaling constant C: ${C.toExponential(2)}` 
  });
  
  self.postMessage({ type: 'progress', message: 'Generating pyramid geometry...', step: 4, total: 5 });
  
  // Generate geometry for all pixels
  // We'll combine all pyramids into one big geometry
  const allPositions = [];
  const allRadiusTargets = [];
  const allColors = [];
  const allIndices = [];
  let vertexOffset = 0;
  
  for (let i = 0; i < npix_64; i++) {
    const population = pop_64[i];
    
    // Skip pixels with no population
    if (population <= 0) continue;
    
    // Calculate outer radius using cubic formula
    // r = (1 + 3*p/(C*A))^(1/3)
    const r_outer = Math.pow(1 + 3 * population / (C * area_64), 1/3);
    
    // Calculate color based on population (normalized to max)
    // Use log scale for better visual distribution
    const populationNormalized = Math.log(population + 1) / Math.log(maxPop + 1);
    const color = turboColormap(populationNormalized);
    
    // Create truncated pyramid
    const pyramid = createTruncatedPyramid(nside_64, i, r_outer, color);
    
    // Add positions, radiusTargets, and colors
    allPositions.push(...pyramid.positions);
    allRadiusTargets.push(...pyramid.radiusTargets);
    allColors.push(...pyramid.colors);
    
    // Add indices with offset
    for (let j = 0; j < pyramid.indices.length; j++) {
      allIndices.push(pyramid.indices[j] + vertexOffset);
    }
    
    vertexOffset += pyramid.positions.length / 3;
    
    // Report progress occasionally
    if (i % 1000 === 0) {
      self.postMessage({ 
        type: 'progress', 
        message: `Generated ${i}/${npix_64} pyramids...`, 
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
    radiusTargets: new Float32Array(allRadiusTargets),
    colors: new Float32Array(allColors),
    indices: new Uint32Array(allIndices),
    numPyramids: vertexOffset / 8, // Each pyramid has 8 vertices
    totalPopulation: totalPop64,
    populationData: Array.from(pop_64), // Send population data for dust system
    nside: nside_64
  });
}

// Start processing when worker is loaded
processPopulationData().catch(error => {
  self.postMessage({ type: 'error', message: error.message });
});
