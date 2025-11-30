#!/usr/bin/env python3
"""
Generate contour polygons from BSHC spherical harmonic coefficients.
Extracts contours at 30 elevation levels and stores as space-efficient binary format.
"""

import numpy as np
import struct
import sys
import os
import pyshtools as pysh
from scipy.interpolate import RectBivariateSpline
import matplotlib.pyplot as plt
from matplotlib import path as mpath


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


def create_elevation_grid(bshc_path, taper_start=50):
    """
    Create a regular grid of elevation values from BSHC file.
    Returns the grid data and lat/lon coordinates.
    """
    print(f"Loading BSHC from {bshc_path}...")
    coeffs, lmax = pysh.shio.read_bshc(bshc_path)
    sh_coeffs = pysh.SHCoeffs.from_array(coeffs)
    print(f"  Loaded coefficients up to degree {lmax}")
    
    print(f"\nApplying tapering (last {taper_start} degrees)...")
    sh_coeffs_tapered = apply_taper(sh_coeffs, taper_start=taper_start)
    
    print(f"\nExpanding to grid using fast SHT...")
    grid = sh_coeffs_tapered.expand(grid='DH2', extend=True)
    
    data = grid.data
    lats = grid.lats()
    lons = grid.lons()
    
    print(f"  Grid shape: {data.shape}")
    print(f"  Elevation range: {data.min():.1f} to {data.max():.1f} m")
    
    return data, lats, lons


def simplify_polygon(vertices, tolerance=0.5):
    """
    Simplify polygon using Douglas-Peucker algorithm.
    tolerance is in degrees of lat/lon.
    """
    if len(vertices) < 3:
        return vertices
    
    # Use matplotlib's path simplify
    codes = [mpath.Path.MOVETO] + [mpath.Path.LINETO] * (len(vertices) - 1)
    path = mpath.Path(vertices, codes)
    simplified = path.cleaned(simplify=True)
    return simplified.vertices[:-1]  # Remove closing duplicate


def downsample_polygon(vertices, max_vertices=500):
    """
    Downsample a polygon to have at most max_vertices by taking every Nth point.
    """
    if len(vertices) <= max_vertices:
        return vertices
    
    # Calculate step size
    step = len(vertices) / max_vertices
    indices = np.round(np.arange(0, len(vertices), step)).astype(int)
    indices = np.unique(np.clip(indices, 0, len(vertices) - 1))
    
    return vertices[indices]


