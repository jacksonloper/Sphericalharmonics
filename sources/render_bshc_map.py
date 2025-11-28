#!/usr/bin/env python3
"""
Render spherical harmonic coefficients from a .bshc file to a 2D map projection.

This script renders the SH data using an equirectangular (plate carrée) projection
with a colormap to visualize the values. This is useful for verifying the correct
interpretation of the BSHC file format.

Output: PNG image with colorbar.
"""

import numpy as np
from scipy.special import sph_harm_y
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import os


def load_bshc(filepath):
    """
    Load spherical harmonic coefficients from a binary .bshc file.
    
    BSHC format (as used by SHTOOLS/Curtin University):
    - File is composed of 8-byte little-endian floats
    - First two values: min_degree, max_degree (lmax)
    - Then cosine coefficients: C(0,0), C(1,0), C(1,1), C(2,0), C(2,1), ... C(lmax,lmax)
    - Then sine coefficients: S(0,0), S(1,0), S(1,1), S(2,0), S(2,1), ... S(lmax,lmax)
    
    Args:
        filepath: Path to .bshc file
    
    Returns:
        lmax: Maximum spherical harmonic degree
        cosine_coeffs: 2D array of cosine coefficients, shape (lmax+1, lmax+1)
                       cosine_coeffs[l, m] = C(l, m)
        sine_coeffs: 2D array of sine coefficients, shape (lmax+1, lmax+1)
                     sine_coeffs[l, m] = S(l, m)
    """
    with open(filepath, 'rb') as f:
        data = f.read()
    
    arr = np.frombuffer(data, dtype='<f8')  # little-endian float64
    
    # First two values are min_degree and max_degree
    min_deg = int(arr[0])
    max_deg = int(arr[1])
    lmax = max_deg
    
    print(f"BSHC file header: min_degree={min_deg}, max_degree={max_deg}")
    
    # Number of coefficients for each type (cosine or sine)
    # For degrees 0 to lmax, we have: sum_{l=0}^{lmax} (l+1) = (lmax+1)(lmax+2)/2
    n_coeffs = (lmax + 1) * (lmax + 2) // 2
    
    print(f"Expected {n_coeffs} cosine coefficients and {n_coeffs} sine coefficients")
    print(f"Total file values: {len(arr)}, Expected: {2 + 2*n_coeffs}")
    
    # Extract cosine and sine coefficients
    cosine_flat = arr[2:2 + n_coeffs]
    sine_flat = arr[2 + n_coeffs:2 + 2 * n_coeffs]
    
    # Create 2D arrays indexed by [l, m]
    cosine_coeffs = np.zeros((lmax + 1, lmax + 1), dtype=np.float64)
    sine_coeffs = np.zeros((lmax + 1, lmax + 1), dtype=np.float64)
    
    # Fill in the coefficients
    # Order in file: C(0,0), C(1,0), C(1,1), C(2,0), C(2,1), C(2,2), ...
    idx = 0
    for l in range(lmax + 1):
        for m in range(l + 1):
            cosine_coeffs[l, m] = cosine_flat[idx]
            sine_coeffs[l, m] = sine_flat[idx]
            idx += 1
    
    return lmax, cosine_coeffs, sine_coeffs


def evaluate_real_spherical_harmonics(cosine_coeffs, sine_coeffs, theta, phi, max_lmax=None):
    """
    Evaluate real spherical harmonics at given angles using cosine/sine coefficients.
    
    Real SH expansion: f(θ, φ) = Σ_{l,m} [C(l,m) * Y_l^m_c(θ, φ) + S(l,m) * Y_l^m_s(θ, φ)]
    
    Args:
        cosine_coeffs: 2D array of cosine coefficients [l, m]
        sine_coeffs: 2D array of sine coefficients [l, m]
        theta: Polar angle (0 to pi) - array
        phi: Azimuthal angle (0 to 2*pi) - array
        max_lmax: Maximum l to use (if None, use all available)
    
    Returns:
        values: SH function values at each direction
    """
    lmax = cosine_coeffs.shape[0] - 1
    if max_lmax is not None:
        lmax = min(lmax, max_lmax)
    
    values = np.zeros_like(theta)
    
    for l in range(lmax + 1):
        for m in range(l + 1):
            c_lm = cosine_coeffs[l, m]
            s_lm = sine_coeffs[l, m]
            
            # Skip if both coefficients are negligible
            if abs(c_lm) < 1e-15 and abs(s_lm) < 1e-15:
                continue
            
            # scipy's sph_harm_y(l, m, theta, phi) returns the complex SH Y_l^m
            Y_complex = sph_harm_y(l, m, theta, phi)
            
            if m == 0:
                # For m=0, Y_l^0 is already real
                Y_real_c = np.real(Y_complex)
                values += c_lm * Y_real_c
            else:
                # For m > 0, real SH are combinations of complex SH.
                # The sqrt(2) factor accounts for normalization.
                Y_real_c = np.sqrt(2) * np.real(Y_complex)  # cos(m*phi) component
                Y_real_s = np.sqrt(2) * np.imag(Y_complex)  # sin(m*phi) component
                
                values += c_lm * Y_real_c + s_lm * Y_real_s
    
    return values


