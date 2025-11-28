#!/usr/bin/env python3
"""
Render spherical harmonic coefficients from a .bshc file to a 2D map projection.

This script uses pyshtools to efficiently expand spherical harmonics using the
proper Spherical Harmonic Transform (SHT), which is orders of magnitude faster
than naive point-by-point evaluation.

Output: PNG image with colorbar.
"""

import numpy as np
import pyshtools as pysh
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import os
import time


def render_map_projection(coeffs, lmax, output_path, title="Spherical Harmonics Map"):
    """
    Render SH coefficients as a 2D equirectangular map projection using pyshtools SHT.
    
    Args:
        coeffs: pyshtools coefficient array, shape (2, lmax+1, lmax+1)
        lmax: Maximum spherical harmonic degree
        output_path: Path to save PNG
        title: Plot title
    """
    # Use pyshtools' efficient SHT to expand coefficients to a grid
    # sampling=2 gives an equally-spaced grid in latitude and longitude
    # The grid size is automatically determined by lmax: (2*lmax+2) x (4*lmax+4)
    print(f"Expanding SH coefficients using SHT (lmax={lmax})...")
    start_time = time.time()
    
    grid = pysh.expand.MakeGridDH(coeffs, sampling=2)
    
    elapsed = time.time() - start_time
    print(f"SHT completed in {elapsed:.2f} seconds")
    print(f"Grid shape: {grid.shape}")
    print(f"Value range: [{grid.min():.4f}, {grid.max():.4f}]")
    
    # Grid is in colatitude order (north pole first), we need to flip for plotting
    # Also, longitude starts at 0, we need to shift to center on 0
    n_lat, n_lon = grid.shape
    
    # Shift longitude so 0 is in the center
    grid = np.roll(grid, n_lon // 2, axis=1)
    
    # Flip latitude so south pole is at bottom
    grid = np.flipud(grid)
    
    # Create figure
    fig, ax = plt.subplots(figsize=(14, 7), dpi=150)
    
    # Use a diverging colormap centered at 0
    vmax = max(abs(grid.min()), abs(grid.max()))
    
    # Plot the data
    im = ax.imshow(grid, extent=[-180, 180, -90, 90], origin='lower',
                   cmap='RdBu_r', vmin=-vmax, vmax=vmax, aspect='auto')
    
    # Add colorbar
    plt.colorbar(im, ax=ax, label='Value', shrink=0.8)
    
    # Labels and title
    ax.set_xlabel('Longitude (degrees)')
    ax.set_ylabel('Latitude (degrees)')
    ax.set_title(title)
    
    # Add gridlines
    ax.set_xticks(np.arange(-180, 181, 30))
    ax.set_yticks(np.arange(-90, 91, 30))
    ax.grid(True, alpha=0.3)
    
    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    plt.close()
    
    print(f"Map saved to: {output_path}")
    print(f"Image size: {grid.shape[1]}x{grid.shape[0]} pixels")


def main():
    """Main function to render BSHC file as a map projection."""
    import argparse
    
    parser = argparse.ArgumentParser(description='Render BSHC to map projection using SHT')
    parser.add_argument('--input', '-i', required=True, help='Input BSHC file')
    parser.add_argument('--output', '-o', required=True, help='Output PNG file')
    parser.add_argument('--max-lmax', type=int, default=None, 
                        help='Maximum L to use (default: use all harmonics from file)')
    parser.add_argument('--title', '-t', default=None, help='Plot title')
    args = parser.parse_args()
    
    # Get script directory for relative paths
    script_dir = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.dirname(script_dir)
    
    input_path = os.path.join(repo_root, args.input) if not os.path.isabs(args.input) else args.input
    output_path = os.path.join(repo_root, args.output) if not os.path.isabs(args.output) else args.output
    
    print(f"Loading BSHC file: {input_path}")
    start_time = time.time()
    
    # Use pyshtools' native BSHC reader
    coeffs, lmax_file = pysh.shio.read_bshc(input_path)
    
    elapsed = time.time() - start_time
    print(f"Loaded SH coefficients in {elapsed:.2f} seconds")
    print(f"File contains lmax={lmax_file} ({(lmax_file+1)*(lmax_file+2)//2:,} coefficients per type)")
    print(f"Coeffs shape: {coeffs.shape}")
    
    # Optionally truncate to max_lmax
    if args.max_lmax is not None and args.max_lmax < lmax_file:
        lmax = args.max_lmax
        coeffs = coeffs[:, :lmax+1, :lmax+1]
        print(f"Truncating to lmax={lmax}")
    else:
        lmax = lmax_file
        print(f"Using all harmonics (lmax={lmax})")
    
    # Generate title if not provided
    title = args.title or f"Spherical Harmonics (lmax={lmax})"
    
    # Render the map using efficient SHT
    render_map_projection(coeffs, lmax, output_path, title=title)
    
    print("Done!")


if __name__ == '__main__':
    main()
