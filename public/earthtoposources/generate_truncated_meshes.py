#!/usr/bin/env python3
"""
Generate compact elevation-only mesh files at different spherical harmonic truncation levels.
Uses cosine apodization to avoid Gibbs ringing artifacts at cutoff frequencies.

Generates meshes for user-selectable lmax values to demonstrate harmonic approximations.
Lower lmax = lower resolution approximation, fewer vertices needed (smaller files).
Higher lmax = more detail, more vertices needed (larger files).
"""

import numpy as np
import struct
import sys
import os
import pyshtools as pysh
from scipy.interpolate import RectBivariateSpline


def create_icosahedron():
    """Create base icosahedron mesh"""
    t = (1 + np.sqrt(5)) / 2
    vertices = np.array([
        [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
        [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
        [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]
    ], dtype=np.float64)

    norms = np.linalg.norm(vertices, axis=1, keepdims=True)
    vertices = vertices / norms

    indices = np.array([
        0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11,
        1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
        3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9,
        4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1
    ], dtype=np.uint32)

    return vertices, indices


def subdivide_mesh(vertices, indices):
    """Subdivide mesh by splitting each triangle into 4"""
    midpoint_cache = {}

    def get_midpoint(i1, i2):
        key = (min(i1, i2), max(i1, i2))
        if key in midpoint_cache:
            return midpoint_cache[key]

        v1, v2 = vertices[i1], vertices[i2]
        mid = (v1 + v2) / 2
        mid = mid / np.linalg.norm(mid)

        idx = len(vertices)
        vertices.append(mid)
        midpoint_cache[key] = idx
        return idx

    vertices = list(vertices)
    new_indices = []

    for i in range(0, len(indices), 3):
        v1, v2, v3 = indices[i], indices[i + 1], indices[i + 2]
        a = get_midpoint(v1, v2)
        b = get_midpoint(v2, v3)
        c = get_midpoint(v3, v1)
        new_indices.extend([v1, a, c, v2, b, a, v3, c, b, a, b, c])

    return np.array(vertices, dtype=np.float64), np.array(new_indices, dtype=np.uint32)


def truncate_and_apodize(coeffs, target_lmax, taper_width=None):
    """
    Truncate spherical harmonic coefficients to target_lmax and apply cosine apodization.
    
    Args:
        coeffs: pyshtools SHCoeffs object (original full resolution)
        target_lmax: Maximum degree to keep
        taper_width: Width of the cosine taper (defaults to 20% of lmax, min 2)
    
    Returns:
        Tapered and truncated SHCoeffs
    """
    if taper_width is None:
        # Default taper width: 20% of lmax, but at least 2 degrees
        taper_width = max(2, int(target_lmax * 0.2))
    
    # Truncate coefficients to target_lmax
    # Get coefficient array and slice it
    original_array = coeffs.coeffs
    truncated_array = np.zeros((2, target_lmax + 1, target_lmax + 1), dtype=original_array.dtype)
    
    for l in range(min(target_lmax + 1, original_array.shape[1])):
        for m in range(min(l + 1, original_array.shape[2])):
            truncated_array[0, l, m] = original_array[0, l, m]
            if m > 0:
                truncated_array[1, l, m] = original_array[1, l, m]
    
    # Apply cosine taper to the highest degrees
    taper_begin = max(0, target_lmax - taper_width)
    taper_end = target_lmax
    
    print(f"  Truncating to lmax={target_lmax}, applying cosine taper from l={taper_begin} to l={taper_end}")
    
    for l in range(taper_begin, taper_end + 1):
        # Cosine taper: goes from 1 at taper_begin to 0 at taper_end
        t = (l - taper_begin) / (taper_end - taper_begin) if taper_end > taper_begin else 1.0
        taper_factor = 0.5 * (1 + np.cos(np.pi * t))
        
        for m in range(l + 1):
            truncated_array[0, l, m] *= taper_factor
            if m > 0:
                truncated_array[1, l, m] *= taper_factor
    
    return pysh.SHCoeffs.from_array(truncated_array, normalization=coeffs.normalization, 
                                     csphase=coeffs.csphase, lmax=target_lmax)


def create_grid_and_interpolator(coeffs):
    """
    Create a regular grid from spherical harmonics and return an interpolator.
    Uses fast SHT expansion to grid, then bivariate spline interpolation.
    """
    # Expand to a regular grid - pyshtools uses Driscoll-Healy grid
    grid = coeffs.expand(grid='DH2', extend=True)
    
    data = grid.data
    lats = grid.lats()
    lons = grid.lons()
    
    # Flip lats for interpolator (needs increasing order)
    lats_flip = lats[::-1]
    data_flip = data[::-1, :]
    
    # Handle longitude wrap
    if lons[-1] == 360.0:
        lons = lons[:-1]
        data_flip = data_flip[:, :-1]
    
    # Extend for smooth wrap-around interpolation
    extend = 5
    lons_ext = np.concatenate([lons[-(extend+1):-1] - 360, lons, lons[1:extend+1] + 360])
    data_ext = np.concatenate([data_flip[:, -(extend+1):-1], data_flip, data_flip[:, 1:extend+1]], axis=1)
    
    interpolator = RectBivariateSpline(lats_flip, lons_ext, data_ext, kx=3, ky=3)
    
    return interpolator


def generate_mesh_vertices(subdivisions):
    """Generate icosahedral mesh vertices at given subdivision level."""
    vertices, indices = create_icosahedron()
    
    for i in range(subdivisions):
        vertices, indices = subdivide_mesh(vertices, indices)
    
    return vertices


def evaluate_elevation(interpolator, vertices):
    """Evaluate elevation at mesh vertices using interpolation."""
    x, y, z = vertices[:, 0], vertices[:, 1], vertices[:, 2]
    
    # Convert to lat/lon
    lat = np.degrees(np.arcsin(np.clip(z, -1, 1)))
    lon = np.degrees(np.arctan2(y, x))
    lon[lon < 0] += 360
    
    # Evaluate
    return interpolator.ev(lat, lon % 360)


def export_compact_mesh(elevation, subdivisions, output_path):
    """Export compact format: header + subdivision level + elevation data."""
    num_vertices = len(elevation)

    with open(output_path, 'wb') as f:
        f.write(b'HPELEV')
        f.write(struct.pack('<B', subdivisions))
        f.write(elevation.astype(np.float32).tobytes())

    size_kb = (7 + num_vertices * 4) / 1024
    print(f"  Saved: {output_path} ({size_kb:.1f} KB, {num_vertices:,} vertices)")


def icosahedral_vertices(s):
    """
    Calculate number of vertices for an icosahedral mesh at subdivision level s.
    
    Formula: N = 10 * 4^s + 2
    
    This comes from the icosahedron subdivision process:
    - Base icosahedron has 12 vertices and 20 faces
    - Each subdivision splits each triangle into 4, quadrupling the face count
    - The vertex count follows: V = 10 * 4^s + 2 (derived from Euler's formula)
    
    Examples:
    - s=0: 12 vertices (base icosahedron)
    - s=1: 42 vertices
    - s=2: 162 vertices
    - s=9: 2,621,442 vertices
    """
    return 10 * (4 ** s) + 2


def subdivision_for_lmax(lmax):
    """
    Determine minimum subdivision level needed to represent lmax harmonics.
    Based on Nyquist: need approximately sqrt(N_vertices) / 2 >= lmax
    """
    for s in range(12):
        n_verts = icosahedral_vertices(s)
        max_representable = int(np.sqrt(n_verts) / 2)
        if max_representable >= lmax:
            return s
    return 11  # Maximum


# Define the truncation levels to generate
# Each entry: (lmax, description)
TRUNCATION_LEVELS = [
    (4, "Very low - basic shape"),
    (8, "Low - major features"),
    (16, "Medium-low - continental shapes"),
    (32, "Medium - mountain ranges visible"),
    (64, "Higher - regional detail"),
    (128, "High - significant detail"),
    (360, "Very high - fine detail"),
    # Note: lmax=2160 uses the existing sur_compact9.bin file
]


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    bshc_path = os.path.join(script_dir, 'sur.bshc')
    
    # Check if BSHC file exists
    if not os.path.exists(bshc_path):
        print(f"Error: BSHC file not found at {bshc_path}")
        print("Please download sur.bshc from Earth2014 model:")
        print("https://ddfe.curtin.edu.au/gravitymodels/Earth2014/data_5min/shcs_to2160/")
        sys.exit(1)
    
    print(f"Loading BSHC from {bshc_path}...")
    coeffs, original_lmax = pysh.shio.read_bshc(bshc_path)
    sh_coeffs = pysh.SHCoeffs.from_array(coeffs)
    print(f"  Loaded coefficients up to degree {original_lmax}")
    
    # Generate only the specified lmax if provided as argument
    if len(sys.argv) > 1:
        target_lmax = int(sys.argv[1])
        levels_to_generate = [(target_lmax, "user specified")]
    else:
        levels_to_generate = TRUNCATION_LEVELS
    
    print(f"\nGenerating {len(levels_to_generate)} truncation levels...")
    
    for lmax, description in levels_to_generate:
        print(f"\n{'='*60}")
        print(f"Generating lmax={lmax}: {description}")
        print(f"{'='*60}")
        
        # Determine subdivision level
        subdiv = subdivision_for_lmax(lmax)
        n_verts = icosahedral_vertices(subdiv)
        print(f"  Subdivision level: {subdiv} ({n_verts:,} vertices)")
        
        # Truncate and apodize
        truncated_coeffs = truncate_and_apodize(sh_coeffs, lmax)
        
        # Create interpolator
        print(f"  Creating elevation grid via fast SHT...")
        interpolator = create_grid_and_interpolator(truncated_coeffs)
        
        # Generate mesh vertices
        print(f"  Generating icosahedral mesh...")
        vertices = generate_mesh_vertices(subdiv)
        
        # Evaluate elevation
        print(f"  Interpolating elevation at {len(vertices):,} points...")
        elevation = evaluate_elevation(interpolator, vertices)
        print(f"  Elevation range: {elevation.min():.1f} to {elevation.max():.1f} m")
        
        # Export
        output_path = os.path.join(script_dir, f'sur_lmax{lmax}.bin')
        export_compact_mesh(elevation, subdiv, output_path)
    
    print(f"\n{'='*60}")
    print("All truncation levels generated successfully!")
    print(f"{'='*60}")


if __name__ == '__main__':
    main()
