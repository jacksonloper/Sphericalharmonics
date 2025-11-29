#!/usr/bin/env python3
"""
Generate compact elevation-only mesh from HEALPix data
Only stores elevations - geometry is generated procedurally
"""

import numpy as np
import struct
import sys


# Copy the mesh generation functions from generate_mesh.py
def create_icosahedron():
    t = (1 + np.sqrt(5)) / 2
    vertices = np.array([
        [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
        [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
        [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]
    ], dtype=np.float32)

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

    return np.array(vertices, dtype=np.float32), np.array(new_indices, dtype=np.uint32)


def ang2pix_ring(nside, theta, phi):
    z = np.cos(theta)
    npix = 12 * nside * nside

    if z >= 2.0 / 3.0:
        temp = nside * np.sqrt(3 * (1 - z))
        iring = int(temp)
        iphi = int(phi / (2 * np.pi) * 4 * iring)
        ipix = 2 * iring * (iring - 1) + iphi
        return min(ipix, npix - 1)
    elif z <= -2.0 / 3.0:
        temp = nside * np.sqrt(3 * (1 + z))
        iring = int(temp)
        iphi = int(phi / (2 * np.pi) * 4 * iring)
        ipix = npix - 2 * iring * (iring + 1) + iphi
        return max(0, min(ipix, npix - 1))
    else:
        temp = nside * (2 - 1.5 * z)
        iring = int(temp)
        iphi = int(phi / (2 * np.pi) * 4 * nside)
        ncap = 2 * nside * (nside - 1)
        ipix = ncap + (iring - nside) * 4 * nside + iphi
        return max(0, min(ipix, npix - 1))


def sample_healpix(healpix_data, nside, x, y, z):
    theta = np.arccos(np.clip(z, -1, 1))
    phi = np.arctan2(y, x)
    if phi < 0:
        phi += 2 * np.pi
    ipix = ang2pix_ring(nside, theta, phi)
    return healpix_data[ipix]


def generate_elevation_data(healpix_data, nside, subdivisions):
    """Generate elevation data for icosahedral mesh"""
    print(f"Generating elevation data for subdivision {subdivisions}")

    vertices, indices = create_icosahedron()

    for i in range(subdivisions):
        vertices, indices = subdivide_mesh(vertices, indices)
        print(f"  Subdivision {i + 1}: {len(vertices):,} vertices")

    # Sample elevation at each vertex
    elevation = np.zeros(len(vertices), dtype=np.float32)
    for i, (x, y, z) in enumerate(vertices):
        elevation[i] = sample_healpix(healpix_data, nside, x, y, z)

    return elevation


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

    # Calculate original size for comparison
    orig_size_kb = (15 + num_vertices * 12 + num_vertices * 3 * 4 + num_vertices * 4) / 1024

    print(f"\nSaved to: {output_path}")
    print(f"  Vertices: {num_vertices:,}")
    print(f"  File size: {size_kb:.1f} KB")
    print(f"  Original format: {orig_size_kb:.1f} KB")
    print(f"  Space saved: {orig_size_kb - size_kb:.1f} KB ({100 * (1 - size_kb/orig_size_kb):.1f}%)")


def main():
    subdivisions = int(sys.argv[1]) if len(sys.argv) > 1 else 5

    print("Loading HEALPix data...")
    healpix_data = np.fromfile('public/earthtoposources/sur_healpix_nside128.bin', dtype='<f4')

    nside = int(np.sqrt(len(healpix_data) / 12))
    print(f"  Pixels: {len(healpix_data):,} (nside={nside})")
    print(f"  Elevation range: {healpix_data.min():.1f} to {healpix_data.max():.1f} m\n")

    elevation = generate_elevation_data(healpix_data, nside, subdivisions)

    output_path = f'public/earthtoposources/sur_compact{subdivisions}.bin'
    export_compact_mesh(elevation, subdivisions, output_path)


if __name__ == '__main__':
    main()
