#!/usr/bin/env python3
"""
Generate compact elevation-only mesh directly from BSHC spherical harmonic coefficients
Uses fast spherical harmonic transforms via pyshtools with grid expansion + interpolation
Applies tapering/apodization to highest-order coefficients to avoid truncation artifacts
"""

import numpy as np
import struct
import sys
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


def apply_taper(coeffs, taper_start=50):
    """
    Apply cosine tapering to highest-order coefficients to avoid truncation artifacts.
    
    Args:
        coeffs: pyshtools SHCoeffs object
        taper_start: Start tapering this many degrees from the end
    
    Returns:
        Tapered coefficients
    """
    lmax = coeffs.lmax
    taper_end = lmax
    taper_begin = max(0, lmax - taper_start)
    
    print(f"  Applying cosine taper from l={taper_begin} to l={taper_end}")
    
    # Get the coefficient array
    coeffs_array = coeffs.coeffs.copy()
    
    # Apply cosine taper to each degree in the taper range
    for l in range(taper_begin, taper_end + 1):
        # Cosine taper: goes from 1 at taper_begin to 0 at taper_end
        t = (l - taper_begin) / (taper_end - taper_begin) if taper_end > taper_begin else 1.0
        taper_factor = 0.5 * (1 + np.cos(np.pi * t))
        
        # Apply to all m values for this l
        for m in range(l + 1):
            coeffs_array[0, l, m] *= taper_factor  # Cosine coefficients
            if m > 0:
                coeffs_array[1, l, m] *= taper_factor  # Sine coefficients
    
    # Create new SHCoeffs with tapered values
    return pysh.SHCoeffs.from_array(coeffs_array, normalization=coeffs.normalization, 
                                     csphase=coeffs.csphase, lmax=lmax)


def create_grid_and_interpolator(coeffs, grid_size=4096):
    """
    Create a regular grid from spherical harmonics and return an interpolator.
    Uses fast SHT expansion to grid, then bivariate spline interpolation.
    
    Args:
        coeffs: pyshtools SHCoeffs object
        grid_size: Number of grid points in latitude (longitude will be 2x)
    
    Returns:
        Interpolator function that takes (lat_deg, lon_deg) arrays
    """
    print(f"  Expanding to grid using fast SHT...")
    
    # Expand to a regular grid - pyshtools uses Driscoll-Healy grid
    # extend=True gives us both poles
    grid = coeffs.expand(grid='DH2', extend=True)
    
    # Get the grid data and coordinates
    data = grid.data
    lats = grid.lats()  # Latitude in degrees, from 90 to -90
    lons = grid.lons()  # Longitude in degrees, from 0 to 360
    
    print(f"  Grid shape: {data.shape}")
    print(f"  Lat range: {lats.min():.2f} to {lats.max():.2f}")
    print(f"  Lon range: {lons.min():.2f} to {lons.max():.2f}")
    print(f"  Grid elevation range: {data.min():.1f} to {data.max():.1f} m")
    
    # Create interpolator
    # Note: RectBivariateSpline needs strictly monotonically increasing coordinates
    # lats are decreasing (90 to -90), so we flip
    lats_flip = lats[::-1]  # Now -90 to 90, strictly increasing
    data_flip = data[::-1, :]
    
    # Handle longitude: lons go from 0 to 360 inclusive, which creates wrap issues
    # Remove the last point if it equals 360 (same as 0)
    if lons[-1] == 360.0:
        lons = lons[:-1]
        data_flip = data_flip[:, :-1]
    
    # Handle longitude wrap-around by extending the grid
    # Extend by a few points on each side for smooth interpolation (excluding boundary points)
    extend = 5
    # Use indices to avoid boundary overlap
    lons_ext = np.concatenate([lons[-(extend+1):-1] - 360, lons, lons[1:extend+1] + 360])
    data_ext = np.concatenate([data_flip[:, -(extend+1):-1], data_flip, data_flip[:, 1:extend+1]], axis=1)
    
    print(f"  Extended lons range: {lons_ext.min():.2f} to {lons_ext.max():.2f}")
    print(f"  Creating bivariate spline interpolator...")
    interpolator = RectBivariateSpline(lats_flip, lons_ext, data_ext, kx=3, ky=3)
    
    return interpolator, lats_flip, lons_ext


