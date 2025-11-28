# HEALPix Spherical Mesh for three.js

This directory contains tools for converting HEALPix elevation data into efficient spherical meshes suitable for three.js visualization.

## Overview

The HEALPix (Hierarchical Equal Area isoLatitude Pixelization) format is converted into a triangulated spherical mesh with:
- **Positions**: 3D vertex coordinates on a unit sphere (Float32)
- **Indices**: Triangle connectivity (Uint16 or Uint32)
- **Elevation**: Height data at each vertex (Float32)

## File Format

### Binary Mesh Format (.bin)

```
Header:    'HPMESH' (6 bytes)
Metadata:
  - num_vertices: uint32 (4 bytes)
  - num_indices:  uint32 (4 bytes)
  - index_type:   uint8  (1 byte) - 2 for uint16, 4 for uint32

Data:
  - positions:  float32[num_vertices * 3]  (x, y, z coordinates)
  - indices:    uint16/32[num_indices]     (triangle indices)
  - elevation:  float32[num_vertices]      (elevation in meters)
```

## Converting HEALPix to Mesh

### Usage

```bash
python3 convert_healpix_optimized.py <input.bin> <nside_out> <output.bin>
```

### Examples

```bash
# Create nside=32 mesh (~321 KB)
python3 convert_healpix_optimized.py sources/sur_healpix_nside128.bin 32 sources/sur_mesh32.bin

# Create nside=64 mesh (~1.3 MB)
python3 convert_healpix_optimized.py sources/sur_healpix_nside128.bin 64 sources/sur_mesh64.bin

# Convert bedrock data
python3 convert_healpix_optimized.py sources/bed_healpix_nside128.bin 32 sources/bed_mesh32.bin
```

### Resolution Comparison

| nside | Vertices | Triangles | File Size | Detail Level |
|-------|----------|-----------|-----------|--------------|
| 16    | 3,072    | ~5.5k     | ~80 KB    | Low          |
| 32    | 12,288   | ~22k      | ~321 KB   | **Recommended** |
| 64    | 49,152   | ~89k      | ~1.3 MB   | High         |
| 128   | 196,608  | ~327k     | ~7 MB     | Very High    |

**Recommended**: nside=32 provides good detail while staying well under 1 MB.

## Loading in three.js

### Basic Usage

```javascript
import { loadHealpixMesh, createElevationMaterial } from './healpixMeshLoader.js';

// Load mesh
const geometry = await loadHealpixMesh('/sources/sur_mesh32.bin');

// Create material with elevation coloring
const material = createElevationMaterial(
  geometry.userData.elevationMin,
  geometry.userData.elevationMax
);

// Create and add mesh to scene
const earthMesh = new THREE.Mesh(geometry, material);
scene.add(earthMesh);
```

### Custom Material

You can access the elevation data as a vertex attribute:

```javascript
const geometry = await loadHealpixMesh('/sources/sur_mesh32.bin');

// Elevation is available as:
// - geometry.attributes.elevation (BufferAttribute)
// - geometry.userData.elevationMin (minimum value)
// - geometry.userData.elevationMax (maximum value)

// Use in custom shader:
const material = new THREE.ShaderMaterial({
  vertexShader: `
    attribute float elevation;
    varying float vElevation;

    void main() {
      vElevation = elevation;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float minElevation;
    uniform float maxElevation;
    varying float vElevation;

    void main() {
      float t = (vElevation - minElevation) / (maxElevation - minElevation);
      vec3 color = mix(vec3(0.0, 0.2, 0.5), vec3(1.0), t);
      gl_FragColor = vec4(color, 1.0);
    }
  `,
  uniforms: {
    minElevation: { value: geometry.userData.elevationMin },
    maxElevation: { value: geometry.userData.elevationMax }
  }
});
```

## Demo

A complete demo is available in `earth.html`:

```bash
npm run dev
# Then open http://localhost:5173/earth.html
```

The demo includes:
- Auto-rotating Earth with topography
- Elevation-based color mapping (ocean blue → green → brown → white)
- Interactive orbit controls
- Smooth lighting

## Features

### Mesh Properties
- ✅ Spherical quad mesh topology (native to HEALPix)
- ✅ Float32 positions for precise geometry
- ✅ Float32 elevation data at each vertex
- ✅ Automatic normal computation for lighting
- ✅ Compact binary format
- ✅ Sub-megabyte file sizes (at nside=32)

### Shader Material
- ✅ Elevation-based color mapping
- ✅ Ocean/land/mountain color gradients
- ✅ Simple diffuse lighting
- ✅ Customizable color schemes

## Performance

### File Sizes (nside=32)
- Surface mesh: 321 KB
- Bedrock mesh: 321 KB
- Total: ~642 KB for both datasets

### Render Performance
- 12,288 vertices
- ~22,000 triangles
- Runs at 60 FPS on modern hardware
- Suitable for real-time interaction

## Technical Details

### HEALPix → Mesh Conversion
1. **Load HEALPix data** in RING ordering
2. **Downsample** if needed (averaging nearby pixels)
3. **Generate vertices** using HEALPix pixel centers
4. **Create triangles** by connecting neighboring pixels:
   - North polar cap: connect to pole
   - Equatorial belt: connect adjacent rings
   - South polar cap: connect to pole
5. **Export** in compact binary format

### Coordinate System
- **Unit sphere**: All vertices on sphere with radius = 1.0
- **Elevation**: Stored separately in meters (not applied to geometry)
- **Normals**: Computed from mesh topology (point radially outward)

To apply elevation as displacement:
```javascript
const vertices = geometry.attributes.position.array;
const elevations = geometry.attributes.elevation.array;
const scale = 0.001; // Scale factor (adjust for visible effect)

for (let i = 0; i < elevations.length; i++) {
  const i3 = i * 3;
  const r = 1.0 + elevations[i] * scale;
  vertices[i3 + 0] *= r;
  vertices[i3 + 1] *= r;
  vertices[i3 + 2] *= r;
}

geometry.attributes.position.needsUpdate = true;
geometry.computeVertexNormals();
```

## Data Sources

- **HEALPix files**: `sources/sur_healpix_nside128.bin`, `sources/bed_healpix_nside128.bin`
- **Original data**: Earth2014 model (BSHC spherical harmonic coefficients)
- **Resolution**: nside=128 (~51 km per pixel) downsampled to nside=32 (~200 km per pixel)

## License

The mesh converter and loader are provided as-is. Earth topography data is from the Earth2014 model.
