# Earth Topography Data Sources

This directory contains Earth topography data sources used for visualizations.

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

## Files in This Directory

### BSHC Files (Spherical Harmonic Coefficients)
- `sur.bshc` - Earth surface elevation (topography)
- `bed.bshc` - Earth bedrock elevation (bathymetry/sub-ice topography)

### ETOPO Data Files (HEALPix Format)
- `etopo2022_surface_min_mean_max_healpix64_NESTED.npy` - Resolution 64
- `etopo2022_surface_min_mean_max_healpix128_NESTED.npy` - Resolution 128
- `etopo2022_surface_min_mean_max_healpix256_NESTED.npy` - Resolution 256

Each file contains min, mean, and max elevation values for each HEALPix cell.

### Water Data Files (HEALPix Format)
- `water_occurrence_healpix64_NESTED.npy` - Resolution 64
- `water_occurrence_healpix128_NESTED.npy` - Resolution 128
- `water_occurrence_healpix256_NESTED.npy` - Resolution 256

Each file contains water occurrence percentages for each HEALPix cell.

---

## License

Earth topography data is from the Earth2014 model. The mesh generator and loader are provided as-is.