def evaluate_with_interpolation(interpolator, lat, lon):
    """
    Evaluate elevation at arbitrary points using interpolation.
    
    Args:
        interpolator: RectBivariateSpline interpolator
        lat: Latitude in degrees (array)
        lon: Longitude in degrees (array), 0-360
    
    Returns:
        Elevation values
    """
    # Ensure lon is in range for interpolator
    lon = lon % 360
    
    # Evaluate using the spline interpolator
    # Use ev() for evaluating at arbitrary points (not grid)
    return interpolator.ev(lat, lon)


def generate_elevation_from_bshc(bshc_path, subdivisions, taper_start=50):
    """
    Generate elevation data by evaluating BSHC spherical harmonics at mesh vertices.
    Uses fast SHT grid expansion + interpolation for efficiency.
    
    Args:
        bshc_path: Path to BSHC file
        subdivisions: Number of mesh subdivisions
        taper_start: Start tapering this many degrees from end
    
    Returns:
        Elevation array for mesh vertices
    """
    print(f"Loading BSHC from {bshc_path}...")
    coeffs, lmax = pysh.shio.read_bshc(bshc_path)
    sh_coeffs = pysh.SHCoeffs.from_array(coeffs)
    print(f"  Loaded coefficients up to degree {lmax}")
    print(f"  Original coefficient range: {coeffs.min():.2f} to {coeffs.max():.2f}")
    
    # Apply tapering to avoid truncation artifacts
    print(f"\nApplying tapering (last {taper_start} degrees)...")
    sh_coeffs_tapered = apply_taper(sh_coeffs, taper_start=taper_start)
    
    # Create grid and interpolator using fast SHT
    print(f"\nCreating elevation grid via fast SHT...")
    interpolator, lats, lons = create_grid_and_interpolator(sh_coeffs_tapered)
    
    # Generate icosahedral mesh
    print(f"\nGenerating icosahedral mesh with {subdivisions} subdivisions...")
    vertices, indices = create_icosahedron()
    
    for i in range(subdivisions):
        vertices, indices = subdivide_mesh(vertices, indices)
        print(f"  Subdivision {i + 1}: {len(vertices):,} vertices")
    
    # Convert Cartesian to spherical coordinates (latitude/longitude)
    print(f"\nConverting {len(vertices):,} vertices to lat/lon...")
    x, y, z = vertices[:, 0], vertices[:, 1], vertices[:, 2]
    
    # Latitude from z coordinate: lat = arcsin(z) in degrees
    lat = np.degrees(np.arcsin(np.clip(z, -1, 1)))
    
    # Longitude from x,y: lon = atan2(y, x) in degrees [0, 360)
    lon = np.degrees(np.arctan2(y, x))
    lon[lon < 0] += 360
    
    # Evaluate via interpolation
    print(f"\nInterpolating elevation at {len(vertices):,} points...")
    elevation = evaluate_with_interpolation(interpolator, lat, lon)
    
    print(f"\n  Elevation range: {elevation.min():.1f} to {elevation.max():.1f} m")
    
    return elevation.astype(np.float32)


def export_compact_mesh(elevation, subdivisions, output_path):
    """Export compact format: just elevation data + subdivision level"""
    num_vertices = len(elevation)

    with open(output_path, 'wb') as f:
        # Header
        f.write(b'HPELEV')

        # Subdivision level
        f.write(struct.pack('<B', subdivisions))

        # Elevation data
        f.write(elevation.tobytes())

    size_kb = (7 + num_vertices * 4) / 1024

    print(f"\nSaved to: {output_path}")
    print(f"  Vertices: {num_vertices:,}")
    print(f"  File size: {size_kb:.1f} KB")


def main():
    subdivisions = int(sys.argv[1]) if len(sys.argv) > 1 else 9
    taper_start = int(sys.argv[2]) if len(sys.argv) > 2 else 50
    
    bshc_path = 'public/earthtoposources/sur.bshc'
    
    elevation = generate_elevation_from_bshc(bshc_path, subdivisions, taper_start)
    
    output_path = f'public/earthtoposources/sur_compact{subdivisions}.bin'
    export_compact_mesh(elevation, subdivisions, output_path)


if __name__ == '__main__':
    main()
