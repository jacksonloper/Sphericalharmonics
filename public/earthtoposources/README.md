# Earth Topography Data

This directory contains Earth topography data in spherical harmonic, HEALPix, and mesh formats for three.js visualization.

## Source Data

The BSHC files are from the **Earth2014** model:
https://ddfe.curtin.edu.au/gravitymodels/Earth2014/data_5min/shcs_to2160/

- `sur.bshc` - Earth surface elevation (topography)
- `bed.bshc` - Earth bedrock elevation (bathymetry/sub-ice topography)

### BSHC File Format

BSHC (Binary Spherical Harmonic Coefficients) is a format used by [SHTOOLS](https://shtools.github.io/SHTOOLS/) / Curtin University:

- **Type**: Raw binary, little-endian float64
- **Structure**:
  - First 2 float64 values: `min_degree` (0) and `max_degree` (2160)
  - Then `(lmax+1)(lmax+2)/2` cosine coefficients C(l,m)
  - Then `(lmax+1)(lmax+2)/2` sine coefficients S(l,m)
- **Coefficients**: 2,336,041 each for cosine and sine (lmax=2160)
- **Size**: ~35.6 MB each

**Loading with pyshtools**:
```python
import pyshtools as pysh
coeffs, lmax = pysh.shio.read_bshc('sur.bshc')
```

---

## HEALPix Files

Pre-computed HEALPix grids for efficient mesh generation:

- `sur_healpix_nside128.bin` - Surface elevation (meters)
- `bed_healpix_nside128.bin` - Bedrock elevation (meters)

### HEALPix Format

- **Type**: Raw binary, little-endian float32
- **Pixels**: 196,608 (HEALPix nside=128)
- **Size**: 768 KB each (196,608 × 4 bytes)
- **Resolution**: ~51 km per pixel
- **Ordering**: HEALPix RING ordering

### Loading HEALPix Data

**Python (numpy)**:
```python
import numpy as np
data = np.fromfile('sur_healpix_nside128.bin', dtype='<f4')  # shape: (196608,)
```

**Python (healpy)**:
```python
import numpy as np
import healpy as hp
data = np.fromfile('sur_healpix_nside128.bin', dtype='<f4')
hp.mollview(data, title='Surface Elevation')
```

**JavaScript**:
```javascript
const response = await fetch('sur_healpix_nside128.bin');
const buffer = await response.arrayBuffer();
const data = new Float32Array(buffer);  // length: 196608
```

**C/C++**:
```c
float data[196608];
FILE* f = fopen("sur_healpix_nside128.bin", "rb");
fread(data, sizeof(float), 196608, f);
fclose(f);
```

### HEALPix Pixel Coordinates

To get the (theta, phi) spherical coordinates for pixel `i`:

```python
import healpy as hp
nside = 128
theta, phi = hp.pix2ang(nside, i)  # theta: colatitude [0,π], phi: longitude [0,2π]
```

Or Cartesian (x, y, z) on unit sphere:

```python
x, y, z = hp.pix2vec(nside, i)
```

---

## Spherical Mesh Files for three.js

Pre-converted triangulated spherical meshes optimized for three.js visualization.

### Available Meshes

- `sur_mesh32.bin` - Surface elevation (321 KB, **recommended**)
- `sur_mesh64.bin` - Surface elevation (1.3 MB, higher resolution)
- `sur_mesh.bin` - Surface elevation (6.8 MB, full resolution nside=128)

### Binary Mesh Format

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

### Resolution Comparison

| nside | Vertices | Triangles | File Size | Detail Level |
|-------|----------|-----------|-----------|--------------|
| 16    | 3,072    | ~5.5k     | ~80 KB    | Low          |
| 32    | 12,288   | ~22k      | ~321 KB   | **Recommended** |
| 64    | 49,152   | ~89k      | ~1.3 MB   | High         |
| 128   | 196,608  | ~327k     | ~7 MB     | Very High    |

**Recommended**: nside=32 provides good detail while staying well under 1 MB.

---

## Loading in three.js

### Basic Usage

```javascript
import { loadHealpixMesh, createElevationMaterial } from './healpixMeshLoader.js';

// Load mesh
const geometry = await loadHealpixMesh('/earthtoposources/sur_mesh32.bin');

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
const geometry = await loadHealpixMesh('/earthtoposources/sur_mesh32.bin');

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

### Apply Elevation as Displacement

To apply elevation as actual vertex displacement:

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

---

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

---

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

---

## Technical Details

### Mesh Features
- ✅ Spherical quad mesh topology (native to HEALPix)
- ✅ Float32 positions for precise geometry
- ✅ Float32 elevation data at each vertex
- ✅ Automatic normal computation for lighting
- ✅ Compact binary format
- ✅ Sub-megabyte file sizes (at nside=32)

### Coordinate System
- **Unit sphere**: All vertices on sphere with radius = 1.0
- **Elevation**: Stored separately in meters (not applied to geometry)
- **Normals**: Computed from mesh topology (point radially outward)

### HEALPix → Mesh Conversion
1. **Load HEALPix data** in RING ordering
2. **Downsample** if needed (averaging nearby pixels)
3. **Generate vertices** using HEALPix pixel centers
4. **Create triangles** by connecting neighboring pixels:
   - North polar cap: connect to pole
   - Equatorial belt: connect adjacent rings
   - South polar cap: connect to pole
5. **Export** in compact binary format

---

## Data Generation

The HEALPix files were generated from BSHC spherical harmonic coefficient files (lmax=2160) using pyshtools SHT expansion and scipy interpolation to HEALPix grid.

The mesh files were converted from HEALPix data with downsampling and triangulation.

---

## License

Earth topography data is from the Earth2014 model. The mesh converter and loader are provided as-is.
