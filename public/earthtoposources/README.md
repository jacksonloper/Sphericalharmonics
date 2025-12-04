# Earth Topography Data Sources

This directory contains Earth topography data sources used for visualizations.

## Data Sources & Citations

### Earth2014 Spherical Harmonics

**Earth2014** global relief model:
https://ddfe.curtin.edu.au/gravitymodels/Earth2014/data_5min/shcs_to2160/

Used for:
- `sur.bshc` - Earth surface elevation (topography)
- `bed.bshc` - Earth bedrock elevation (bathymetry/sub-ice topography)

### ETOPO 2022

**ETOPO 2022 15 Arc-Second Global Relief Model**:
https://www.ncei.noaa.gov/products/etopo-global-relief-model

**Citation**:
> NOAA National Centers for Environmental Information. 2022: ETOPO 2022 15 Arc-Second Global Relief Model. NOAA National Centers for Environmental Information. DOI: 10.25921/fd45-gt74. Accessed [date].

Used for HEALPix-gridded elevation data at multiple resolutions.

### Global Surface Water

**Global Surface Water** dataset:
https://global-surface-water.appspot.com/download

**Citation**:
> Jean-Francois Pekel, Andrew Cottam, Noel Gorelick, Alan S. Belward, High-resolution mapping of global surface water and its long-term changes. Nature 540, 418-422 (2016).

Used for water occurrence data at HEALPix resolutions.

### WorldPop Global Population

**WorldPop Global Demographic Data Project** - Population Distribution (2024 estimates):
https://www.worldpop.org/

Data represents 2024 population estimates with total number of people per grid-cell at 30 arc-second resolution (approximately 1km at the equator). Random Forest-based dasymetric redistribution mapping approach. WGS84 projection.

**Citation**:
> Bondarenko M., Priyatikanto R., Tejedor-Garavito N., Zhang W., McKeen T., Cunningham A., Woods T., Hilton J., Cihan D., Nosatiuk B., Brinkhoff T., Tatem A., Sorichetta A.. 2025. The spatial distribution of population in 2015-2030 at a resolution of 30 arc (approximately 1km at the equator) R2025A version v1. WorldPop - School of Geography and Environmental Science, University of Southampton. DOI:10.5258/SOTON/WP00845

Accessed December 4, 2025. Note: Dataset was in alpha version (R2025A) at time of access and may differ slightly from current version.

Used for population density data at HEALPix resolutions.

---

## File Formats

### BSHC (Binary Spherical Harmonic Coefficients)

BSHC is a binary format used by [SHTOOLS](https://shtools.github.io/SHTOOLS/) for storing spherical harmonic coefficients. To read these files, use the SHTOOLS library:

```python
import pyshtools as pysh
coeffs, lmax = pysh.shio.read_bshc('sur.bshc')
```

### HEALPix NumPy Arrays

The `.npy` files store NumPy arrays with HEALPix-gridded data in NESTED ordering scheme. Load with:

```python
import numpy as np
data = np.load('etopo2022_surface_min_mean_max_healpix128_NESTED.npy')
```

---

## Files in This Directory

### BSHC Files (Spherical Harmonic Coefficients)
- `sur.bshc` - Earth surface elevation (topography) at lmax=2160
- `bed.bshc` - Earth bedrock elevation (bathymetry/sub-ice topography) at lmax=2160

### ETOPO Data Files (HEALPix Format)
- `etopo2022_surface_min_mean_max_healpix64_NESTED.npy` - Resolution 64
- `etopo2022_surface_min_mean_max_healpix128_NESTED.npy` - Resolution 128
- `etopo2022_surface_min_mean_max_healpix256_NESTED.npy` - Resolution 256

Each file contains min, mean, and max elevation values for each HEALPix cell.

### Water Data Files (HEALPix Format)
- `water_occurrence_healpix64_NESTED.npy` - Resolution 64
- `water_occurrence_healpix128_NESTED.npy` - Resolution 128
- `water_occurrence_healpix256_NESTED.npy` - Resolution 256
- `water_occurrence_healpix256_thumbnail_mollweide.png` - Visualization thumbnail

Each file contains water occurrence percentages for each HEALPix cell.

**Note on Polar Regions**: The Global Surface Water dataset has no data near the poles. For these regions, water vs land classification is determined using elevation above sea level from the ETOPO 2022 dataset instead of water occurrence data.

### Population Data Files (HEALPix Format)
- `population_healpix128_NESTED.npy` - Resolution 128

Each file contains 2024 population estimates (number of people) for each HEALPix cell.

---

## License

Earth topography data is from the Earth2014 model. The mesh generator and loader are provided as-is.