def extract_contours(data, lats, lons, num_levels=30, min_polygon_area=10.0, simplify_tolerance=0.3, max_vertices=500):
    """
    Extract contour polygons from elevation grid.
    
    Args:
        data: 2D elevation array
        lats: latitude values (decreasing, 90 to -90)
        lons: longitude values (0 to 360)
        num_levels: number of contour levels
        min_polygon_area: minimum polygon area in square degrees
        simplify_tolerance: tolerance for polygon simplification in degrees
    
    Returns:
        List of (level_value, polygons) tuples where polygons is a list of (lat, lon) arrays
    """
    # Handle longitude wrap - extend data
    if lons[-1] == 360.0:
        lons = lons[:-1]
        data = data[:, :-1]
    
    # Determine contour levels with special handling for sea level:
    # 1. One level below zero (for ocean depths)
    # 2. One level at zero (sea level)
    # 3. Equally spaced levels from 0 to max
    vmin, vmax = data.min(), data.max()
    
    # Create levels: one below-zero level, zero, then (num_levels - 2) levels from 0 to max
    below_zero_level = vmin / 2  # Midpoint of ocean depths
    zero_level = 0.0
    above_zero_levels = np.linspace(0, vmax, num_levels - 1)[1:]  # Skip 0, already included
    
    levels = np.concatenate([[below_zero_level, zero_level], above_zero_levels])
    
    print(f"\nExtracting {len(levels)} contour levels from {vmin:.0f}m to {vmax:.0f}m...")
    print(f"  Below zero: {below_zero_level:.0f}m")
    print(f"  Sea level: {zero_level:.0f}m")
    print(f"  Above zero: {above_zero_levels[0]:.0f}m to {above_zero_levels[-1]:.0f}m ({len(above_zero_levels)} levels)")
    
    # Create figure for contour extraction (we don't display it)
    fig, ax = plt.subplots(figsize=(10, 5))
    
    # Create meshgrid for contour
    LON, LAT = np.meshgrid(lons, lats)
    
    # Extract contours
    contour_set = ax.contour(LON, LAT, data, levels=levels)
    plt.close(fig)
    
    result = []
    total_polygons = 0
    total_vertices = 0
    
    # Get all paths organized by level
    # In newer matplotlib, use allsegs instead of collections
    for i, level in enumerate(levels):
        # Get segments for this level using allsegs (works in newer matplotlib)
        segments = contour_set.allsegs[i]
        
        level_polygons = []
        for vertices in segments:
            vertices = np.array(vertices)
            
            # Skip very small polygons (by bounding box area)
            if len(vertices) < 4:
                continue
            
            lon_range = vertices[:, 0].max() - vertices[:, 0].min()
            lat_range = vertices[:, 1].max() - vertices[:, 1].min()
            area = lon_range * lat_range
            
            if area < min_polygon_area:
                continue
            
            # Simplify polygon
            simplified = simplify_polygon(vertices, simplify_tolerance)
            
            # Downsample if still too large
            if len(simplified) > max_vertices:
                simplified = downsample_polygon(simplified, max_vertices)
            
            if len(simplified) >= 3:
                # Store as (lon, lat) pairs - will convert to 3D later
                level_polygons.append(simplified.astype(np.float32))
                total_vertices += len(simplified)
        
        if level_polygons:
            result.append((float(level), level_polygons))
            total_polygons += len(level_polygons)
            print(f"  Level {i+1}/{num_levels} ({level:.0f}m): {len(level_polygons)} polygons")
    
    print(f"\nTotal: {total_polygons} polygons, {total_vertices} vertices")
    
    return result


def export_contours(contour_data, output_path):
    """
    Export contours in space-efficient binary format.
    
    Format:
        Header: 'CONTOUR' (7 bytes)
        num_levels: uint16
        For each level:
            elevation: float32
            num_polygons: uint32
            For each polygon:
                num_vertices: uint32
                vertices: float32[num_vertices * 2] (lon, lat pairs)
    """
    with open(output_path, 'wb') as f:
        # Header
        f.write(b'CONTOUR')
        
        # Number of levels
        f.write(struct.pack('<H', len(contour_data)))
        
        total_verts = 0
        for elevation, polygons in contour_data:
            # Elevation value
            f.write(struct.pack('<f', elevation))
            
            # Number of polygons at this level (use uint32)
            f.write(struct.pack('<I', len(polygons)))
            
            for vertices in polygons:
                # Number of vertices (use uint32)
                f.write(struct.pack('<I', len(vertices)))
                total_verts += len(vertices)
                
                # Vertices as float32 (lon, lat pairs)
                f.write(vertices.tobytes())
    
    size_kb = os.path.getsize(output_path) / 1024
    print(f"\nSaved to: {output_path}")
    print(f"  File size: {size_kb:.1f} KB")
    print(f"  Total vertices: {total_verts:,}")


def main():
    num_levels = int(sys.argv[1]) if len(sys.argv) > 1 else 30
    taper_start = int(sys.argv[2]) if len(sys.argv) > 2 else 50
    min_area = float(sys.argv[3]) if len(sys.argv) > 3 else 5.0
    simplify_tol = float(sys.argv[4]) if len(sys.argv) > 4 else 0.2
    max_verts = int(sys.argv[5]) if len(sys.argv) > 5 else 500
    
    script_dir = os.path.dirname(os.path.abspath(__file__))
    bshc_path = os.path.join(script_dir, 'sur.bshc')
    
    # Create elevation grid
    data, lats, lons = create_elevation_grid(bshc_path, taper_start)
    
    # Extract contours
    contour_data = extract_contours(data, lats, lons, 
                                    num_levels=num_levels,
                                    min_polygon_area=min_area,
                                    simplify_tolerance=simplify_tol,
                                    max_vertices=max_verts)
    
    # Export
    output_path = os.path.join(script_dir, f'sur_contours_{num_levels}.bin')
    export_contours(contour_data, output_path)


if __name__ == '__main__':
    main()
