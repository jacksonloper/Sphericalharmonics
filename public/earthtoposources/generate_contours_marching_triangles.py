#!/usr/bin/env python3
"""
Generate contour surfaces using marching triangles on the compact mesh.
Extracts isosurfaces at specific elevation levels from the icosahedral mesh.
"""

import numpy as np
import struct
import sys
import os


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


def generate_icosahedral_mesh(subdivisions):
    """Generate icosahedral mesh with given subdivisions"""
    vertices, indices = create_icosahedron()

    for i in range(subdivisions):
        vertices, indices = subdivide_mesh(vertices, indices)

    return vertices, indices


def load_compact_mesh(path):
    """Load compact mesh file (HPELEV format)"""
    with open(path, 'rb') as f:
        # Read header
        header = f.read(6).decode('ascii')
        if header != 'HPELEV':
            raise ValueError(f'Invalid header: {header}')

        # Read subdivision level
        subdivisions = struct.unpack('<B', f.read(1))[0]

        # Read elevation data
        elevation_data = f.read()
        elevation = np.frombuffer(elevation_data, dtype=np.float32)

    print(f"Loaded compact mesh: subdivision {subdivisions}")
    print(f"  Vertices: {len(elevation):,}")
    print(f"  Elevation range: {elevation.min():.1f} to {elevation.max():.1f} m")

    return subdivisions, elevation


def interpolate_edge(v1, v2, e1, e2, level):
    """
    Interpolate position along edge where elevation crosses the level.

    Args:
        v1, v2: Vertex positions (3D points on unit sphere)
        e1, e2: Elevation values at v1, v2
        level: Contour level

    Returns:
        Interpolated position on unit sphere
    """
    # Linear interpolation factor
    t = (level - e1) / (e2 - e1)

    # Interpolate position
    pos = v1 + t * (v2 - v1)

    # Project back to sphere (important for consistency)
    pos = pos / np.linalg.norm(pos)

    return pos


def marching_triangles(vertices, triangles, elevation, level):
    """
    Extract contour mesh at given elevation level using marching triangles.

    Args:
        vertices: Mesh vertices (Nx3 array of unit sphere positions)
        triangles: Triangle indices (Mx3 array)
        elevation: Elevation at each vertex
        level: Contour elevation level

    Returns:
        List of triangle vertex positions for the contour surface
    """
    contour_triangles = []

    for i in range(0, len(triangles), 3):
        # Get triangle vertices and elevations
        idx = [triangles[i], triangles[i+1], triangles[i+2]]
        v = [vertices[idx[0]], vertices[idx[1]], vertices[idx[2]]]
        e = [elevation[idx[0]], elevation[idx[1]], elevation[idx[2]]]

        # Classify vertices relative to level
        above = [e[j] >= level for j in range(3)]
        num_above = sum(above)

        # Skip triangles that don't cross the level
        if num_above == 0 or num_above == 3:
            continue

        # Find edge crossings
        crossings = []
        edges = [(0, 1), (1, 2), (2, 0)]

        for j, (a, b) in enumerate(edges):
            if (e[a] >= level) != (e[b] >= level):
                # Edge crosses the level
                pos = interpolate_edge(v[a], v[b], e[a], e[b], level)
                crossings.append((j, pos))

        # Generate triangles based on crossing pattern
        if num_above == 1:
            # One vertex above: creates one triangle
            if len(crossings) == 2:
                # Find the vertex that's above
                above_idx = above.index(True)

                # The two crossings and the above vertex form a triangle
                c1_pos = crossings[0][1]
                c2_pos = crossings[1][1]

                # Add triangle (order matters for consistent winding)
                contour_triangles.append([c1_pos, c2_pos, v[above_idx]])

        elif num_above == 2:
            # Two vertices above: creates one triangle
            if len(crossings) == 2:
                # Find the vertex that's below
                below_idx = above.index(False)

                # The two crossings and the below vertex form a triangle
                c1_pos = crossings[0][1]
                c2_pos = crossings[1][1]

                # Add triangle (order matters for consistent winding)
                contour_triangles.append([v[below_idx], c1_pos, c2_pos])

    return contour_triangles


