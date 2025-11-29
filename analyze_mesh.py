#!/usr/bin/env python3
"""
Analyze adaptive mesh quality and statistics
"""

import numpy as np
import struct
import sys


def load_adaptive_mesh(filename):
    """Load adaptive mesh from binary file."""
    with open(filename, 'rb') as f:
        # Header
        header = f.read(7).decode('ascii')
        if header != 'ADAMESH':
            raise ValueError(f"Invalid header: {header}")

        version = struct.unpack('B', f.read(1))[0]
        if version != 1:
            raise ValueError(f"Unsupported version: {version}")

        # Counts
        num_vertices = struct.unpack('I', f.read(4))[0]
        num_triangles = struct.unpack('I', f.read(4))[0]

        # Vertices
        vertices = np.zeros((num_vertices, 3), dtype=np.float32)
        for i in range(num_vertices):
            vertices[i] = struct.unpack('fff', f.read(12))

        # Elevations
        elevations = np.zeros(num_vertices, dtype=np.float32)
        for i in range(num_vertices):
            elevations[i] = struct.unpack('f', f.read(4))[0]

        # Triangles
        triangles = np.zeros((num_triangles, 3), dtype=np.uint32)
        for i in range(num_triangles):
            triangles[i] = struct.unpack('III', f.read(12))

    return vertices, elevations, triangles


