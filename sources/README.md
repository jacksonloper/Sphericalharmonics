# HEALPix Data Files

This directory contains spherical harmonic coefficient data expanded to HEALPix format.

## Files

- `sur_healpix_nside128.bin` - Earth surface elevation (meters)
- `bed_healpix_nside128.bin` - Earth bedrock elevation (meters)

## Format

- **Type**: Raw binary, little-endian float32
- **Pixels**: 196,608 (HEALPix nside=128)
- **Size**: 768 KB each (196,608 × 4 bytes)
- **Resolution**: ~51 km per pixel
- **Ordering**: HEALPix RING ordering

## Loading

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
