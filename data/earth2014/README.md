# Earth2014 Gravity Model Data

This directory contains truncated spherical harmonic coefficient data from the Earth2014 gravity model.

## Data Source

The original data is from Curtin University's Digital Data for the Earth (DDFE):
- **URL**: https://ddfe.curtin.edu.au/gravitymodels/Earth2014/data_5min/shcs_to2160/Earth2014.BED2014.degree2160.bshc
- **Description**: Earth2014 BED2014 (Bedrock) spherical harmonic coefficients to degree and order 2160
- **Format**: Binary Spherical Harmonic Coefficients (BSHC)
- **SHA256**: `146dcc80f17d201352d391aa90f487f5ed16006a6a3966add2d023b998727af7`

## File Details

- **Original file**: `Earth2014.BED2014.degree2160.bshc` (~35.65 MB, degree 2160)
- **Truncated file**: `Earth2014.BED2014.degree1143.bshc` (<10 MB, degree 1143)

The file has been truncated from degree 2160 to degree 1143 to meet GitHub's file size recommendations (<10 MB). This truncation preserves all low-frequency features of the gravity model while reducing file size.

## Generating the Data File

To download and truncate the data file, run the provided Python script:

```bash
cd data/earth2014
python download_and_truncate.py
```

This will:
1. Download the full 36 MB file from Curtin University
2. Truncate it to degree 1143 (approximately 9.99 MB)
3. Save the truncated file as `Earth2014.BED2014.degree1143.bshc`

### Options

```bash
# Use a different maximum degree (default: 1143)
python download_and_truncate.py --max-degree 800

# Keep the original file after truncation
python download_and_truncate.py --keep-original

# Specify a different output directory
python download_and_truncate.py --output-dir /path/to/output
```

## BSHC Format

The BSHC (Binary Spherical Harmonic Coefficients) format stores:
- Coefficients for each degree `l` from 0 to max_degree
- For each degree, orders `m` from 0 to `l`
- Each coefficient pair consists of `Clm` and `Slm` values (double precision, 8 bytes each)

Total coefficients for degree N: sum(l+1 for l=0..N) = (N+1)(N+2)/2

## Citation

If you use this data, please cite:

> Hirt, C. and Rexer, M. (2015), Earth2014: 1 arc-min shape, topography, bedrock and ice-sheet models - available as gridded data and degree 10,800 spherical harmonics. International Journal of Applied Earth Observation and Geoinformation, 39, 103-112, doi:10.1016/j.jag.2015.03.001

## License

Please refer to Curtin University's DDFE for licensing terms: https://ddfe.curtin.edu.au/
