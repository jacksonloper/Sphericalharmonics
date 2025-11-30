#!/usr/bin/env python3
"""
Generate compact mesh with elevation AND gradients from BSHC spherical harmonic coefficients.
The gradients (∂f/∂lat, ∂f/∂lon) are computed analytically from the spherical harmonic expansion.

This allows for smooth vertex normals at subdivision 8 (2.5 MB x 3 = 7.5 MB) instead of 
flat shading with subdivision 9 (10 MB).
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


def apply_taper(coeffs, taper_start=50):
    """
    Apply cosine tapering to highest-order coefficients to avoid truncation artifacts.
    """
    lmax = coeffs.lmax
    taper_end = lmax
    taper_begin = max(0, lmax - taper_start)
    
    print(f"  Applying cosine taper from l={taper_begin} to l={taper_end}")
    
    coeffs_array = coeffs.coeffs.copy()
    
    for l in range(taper_begin, taper_end + 1):
        t = (l - taper_begin) / (taper_end - taper_begin) if taper_end > taper_begin else 1.0
        taper_factor = 0.5 * (1 + np.cos(np.pi * t))
        
        for m in range(l + 1):
            coeffs_array[0, l, m] *= taper_factor
            if m > 0:
                coeffs_array[1, l, m] *= taper_factor
    
    return pysh.SHCoeffs.from_array(coeffs_array, normalization=coeffs.normalization, 
                                     csphase=coeffs.csphase, lmax=lmax)


def create_grids_with_gradients(coeffs):
    """
    Create regular grids for elevation and its gradients using fast SHT.
    
    The gradients are computed analytically using pyshtools gradient method:
    - theta: gradient w.r.t. colatitude (radians)
    - phi: gradient w.r.t. longitude (radians)
    
    We convert theta to lat: d_lat = -d_theta (since lat = 90° - colat)
    And phi stays as d_lon.
    
    The gradient values are in meters per radian, which we convert to
    meters per degree for the output.
    
    Returns interpolators for elevation, d_lat, d_lon
    """
    print(f"  Expanding to grid using fast SHT...")
    
    # Get the main elevation grid
    grid = coeffs.expand(grid='DH2', extend=True)
    
    # Compute gradient grids using pyshtools
    # Returns SHGradient with .theta and .phi components
    print(f"  Computing analytical gradient grids...")
    grad = coeffs.gradient(grid='DH2', extend=True)
    
    data = grid.data
    # theta is df/d(colatitude) in meters/radian
    # Since lat = 90 - colat, d_lat = -d_theta
    d_theta_data = grad.theta.data
    d_phi_data = grad.phi.data
    
    # Convert from meters/radian to meters/degree
    # 1 radian = 180/π degrees, so d/d(deg) = d/d(rad) * π/180
    deg_to_rad = np.pi / 180.0
    d_lat_data = -d_theta_data * deg_to_rad  # Negate for lat vs colat, convert units
    d_lon_data = d_phi_data * deg_to_rad
    
    lats = grid.lats()
    lons = grid.lons()
    
    print(f"  Grid shape: {data.shape}")
    print(f"  Elevation range: {data.min():.1f} to {data.max():.1f} m")
    print(f"  d_lat range: {d_lat_data.min():.4f} to {d_lat_data.max():.4f} m/deg")
    print(f"  d_lon range: {d_lon_data.min():.4f} to {d_lon_data.max():.4f} m/deg")
    
    # Create interpolators for all three
    def make_interpolator(data, lats, lons):
        lats_flip = lats[::-1]
        data_flip = data[::-1, :]
        
        if lons[-1] == 360.0:
            lons = lons[:-1]
            data_flip = data_flip[:, :-1]
        
        extend = 5
        lons_ext = np.concatenate([lons[-(extend+1):-1] - 360, lons, lons[1:extend+1] + 360])
        data_ext = np.concatenate([data_flip[:, -(extend+1):-1], data_flip, data_flip[:, 1:extend+1]], axis=1)
        
        return RectBivariateSpline(lats_flip, lons_ext, data_ext, kx=3, ky=3)
    
    interp_elev = make_interpolator(data, lats, lons.copy())
    interp_d_lat = make_interpolator(d_lat_data, lats, lons.copy())
    interp_d_lon = make_interpolator(d_lon_data, lats, lons.copy())
    
    return interp_elev, interp_d_lat, interp_d_lon


def generate_mesh_with_gradients(bshc_path, subdivisions, taper_start=50):
    """
    Generate mesh data with elevation and analytical gradients.
    
    Returns:
        elevation: float32 array
        d_lat: float32 array (gradient w.r.t. latitude in meters/degree)
        d_lon: float32 array (gradient w.r.t. longitude in meters/degree)
    """
    print(f"Loading BSHC from {bshc_path}...")
    coeffs, lmax = pysh.shio.read_bshc(bshc_path)
    sh_coeffs = pysh.SHCoeffs.from_array(coeffs)
    print(f"  Loaded coefficients up to degree {lmax}")
    
    print(f"\nApplying tapering (last {taper_start} degrees)...")
    sh_coeffs_tapered = apply_taper(sh_coeffs, taper_start=taper_start)
    
    print(f"\nCreating grids with gradients via fast SHT...")
    interp_elev, interp_d_lat, interp_d_lon = create_grids_with_gradients(sh_coeffs_tapered)
    
    print(f"\nGenerating icosahedral mesh with {subdivisions} subdivisions...")
    vertices, indices = create_icosahedron()
    
    for i in range(subdivisions):
        vertices, indices = subdivide_mesh(vertices, indices)
        print(f"  Subdivision {i + 1}: {len(vertices):,} vertices")
    
    print(f"\nConverting {len(vertices):,} vertices to lat/lon...")
    x, y, z = vertices[:, 0], vertices[:, 1], vertices[:, 2]
    
    lat = np.degrees(np.arcsin(np.clip(z, -1, 1)))
    lon = np.degrees(np.arctan2(y, x))
    lon[lon < 0] += 360
    
    print(f"\nInterpolating elevation and gradients at {len(vertices):,} points...")
    elevation = interp_elev.ev(lat, lon)
    d_lat = interp_d_lat.ev(lat, lon)
    d_lon = interp_d_lon.ev(lat, lon)
    
    print(f"\n  Elevation range: {elevation.min():.1f} to {elevation.max():.1f} m")
    print(f"  d_lat range: {d_lat.min():.4f} to {d_lat.max():.4f}")
    print(f"  d_lon range: {d_lon.min():.4f} to {d_lon.max():.4f}")
    
    return elevation.astype(np.float32), d_lat.astype(np.float32), d_lon.astype(np.float32)


def export_mesh_with_gradients(elevation, d_lat, d_lon, subdivisions, output_path):
    """
    Export compact format with elevation + gradients.
    Format: 'HPGRAD' + subdivisions (1 byte) + elevation[] + d_lat[] + d_lon[]
    """
    num_vertices = len(elevation)

    with open(output_path, 'wb') as f:
        # Header - 'HPGRAD' for gradient-enabled format
        f.write(b'HPGRAD')

        # Subdivision level
        f.write(struct.pack('<B', subdivisions))

        # Elevation data
        f.write(elevation.tobytes())
        
        # Gradient data (d_lat, d_lon)
        f.write(d_lat.tobytes())
        f.write(d_lon.tobytes())

    size_kb = (7 + num_vertices * 4 * 3) / 1024

    print(f"\nSaved to: {output_path}")
    print(f"  Vertices: {num_vertices:,}")
    print(f"  File size: {size_kb:.1f} KB ({size_kb/1024:.2f} MB)")
    print(f"  (3x data: elevation + 2 gradient channels)")


def main():
    subdivisions = int(sys.argv[1]) if len(sys.argv) > 1 else 8
    taper_start = int(sys.argv[2]) if len(sys.argv) > 2 else 50
    
    script_dir = os.path.dirname(os.path.abspath(__file__))
    bshc_path = os.path.join(script_dir, 'sur.bshc')
    
    elevation, d_lat, d_lon = generate_mesh_with_gradients(bshc_path, subdivisions, taper_start)
    
    output_path = os.path.join(script_dir, f'sur_gradient{subdivisions}.bin')
    export_mesh_with_gradients(elevation, d_lat, d_lon, subdivisions, output_path)


if __name__ == '__main__':
    main()
