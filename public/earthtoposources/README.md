# Earth Topography Data

This directory contains Earth topography data derived from spherical harmonic coefficients for three.js visualization.

## Source Data

### Earth2014 Spherical Harmonics

The BSHC files are from the **Earth2014** model:
https://ddfe.curtin.edu.au/gravitymodels/Earth2014/data_5min/shcs_to2160/

- `sur.bshc` - Earth surface elevation (topography)
- `bed.bshc` - Earth bedrock elevation (bathymetry/sub-ice topography)

### ETOPO Data

ETOPO data is from the **ETOPO 2022 15 Arc-Second Global Relief Model**:
https://www.ncei.noaa.gov/products/etopo-global-relief-model

**Citation**:
> NOAA National Centers for Environmental Information. 2022: ETOPO 2022 15 Arc-Second Global Relief Model. NOAA National Centers for Environmental Information. DOI: 10.25921/fd45-gt74. Accessed [date].

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

### Water Data

The water data is from the **Global Surface Water** dataset:
https://global-surface-water.appspot.com/download

**Citation**:
> Jean-Francois Pekel, Andrew Cottam, Noel Gorelick, Alan S. Belward, High-resolution mapping of global surface water and its long-term changes. Nature 540, 418-422 (2016).

---

## Mesh Files

Pre-computed icosahedral mesh elevation data at various spherical harmonic truncation levels.
Each file uses cosine apodization to avoid Gibbs ringing artifacts at the cutoff frequency.

| File | lmax | Subdivisions | Vertices | File Size | Description |
|------|------|--------------|----------|-----------|-------------|
| `sur_lmax4.bin` | 4 | 2 | 162 | 0.6 KB | Very low - basic shape |
| `sur_lmax8.bin` | 8 | 3 | 642 | 2.5 KB | Low - major features |
| `sur_lmax16.bin` | 16 | 4 | 2,562 | 10 KB | Medium-low - continental shapes |
| `sur_lmax32.bin` | 32 | 5 | 10,242 | 40 KB | Medium - mountain ranges visible |
| `sur_lmax64.bin` | 64 | 6 | 40,962 | 160 KB | Higher - regional detail |
| `sur_lmax128.bin` | 128 | 7 | 163,842 | 640 KB | High - significant detail |
| `sur_lmax360.bin` | 360 | 8 | 655,362 | 2.5 MB | Very high - fine detail |
| `sur_compact9.bin` | 2160 | 9 | 2,621,442 | 10 MB | Full resolution (~9km) |

### Subdivision Level Selection

The mesh subdivision level for each lmax is chosen based on Nyquist sampling:
- To properly sample harmonics up to degree lmax, we need approximately `sqrt(N_vertices) / 2 >= lmax`
- This ensures no aliasing artifacts from undersampling

**Format:**
```
Header:    'HPELEV' (6 bytes)
Metadata:  subdivisions: uint8 (1 byte)
Data:      elevation: float32[num_vertices]
```

The icosahedral mesh geometry is generated procedurally from the subdivision level, so only elevation data needs to be stored.

---

## Generating Mesh Data

### Full Resolution (lmax=2160)

```bash
pip install pyshtools numpy scipy
python generate_compact_mesh_from_bshc.py 9    # subdivision 9
```

### Multiple Truncation Levels

```bash
pip install pyshtools numpy scipy
python generate_truncated_meshes.py           # generates all levels
python generate_truncated_meshes.py 64        # generate only lmax=64
```

The scripts:
1. Read BSHC spherical harmonic coefficients
2. Truncate to desired lmax (for truncated meshes)
3. Apply cosine tapering/apodization (avoids truncation artifacts)
4. Use fast SHT to expand to a regular grid
5. Interpolate elevation at icosahedral mesh vertices
6. Export binary format

---

## Loading in three.js

```javascript
import { loadCompactMesh } from './compactMeshLoader.js';
import { createElevationMaterial } from './elevationMaterial.js';

// Load any truncation level
const geometry = await loadCompactMesh('/earthtoposources/sur_lmax32.bin', {
  useWorker: true
});
const material = createElevationMaterial(
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
- **Truncation level selector**: Choose different lmax values to see how harmonic approximations improve
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
- **Tapering**: Cosine taper on top 20% of coefficients to avoid Gibbs phenomenon
- **Transform**: Fast SHT via pyshtools

### Coordinate System
- **Unit sphere**: All vertices on sphere with radius = 1.0
- **Elevation**: Stored separately in meters
- **Orientation**: Z-up (requires rotation for Y-up renderers)

---

## License

Earth topography data is from the Earth2014 model. The mesh generator and loader are provided as-is.
