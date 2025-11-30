# Earth Topography Data

This directory contains Earth topography data derived from spherical harmonic coefficients for three.js visualization.

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

## Compact Mesh Files

Pre-computed icosahedral mesh elevation data for three.js visualization:

| File | Subdivisions | Vertices | Triangles | File Size |
|------|--------------|----------|-----------|-----------|
| `sur_compact5.bin` | 5 | 10,242 | 20,480 | 40 KB |
| `sur_compact6.bin` | 6 | 40,962 | 81,920 | 160 KB |
| `sur_compact7.bin` | 7 | 163,842 | 327,680 | 640 KB |
| `sur_compact8.bin` | 8 | 655,362 | 1,310,720 | 2.5 MB |
| `sur_compact9.bin` | 9 | 2,621,442 | 5,242,880 | 10 MB |

### Compact Mesh Format

```
Header:    'HPELEV' (6 bytes)
Metadata:
  - subdivisions: uint8 (1 byte)

Data:
  - elevation: float32[num_vertices] (elevation in meters)
```

The icosahedral mesh geometry is generated procedurally from the subdivision level, so only elevation data needs to be stored.

---

## Generating Mesh Data

Use the Python script to generate mesh data from BSHC files:

```bash
# Install dependencies
pip install pyshtools numpy scipy

# Generate subdivision 9 mesh with tapering (default)
python generate_compact_mesh_from_bshc.py 9

# Generate different subdivision level
python generate_compact_mesh_from_bshc.py 8

# Customize taper start (default: 50 degrees from end)
python generate_compact_mesh_from_bshc.py 9 100
```

The script:
1. Reads BSHC spherical harmonic coefficients
2. Applies cosine tapering to highest-order coefficients (avoids truncation artifacts)
3. Uses fast SHT to expand to a regular grid
4. Interpolates elevation at icosahedral mesh vertices
5. Exports compact binary format

---

## Loading in three.js

### Basic Usage

```javascript
import { loadCompactMesh } from './compactMeshLoader.js';
import { createElevationMaterial } from './elevationMaterial.js';

// Load mesh
const geometry = await loadCompactMesh('/earthtoposources/sur_compact9.bin', {
  useWorker: true,  // Use Web Worker for better performance
  onProgress: (progress) => console.log(progress)
});

// Create material with elevation coloring
const material = createElevationMaterial(
  geometry.userData.elevationMin,
  geometry.userData.elevationMax
);

// Create and add mesh to scene
const earthMesh = new THREE.Mesh(geometry, material);
scene.add(earthMesh);
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
- Adjustable relief exponent
- Wireframe toggle

---

## Technical Details

### Mesh Generation
- **Base**: Icosahedron (12 vertices, 20 faces)
- **Subdivision**: Each triangle split into 4 per level
- **Projection**: Vertices projected to unit sphere
- **Elevation**: Sampled from spherical harmonic expansion

### Spherical Harmonic Processing
- **Source**: Earth2014 model (lmax=2160, ~9 km resolution)
- **Tapering**: Cosine taper on top 50 degrees to avoid Gibbs phenomenon
- **Transform**: Fast SHT via pyshtools
- **Interpolation**: Bivariate spline on regular lat/lon grid

### Coordinate System
- **Unit sphere**: All vertices on sphere with radius = 1.0
- **Elevation**: Stored separately in meters
- **Orientation**: Z-up (requires rotation for Y-up renderers)

---

## License

Earth topography data is from the Earth2014 model. The mesh generator and loader are provided as-is.
