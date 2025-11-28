/**
 * Load bedrock spherical harmonics from .bshc file
 *
 * @param {string} url - Path to .bshc file
 * @param {string} format - 'float32' or 'float64'
 * @returns {Promise<{metadata: number, maxDegree: number, coefficients: Float32Array|Float64Array}>}
 */
async function loadBedrockHarmonics(url, format = 'float32') {
  // Fetch the binary file
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();

  // Choose the right typed array based on format
  const TypedArray = format === 'float32' ? Float32Array : Float64Array;
  const data = new TypedArray(arrayBuffer);

  // Parse header
  const metadata = data[0];
  const maxDegree = data[1];

  // Extract coefficients (everything after the 2-value header)
  const coefficients = data.subarray(2);

  console.log(`Loaded bedrock harmonics:`);
  console.log(`  Format: ${format}`);
  console.log(`  Max degree: L = ${maxDegree}`);
  console.log(`  Coefficients: ${coefficients.length}`);
  console.log(`  Expected: ${(maxDegree + 1) ** 2}`);

  return {
    metadata,
    maxDegree,
    coefficients
  };
}

// Example usage:

// Load compact version (0.5 MB, L=361)
const bedrock361 = await loadBedrockHarmonics('sources/bed_f32_361.bshc', 'float32');

// Load high detail version (1.0 MB, L=510)
const bedrock510 = await loadBedrockHarmonics('sources/bed_f32_510.bshc', 'float32');

// Load full resolution (36 MB, L=2160) - only if you really need it!
const bedrockFull = await loadBedrockHarmonics('sources/bed.bshc', 'float64');

// Access coefficients
console.log('First 10 coefficients:', bedrock361.coefficients.slice(0, 10));

// Convert to array if needed (for shader uniforms, etc.)
const coeffArray = Array.from(bedrock361.coefficients);
