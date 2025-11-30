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

## Mesh Files

### Compact Mesh (Elevation Only)

Pre-computed icosahedral mesh elevation data for flat shading:

| File | Subdivisions | Vertices | Triangles | File Size |
|------|--------------|----------|-----------|-----------|
| `sur_compact5.bin` | 5 | 10,242 | 20,480 | 40 KB |
| `sur_compact6.bin` | 6 | 40,962 | 81,920 | 160 KB |
| `sur_compact7.bin` | 7 | 163,842 | 327,680 | 640 KB |
| `sur_compact8.bin` | 8 | 655,362 | 1,310,720 | 2.5 MB |
| `sur_compact9.bin` | 9 | 2,621,442 | 5,242,880 | 10 MB |

**Format:**
```
Header:    'HPELEV' (6 bytes)
Metadata:  subdivisions: uint8 (1 byte)
Data:      elevation: float32[num_vertices]
```

### Gradient Mesh (Elevation + Normals)

Pre-computed mesh with analytical gradients for smooth vertex shading:

| File | Subdivisions | Vertices | Triangles | File Size |
|------|--------------|----------|-----------|-----------|
| `sur_gradient8.bin` | 8 | 655,362 | 1,310,720 | 7.5 MB |

**Format:**
```
Header:    'HPGRAD' (6 bytes)
Metadata:  subdivisions: uint8 (1 byte)
Data:      elevation: float32[num_vertices]
           d_lat: float32[num_vertices]  (gradient w.r.t. latitude, m/degree)
           d_lon: float32[num_vertices]  (gradient w.r.t. longitude, m/degree)
```

The gradients are computed analytically from the spherical harmonic expansion using pyshtools' `gradient()` method. They enable smooth vertex normal computation without needing higher subdivision levels.

---

## Shading Comparison

| Mode | Subdivision | Vertices | File Size | Quality |
|------|-------------|----------|-----------|---------|
| Flat (9 sub) | 9 | 2.6M | 10 MB | Sharp edges, high detail |
| Smooth (8 sub) | 8 | 655K | 7.5 MB | Smooth normals, lower poly |

- **Flat shading** computes normals per-fragment using screen-space derivatives
- **Smooth shading** uses pre-computed vertex normals from analytical SH gradients

---

## Generating Mesh Data

### Elevation-only mesh (flat shading)

```bash
pip install pyshtools numpy scipy
python generate_compact_mesh_from_bshc.py 9    # subdivision 9
python generate_compact_mesh_from_bshc.py 8    # subdivision 8
```

### Gradient mesh (smooth shading)

```bash
python generate_gradient_mesh.py 8             # subdivision 8 with gradients
```

Both scripts:
1. Read BSHC spherical harmonic coefficients
2. Apply cosine tapering to highest-order coefficients (avoids truncation artifacts)
3. Use fast SHT to expand to a regular grid
4. Interpolate elevation (and gradients) at icosahedral mesh vertices
5. Export binary format

---

## Loading in three.js

### Flat shading (elevation only)

```javascript
import { loadCompactMesh } from './compactMeshLoader.js';
import { createElevationMaterial } from './elevationMaterial.js';

const geometry = await loadCompactMesh('/earthtoposources/sur_compact9.bin', {
  useWorker: true
});
const material = createElevationMaterial(
  geometry.userData.elevationMin,
  geometry.userData.elevationMax
);
```

### Smooth shading (with gradients)

```javascript
import { loadGradientMesh } from './compactMeshLoader.js';
import { createSmoothElevationMaterial } from './elevationMaterial.js';

const geometry = await loadGradientMesh('/earthtoposources/sur_gradient8.bin', {
  useWorker: true
});
const material = createSmoothElevationMaterial(
  geometry.userData.elevationMin,
  geometry.userData.elevationMax
);
```

---

## Demo

```bash
npm run dev
# Then open http://localhost:5173/earth.html
```

The demo includes:
- Toggle between flat (9-subdivision) and smooth (8-subdivision) shading
- Auto-rotating Earth with topography
- Elevation-based color mapping
- Interactive orbit controls
- Adjustable relief exponent
- Wireframe toggle

---

## Technical Details

### Mesh Generation
- **Base**: Icosahedron (12 vertices, 20 faces)
- **Subdivision**: Each triangle split into 4 per level
- **Projection**: Vertices projected to unit sphere

### Spherical Harmonic Processing
- **Source**: Earth2014 model (lmax=2160, ~9 km resolution)
- **Tapering**: Cosine taper on top 50 degrees to avoid Gibbs phenomenon
- **Transform**: Fast SHT via pyshtools
- **Gradients**: Analytical ∂f/∂θ and ∂f/∂φ from pyshtools gradient method

### Coordinate System
- **Unit sphere**: All vertices on sphere with radius = 1.0
- **Elevation**: Stored separately in meters
- **Orientation**: Z-up (requires rotation for Y-up renderers)

---

## License

Earth topography data is from the Earth2014 model. The mesh generator and loader are provided as-is.
