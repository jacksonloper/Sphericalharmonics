# Earth Topography Data

This directory contains Earth topography data in spherical harmonic and HEALPix formats.

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

## Loading HEALPix Data

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

## HEALPix Pixel Coordinates

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

## Source

Generated from BSHC spherical harmonic coefficient files (lmax=2160) using pyshtools SHT expansion and scipy interpolation to HEALPix grid.
