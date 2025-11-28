# Bedrock Spherical Harmonics Data

This directory contains Earth bedrock topography data in two formats:
1. Spherical harmonic coefficients (`.bshc`)
2. Pre-computed 3D meshes (`.bin`, `.json`)

## Spherical Harmonic Coefficient Files

| File | Format | Degree | Coefficients | Size | Description |
|------|--------|--------|--------------|------|-------------|
| `bed.bshc` | float64 | L=2160 | 4,669,921 | 36 MB | Full resolution (original) |
| `bed_f32_361.bshc` | float32 | L=361 | 131,044 | 0.5 MB | Compact version (recommended for web) |
| `bed_f32_510.bshc` | float32 | L=510 | 261,121 | 1.0 MB | High detail version |

## Pre-computed Mesh Files

| File | Vertices | Faces | Size | Description |
|------|----------|-------|------|-------------|
| `bedrock_mesh_sub5.bin` | 10,242 | 20,480 | 0.5 MB | Binary format, subdivision level 5 |
| `bedrock_mesh_sub5.json` | 10,242 | 20,480 | 1.7 MB | JSON format (human-readable) |

Pre-computed meshes have:
- **Positions**: Vertex positions scaled by magnitude (sea level → origin)
- **Colors**: Blue (negative/below sea level) and orange (positive/above sea level)
- **Normals**: Computed for smooth lighting
- **Values**: Original spherical harmonic values preserved

## File Format

Each `.bshc` file contains:
1. **Header** (2 values):
   - `metadata` (float/double): Reserved for metadata (currently 0)
   - `max_degree` (float/double): Maximum spherical harmonic degree L

2. **Coefficients** ((L+1)² values):
   - Real spherical harmonic coefficients in standard order
   - Ordered by degree l, then order m: Y₀⁰, Y₁⁻¹, Y₁⁰, Y₁¹, Y₂⁻², ...

## Recommendations

### Spherical Harmonic Coefficients
- **Web deployment**: Use `bed_f32_361.bshc` (smallest, good quality)
- **High detail visualization**: Use `bed_f32_510.bshc` (best quality under 1MB)
- **Scientific analysis**: Use `bed.bshc` (full resolution)

### Pre-computed Meshes
- **Fastest loading**: Use `bedrock_mesh_sub5.bin` (binary format, instant rendering)
- **Development/debugging**: Use `bedrock_mesh_sub5.json` (human-readable)

Pre-computed meshes are ideal for direct visualization without needing to evaluate spherical harmonics on the client.

## Loading in Browser JavaScript

```javascript
async function loadBedrockHarmonics(url, format = 'float32') {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();

  const TypedArray = format === 'float32' ? Float32Array : Float64Array;
  const data = new TypedArray(arrayBuffer);

  return {
    metadata: data[0],
    maxDegree: data[1],
    coefficients: data.subarray(2)  // All coefficients after 2-value header
  };
}

// Example usage:
const bedrock = await loadBedrockHarmonics('sources/bed_f32_361.bshc', 'float32');
console.log(`Loaded L=${bedrock.maxDegree}, ${bedrock.coefficients.length} coefficients`);
```

See `load-bedrock.js` in the root directory for a complete example with error handling.

## Loading Pre-computed Meshes

```javascript
// Binary format (recommended)
async function loadBinaryMesh(url) {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const view = new DataView(buffer);

  const vertexCount = view.getUint32(0, true);
  const faceCount = view.getUint32(4, true);

  return {
    positions: new Float32Array(buffer, 8, vertexCount * 3),
    colors: new Float32Array(buffer, 8 + vertexCount * 12, vertexCount * 3),
    indices: new Uint32Array(buffer, 8 + vertexCount * 24, faceCount * 3)
  };
}

// Use with Three.js
const mesh = await loadBinaryMesh('sources/bedrock_mesh_sub5.bin');
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
geometry.setAttribute('color', new THREE.BufferAttribute(mesh.colors, 3));
geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
geometry.computeVertexNormals();
```

See `load-bedrock-mesh.js` in the root directory for complete example with Three.js integration.

## Notes

- Float32 precision (~7 decimal digits) is sufficient for topography visualization
- L=361 provides ~50km resolution at Earth's surface
- L=510 provides ~40km resolution at Earth's surface
- L=2160 provides ~9km resolution at Earth's surface