def render_map_projection(cosine_coeffs, sine_coeffs, output_path, max_lmax=None, 
                          resolution=360, title="Spherical Harmonics Map"):
    """
    Render SH coefficients as a 2D equirectangular map projection.
    
    Args:
        cosine_coeffs: 2D array of cosine coefficients
        sine_coeffs: 2D array of sine coefficients
        output_path: Path to save PNG
        max_lmax: Maximum l to use for evaluation
        resolution: Number of longitude points (latitude will be resolution/2)
        title: Plot title
    """
    # Create grid of lat/lon coordinates
    n_lon = resolution
    n_lat = resolution // 2
    
    # Longitude: -180 to 180 degrees -> phi: 0 to 2*pi
    lon = np.linspace(-180, 180, n_lon)
    # Latitude: -90 to 90 degrees -> theta: pi to 0 (note: reversed for theta)
    lat = np.linspace(-90, 90, n_lat)
    
    lon_grid, lat_grid = np.meshgrid(lon, lat)
    
    # Convert to spherical coordinates (theta, phi)
    # theta: colatitude (0 at north pole, pi at south pole)
    # phi: azimuthal angle (0 to 2*pi)
    theta = np.deg2rad(90 - lat_grid)  # Convert latitude to colatitude
    phi = np.deg2rad(lon_grid)
    phi = np.where(phi < 0, phi + 2*np.pi, phi)  # Ensure phi is in [0, 2*pi]
    
    # Evaluate SH at each grid point
    print(f"Evaluating SH on {n_lon}x{n_lat} grid...")
    values = evaluate_real_spherical_harmonics(cosine_coeffs, sine_coeffs, 
                                               theta.flatten(), phi.flatten(), 
                                               max_lmax=max_lmax)
    values = values.reshape((n_lat, n_lon))
    
    print(f"Value range: [{values.min():.4f}, {values.max():.4f}]")
    
    # Create figure
    fig, ax = plt.subplots(figsize=(14, 7), dpi=150)
    
    # Use a diverging colormap centered at 0
    vmax = max(abs(values.min()), abs(values.max()))
    
    # Plot the data
    im = ax.imshow(values, extent=[-180, 180, -90, 90], origin='lower',
                   cmap='RdBu_r', vmin=-vmax, vmax=vmax, aspect='auto')
    
    # Add colorbar
    cbar = plt.colorbar(im, ax=ax, label='Value', shrink=0.8)
    
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


def main():
    """Main function to render BSHC file as a map projection."""
    import argparse
    
    parser = argparse.ArgumentParser(description='Render BSHC to map projection')
    parser.add_argument('--input', '-i', required=True, help='Input BSHC file')
    parser.add_argument('--output', '-o', required=True, help='Output PNG file')
    parser.add_argument('--max-lmax', type=int, default=50, help='Maximum L to use for SH evaluation (default: 50)')
    parser.add_argument('--resolution', type=int, default=720, help='Longitude resolution (default: 720)')
    parser.add_argument('--title', '-t', default=None, help='Plot title')
    args = parser.parse_args()
    
    # Get script directory for relative paths
    script_dir = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.dirname(script_dir)
    
    input_path = os.path.join(repo_root, args.input) if not os.path.isabs(args.input) else args.input
    output_path = os.path.join(repo_root, args.output) if not os.path.isabs(args.output) else args.output
    
    print(f"Loading BSHC file: {input_path}")
    lmax, cosine_coeffs, sine_coeffs = load_bshc(input_path)
    print(f"Loaded SH coefficients up to lmax={lmax}")
    print(f"Cosine coeff range: [{cosine_coeffs.min():.4f}, {cosine_coeffs.max():.4f}]")
    print(f"Sine coeff range: [{sine_coeffs.min():.4f}, {sine_coeffs.max():.4f}]")
    
    # Generate title if not provided
    title = args.title or f"Spherical Harmonics (lmax={min(lmax, args.max_lmax)})"
    
    # Render the map
    render_map_projection(cosine_coeffs, sine_coeffs, output_path, 
                         max_lmax=args.max_lmax, resolution=args.resolution, title=title)
    
    print("Done!")


if __name__ == '__main__':
    main()