def extract_contours_at_levels(vertices, triangles, elevation, levels):
    """
    Extract contour surfaces at multiple elevation levels.

    Returns:
        List of (level, triangles) tuples
    """
    results = []

    for i, level in enumerate(levels):
        print(f"  Level {i+1}/{len(levels)} ({level:.0f}m)...", end=' ', flush=True)

        contour_tris = marching_triangles(vertices, triangles, elevation, level)

        if contour_tris:
            results.append((float(level), contour_tris))
            print(f"{len(contour_tris)} triangles")
        else:
            print("no triangles")

    return results


def export_contour_meshes(contour_data, output_path):
    """
    Export contour meshes in compact binary format.

    Format:
        Header: 'CONTOUR' (7 bytes)
        num_levels: uint16
        For each level:
            elevation: float32
            num_triangles: uint32
            For each triangle:
                9 float32 values (3 vertices × 3 coordinates)
    """
    with open(output_path, 'wb') as f:
        # Header
        f.write(b'CONTOUR')

        # Number of levels
        f.write(struct.pack('<H', len(contour_data)))

        total_triangles = 0
        for elevation, triangles in contour_data:
            # Elevation value
            f.write(struct.pack('<f', elevation))

            # Number of triangles
            f.write(struct.pack('<I', len(triangles)))
            total_triangles += len(triangles)

            # Triangle data (each triangle is 3 vertices × 3 coords = 9 floats)
            for tri in triangles:
                for vertex in tri:
                    f.write(struct.pack('<fff', float(vertex[0]), float(vertex[1]), float(vertex[2])))

    size_kb = os.path.getsize(output_path) / 1024
    print(f"\nSaved to: {output_path}")
    print(f"  File size: {size_kb:.1f} KB")
    print(f"  Total triangles: {total_triangles:,}")


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))

    # Load compact mesh
    compact_path = os.path.join(script_dir, 'sur_compact9.bin')
    subdivisions, elevation = load_compact_mesh(compact_path)

    # Generate matching mesh geometry
    print(f"\nGenerating icosahedral mesh (subdivision {subdivisions})...")
    vertices, triangles = generate_icosahedral_mesh(subdivisions)
    print(f"  Vertices: {len(vertices):,}")
    print(f"  Triangles: {len(triangles) // 3:,}")

    # Verify vertex count matches
    if len(vertices) != len(elevation):
        raise ValueError(f"Vertex count mismatch: {len(vertices)} != {len(elevation)}")

    # Define contour levels
    vmin, vmax = elevation.min(), elevation.max()

    # Same levels as before: specific low levels + equally spaced high levels
    below_zero_level = vmin / 2
    low_threshold = -20.0
    low_elevation_levels = np.array([5.0, 10.0, 20.0, 50.0, 100.0, 200.0, 500.0])

    num_levels = 30
    num_fixed_levels = 2 + len(low_elevation_levels)
    num_high_levels = num_levels - num_fixed_levels

    if num_high_levels > 0 and vmax > 500.0:
        high_elevation_levels = np.linspace(500.0, vmax, num_high_levels + 1)[1:]
    else:
        high_elevation_levels = np.array([])

    levels = np.concatenate([[below_zero_level, low_threshold], low_elevation_levels, high_elevation_levels])

    print(f"\nExtracting contours at {len(levels)} levels...")
    print(f"  Below zero: {below_zero_level:.0f}m")
    print(f"  Low threshold: {low_threshold:.0f}m")
    print(f"  Low elevation: {', '.join(f'{v:.0f}m' for v in low_elevation_levels)}")
    if len(high_elevation_levels) > 0:
        print(f"  High elevation: {high_elevation_levels[0]:.0f}m to {high_elevation_levels[-1]:.0f}m ({len(high_elevation_levels)} levels)")

    # Extract contours
    contour_data = extract_contours_at_levels(vertices, triangles, elevation, levels)

    # Export
    output_path = os.path.join(script_dir, 'sur_contours_mt.bin')
    export_contour_meshes(contour_data, output_path)


if __name__ == '__main__':
    main()