def analyze_mesh(vertices, elevations, triangles):
    """Compute detailed mesh statistics."""
    print("\n=== ADAPTIVE MESH ANALYSIS ===\n")

    # Basic counts
    print(f"Vertices:  {len(vertices):,}")
    print(f"Triangles: {len(triangles):,}")
    print()

    # Elevation statistics
    print("=== Elevation Statistics ===")
    print(f"Min:    {elevations.min():,.1f} m")
    print(f"Max:    {elevations.max():,.1f} m")
    print(f"Mean:   {elevations.mean():,.1f} m")
    print(f"Median: {np.median(elevations):,.1f} m")
    print(f"StdDev: {elevations.std():,.1f} m")
    print()

    # Elevation distribution
    print("=== Elevation Distribution ===")
    percentiles = [0, 10, 25, 50, 75, 90, 95, 99, 100]
    for p in percentiles:
        val = np.percentile(elevations, p)
        print(f"P{p:3d}: {val:7.1f} m")
    print()

    # Edge length statistics
    print("=== Edge Length Statistics ===")
    edge_lengths = []

    for tri in triangles:
        v0, v1, v2 = vertices[tri[0]], vertices[tri[1]], vertices[tri[2]]

        # Angular distance on sphere
        d01 = np.arccos(np.clip(np.dot(v0, v1), -1, 1))
        d12 = np.arccos(np.clip(np.dot(v1, v2), -1, 1))
        d20 = np.arccos(np.clip(np.dot(v2, v0), -1, 1))

        edge_lengths.extend([d01, d12, d20])

    edge_lengths = np.array(edge_lengths)

    # Convert to kilometers (assuming unit sphere with Earth radius)
    EARTH_RADIUS_KM = 6371.0
    edge_lengths_km = edge_lengths * EARTH_RADIUS_KM

    print(f"Min edge:    {edge_lengths_km.min():.2f} km ({np.degrees(edge_lengths.min()):.4f}°)")
    print(f"Max edge:    {edge_lengths_km.max():.2f} km ({np.degrees(edge_lengths.max()):.4f}°)")
    print(f"Mean edge:   {edge_lengths_km.mean():.2f} km ({np.degrees(edge_lengths.mean()):.4f}°)")
    print(f"Median edge: {np.median(edge_lengths_km):.2f} km ({np.degrees(np.median(edge_lengths)):.4f}°)")
    print()

    # Triangle area statistics
    print("=== Triangle Area Statistics ===")
    areas = []

    for tri in triangles:
        v0, v1, v2 = vertices[tri[0]], vertices[tri[1]], vertices[tri[2]]

        # Spherical triangle area (using L'Huilier's theorem)
        a = np.arccos(np.clip(np.dot(v1, v2), -1, 1))
        b = np.arccos(np.clip(np.dot(v2, v0), -1, 1))
        c = np.arccos(np.clip(np.dot(v0, v1), -1, 1))
        s = (a + b + c) / 2

        # L'Huilier's formula
        tan_E_4 = np.sqrt(np.tan(s/2) * np.tan((s-a)/2) * np.tan((s-b)/2) * np.tan((s-c)/2))
        E = 4 * np.arctan(tan_E_4)  # Spherical excess

        areas.append(E)

    areas = np.array(areas)
    total_area = areas.sum()

    print(f"Min area:   {areas.min():.2e} sr")
    print(f"Max area:   {areas.max():.2e} sr")
    print(f"Mean area:  {areas.mean():.2e} sr")
    print(f"Total area: {total_area:.4f} sr (sphere = 4π ≈ {4*np.pi:.4f} sr)")
    print(f"Coverage:   {100 * total_area / (4*np.pi):.2f}%")
    print()

    # Vertex degree distribution
    print("=== Vertex Connectivity ===")
    degree = np.zeros(len(vertices), dtype=int)
    for tri in triangles:
        degree[tri[0]] += 1
        degree[tri[1]] += 1
        degree[tri[2]] += 1

    print(f"Min degree: {degree.min()}")
    print(f"Max degree: {degree.max()}")
    print(f"Mean degree: {degree.mean():.2f}")
    print()

    # Nyquist analysis
    print("=== Nyquist Analysis ===")
    print("For lmax=2160 spherical harmonics:")
    lmax = 2160
    nyquist_wavelength = np.pi / lmax
    nyquist_spacing = nyquist_wavelength / 2
    nyquist_spacing_km = nyquist_spacing * EARTH_RADIUS_KM

    print(f"Min wavelength:     {nyquist_wavelength:.6f} rad ({nyquist_wavelength*EARTH_RADIUS_KM:.2f} km)")
    print(f"Nyquist spacing:    {nyquist_spacing:.6f} rad ({nyquist_spacing_km:.2f} km)")
    print(f"Mesh min spacing:   {edge_lengths.min():.6f} rad ({edge_lengths_km.min():.2f} km)")
    print(f"Mesh median spacing: {np.median(edge_lengths):.6f} rad ({np.median(edge_lengths_km):.2f} km)")

    if edge_lengths.min() < nyquist_spacing:
        print("⚠️  WARNING: Some edges are below Nyquist limit (may over-sample)")
    else:
        print("✓ All edges respect Nyquist limit")
    print()

    # Memory usage
    print("=== Memory Usage ===")
    vertices_bytes = len(vertices) * 12  # 3 float32
    elevations_bytes = len(elevations) * 4  # 1 float32
    triangles_bytes = len(triangles) * 12  # 3 uint32
    header_bytes = 16

    total_bytes = header_bytes + vertices_bytes + elevations_bytes + triangles_bytes

    print(f"Header:     {header_bytes:,} bytes")
    print(f"Vertices:   {vertices_bytes:,} bytes ({vertices_bytes/1024/1024:.2f} MB)")
    print(f"Elevations: {elevations_bytes:,} bytes ({elevations_bytes/1024/1024:.2f} MB)")
    print(f"Triangles:  {triangles_bytes:,} bytes ({triangles_bytes/1024/1024:.2f} MB)")
    print(f"Total:      {total_bytes:,} bytes ({total_bytes/1024/1024:.2f} MB)")
    print()

    # Comparison with uniform mesh
    print("=== Comparison with Uniform Icosahedral Mesh ===")
    for sub_level in [5, 6, 7, 8]:
        uniform_verts = 10 * 4**sub_level + 2
        uniform_tris = 20 * 4**sub_level
        uniform_bytes = 16 + uniform_verts * 16 + uniform_tris * 12

        print(f"Subdivision {sub_level}:")
        print(f"  Vertices: {uniform_verts:,} (adaptive: {len(vertices):,}, "
              f"{100*len(vertices)/uniform_verts:.1f}%)")
        print(f"  Size:     {uniform_bytes/1024/1024:.2f} MB (adaptive: {total_bytes/1024/1024:.2f} MB, "
              f"{100*total_bytes/uniform_bytes:.1f}%)")
        print()


def main():
    filename = sys.argv[1] if len(sys.argv) > 1 else 'public/earthtoposources/sur_adaptive.mesh'

    print(f"Loading mesh from: {filename}")
    vertices, elevations, triangles = load_adaptive_mesh(filename)

    analyze_mesh(vertices, elevations, triangles)


if __name__ == '__main__':
    main()
