#!/usr/bin/env python3
"""
Convert BSHC spherical harmonic coefficients to HEALPix format.

HEALPix (Hierarchical Equal Area isoLatitude Pixelization) provides equal-area
pixels on the sphere, making it ideal for high-resolution mesh generation.

The conversion uses pyshtools for efficient SHT expansion to a regular grid,
then interpolates to HEALPix pixel locations.

Output formats:
- FITS file (standard HEALPix format, readable by healpy)
- NumPy .npy file (for easy Python use)
"""

import numpy as np
import healpy as hp
import pyshtools as pysh
from scipy.ndimage import map_coordinates
import os
import time


def bshc_to_healpix(input_path, nside, max_lmax=None):
    """
    Convert BSHC file to HEALPix data.
    
    Args:
        input_path: Path to .bshc file
        nside: HEALPix nside parameter (must be power of 2)
        max_lmax: Maximum l to use (None = use all)
    
    Returns:
        healpix_data: 1D array of HEALPix pixel values
        lmax_used: Actual lmax used
    """
    print(f"Loading BSHC file: {input_path}")
    start = time.time()
    coeffs, lmax_file = pysh.shio.read_bshc(input_path)
    print(f"Loaded in {time.time()-start:.1f}s, file contains lmax={lmax_file}")
    
    # Optionally truncate
    if max_lmax is not None and max_lmax < lmax_file:
        lmax_used = max_lmax
        coeffs = coeffs[:, :lmax_used+1, :lmax_used+1]
        print(f"Truncating to lmax={lmax_used}")
    else:
        lmax_used = lmax_file
    
    # Check nside is sufficient for the resolution
    # Rule of thumb: lmax <= 3*nside - 1 for accurate representation
    min_nside = (lmax_used + 1) // 3 + 1
    if nside < min_nside:
        print(f"Warning: nside={nside} may be too low for lmax={lmax_used}")
        print(f"         Recommended minimum nside={min_nside}")
    
    npix = hp.nside2npix(nside)
    res_arcmin = hp.nside2resol(nside, arcmin=True)
    res_km = res_arcmin * (np.pi/180/60) * 6371
    print(f"HEALPix nside={nside}: {npix:,} pixels, resolution ~{res_arcmin:.1f}' (~{res_km:.1f} km)")
    
    # Expand SH to regular grid using efficient SHT
    print("Expanding SH coefficients using SHT...")
    start = time.time()
    grid = pysh.expand.MakeGridDH(coeffs, sampling=2)
    print(f"SHT completed in {time.time()-start:.1f}s, grid shape: {grid.shape}")
    
    nlat, nlon = grid.shape
    
    # Get HEALPix pixel coordinates
    print("Interpolating to HEALPix pixels...")
    start = time.time()
    
    # theta=colatitude [0,pi], phi=longitude [0,2*pi]
    theta, phi = hp.pix2ang(nside, np.arange(npix))
    
    # Convert to grid indices for interpolation
    # Grid: lat index 0 = colatitude 0, lat index nlat-1 = colatitude pi
    lat_idx = theta * (nlat - 1) / np.pi
    # Grid: lon index 0 = longitude 0, lon index nlon-1 = longitude 2*pi*(nlon-1)/nlon
    lon_idx = phi * nlon / (2 * np.pi)
    lon_idx = np.mod(lon_idx, nlon)  # Wrap around
    
    # Bilinear interpolation
    healpix_data = map_coordinates(grid, [lat_idx, lon_idx], order=1, mode='wrap')
    
    print(f"Interpolation completed in {time.time()-start:.1f}s")
    print(f"Value range: [{healpix_data.min():.2f}, {healpix_data.max():.2f}]")
    
    return healpix_data, lmax_used


def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='Convert BSHC to HEALPix format')
    parser.add_argument('--input', '-i', required=True, help='Input BSHC file')
    parser.add_argument('--output', '-o', required=True, help='Output file base name (without extension)')
    parser.add_argument('--nside', '-n', type=int, default=1024,
                        help='HEALPix nside (power of 2, default: 1024 = 12.5M pixels)')
    parser.add_argument('--max-lmax', type=int, default=None,
                        help='Maximum l to use (default: use all)')
    parser.add_argument('--format', choices=['fits', 'npy', 'both'], default='both',
                        help='Output format (default: both)')
    args = parser.parse_args()
    
    # Get script directory for relative paths
    script_dir = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.dirname(script_dir)
    
    input_path = os.path.join(repo_root, args.input) if not os.path.isabs(args.input) else args.input
    output_base = os.path.join(repo_root, args.output) if not os.path.isabs(args.output) else args.output
    
    # Convert
    healpix_data, lmax_used = bshc_to_healpix(input_path, args.nside, args.max_lmax)
    
    # Save output(s)
    if args.format in ['fits', 'both']:
        fits_path = f"{output_base}.fits"
        hp.write_map(fits_path, healpix_data, overwrite=True)
        print(f"Saved FITS: {fits_path}")
    
    if args.format in ['npy', 'both']:
        npy_path = f"{output_base}.npy"
        np.save(npy_path, healpix_data)
        print(f"Saved NPY: {npy_path}")
    
    print("Done!")


if __name__ == '__main__':
    main()
