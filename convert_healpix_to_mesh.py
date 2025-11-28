#!/usr/bin/env python3
"""
Convert HEALPix data to a spherical quad mesh suitable for three.js
Outputs a compact binary format with positions, indices, and elevation data.
"""

import numpy as np
import struct
import sys

def pix2vec_ring(nside, ipix):
    """
    Convert HEALPix pixel index to Cartesian coordinates (RING scheme).
    Simplified implementation without healpy dependency.
    Returns (x, y, z) on unit sphere.
    """
    npix = 12 * nside * nside
    ncap = 2 * nside * (nside - 1)

    # North polar cap
    if ipix < ncap:
        iring = int((np.sqrt(1 + 2 * ipix) + 1) / 2)
        iphi = ipix - 2 * iring * (iring - 1)

        z = 1 - (iring * iring) / (3 * nside * nside)
        phi = (iphi + 0.5) * np.pi / (2 * iring)

    # Equatorial belt
    elif ipix < npix - ncap:
        ip = ipix - ncap
        iring = ip // (4 * nside) + nside
        iphi = ip % (4 * nside)

        fodd = 1 if ((iring + nside) & 1) else 0.5
        z = (2 * nside - iring) * 2 / (3 * nside)
        phi = (iphi + fodd) * np.pi / (2 * nside)

    # South polar cap
    else:
        ip = npix - ipix
        iring = int((np.sqrt(2 * ip - 1) + 1) / 2)
        iphi = 2 * iring * (iring + 1) - ip

        z = -1 + (iring * iring) / (3 * nside * nside)
        phi = (iphi + 0.5) * np.pi / (2 * iring)

    # Convert to Cartesian
    stheta = np.sqrt((1 - z) * (1 + z))
    x = stheta * np.cos(phi)
    y = stheta * np.sin(phi)

    return x, y, z


def create_healpix_mesh(healpix_data, nside):
    """
    Create a spherical mesh from HEALPix data.
    Returns positions (Nx3), indices (for quads/triangles), and elevation values.
    """
    npix = len(healpix_data)

    # Generate vertex positions on unit sphere
    positions = np.zeros((npix, 3), dtype=np.float32)

    for i in range(npix):
        x, y, z = pix2vec_ring(nside, i)
        positions[i] = [x, y, z]

    # Create triangulated mesh indices
    # For simplicity, we'll create a mesh by connecting neighboring rings
    # This is approximate but works well for visualization
    indices = []

    # North polar cap
    ncap = 2 * nside * (nside - 1)

    for ring in range(1, nside):
        npix_ring = 4 * ring
        npix_prev = 4 * (ring - 1) if ring > 1 else 0

        start_curr = 2 * ring * (ring - 1)
        start_prev = 2 * (ring - 1) * (ring - 2) if ring > 1 else 0

        for i in range(npix_ring):
            i_curr = start_curr + i
            i_next = start_curr + (i + 1) % npix_ring

            if ring == 1:
                # Connect to north pole (pixel 0)
                indices.extend([0, i_next, i_curr])
            else:
                # Connect to previous ring
                ratio = npix_prev / npix_ring
                i_prev1 = start_prev + int(i * ratio)
                i_prev2 = start_prev + int((i + 1) * ratio)

                if i_prev1 == i_prev2:
                    indices.extend([i_prev1, i_next, i_curr])
                else:
                    indices.extend([i_prev1, i_next, i_curr])
                    if i_prev2 != start_prev + int(((i + 1) % npix_ring) * ratio):
                        indices.extend([i_prev1, i_prev2, i_next])

    # Equatorial belt
    for ring in range(nside, 3 * nside):
        npix_ring = 4 * nside
        start_curr = ncap + (ring - nside) * npix_ring
        start_prev = ncap + (ring - nside - 1) * npix_ring if ring > nside else 2 * nside * (nside - 1)

        for i in range(npix_ring):
            i_curr = start_curr + i
            i_next = start_curr + (i + 1) % npix_ring

            if ring == nside:
                # Connect to last ring of north cap
                ratio = (4 * (nside - 1)) / npix_ring
                i_prev = start_prev + int(i * ratio)
                indices.extend([i_prev, i_next, i_curr])
            else:
                # Connect to previous equatorial ring
                i_prev = start_prev + i
                i_prev_next = start_prev + (i + 1) % npix_ring
                indices.extend([i_prev, i_next, i_curr])
                indices.extend([i_prev, i_prev_next, i_next])

    # South polar cap
    for ring in range(3 * nside, 4 * nside - 1):
        ring_from_south = 4 * nside - 1 - ring
        npix_ring = 4 * ring_from_south

        start_curr = npix - 2 * ring_from_south * (ring_from_south + 1)
        start_next = npix - 2 * (ring_from_south - 1) * ring_from_south if ring_from_south > 1 else npix - 1

        for i in range(npix_ring):
            i_curr = start_curr + i
            i_prev = start_curr + (i - 1 + npix_ring) % npix_ring

            if ring_from_south == 1:
                # Connect to south pole
                indices.extend([i_prev, i_curr, npix - 1])
            else:
                # Connect to next ring (toward pole)
                ratio = (4 * (ring_from_south - 1)) / npix_ring
                i_next = start_next + int(i * ratio)
                indices.extend([i_prev, i_curr, i_next])

    indices = np.array(indices, dtype=np.uint32)

    return positions, indices, healpix_data.astype(np.float32)


def export_mesh_binary(positions, indices, elevation, output_path):
    """
    Export mesh to a compact binary format:
    - Header: 'HPMESH' (6 bytes)
    - num_vertices: uint32
    - num_indices: uint32
    - positions: float32[num_vertices * 3]
    - indices: uint32[num_indices]
    - elevation: float32[num_vertices]
    """
    with open(output_path, 'wb') as f:
        # Header
        f.write(b'HPMESH')

        # Counts
        f.write(struct.pack('<I', len(positions)))
        f.write(struct.pack('<I', len(indices)))

        # Data
        f.write(positions.tobytes())
        f.write(indices.tobytes())
        f.write(elevation.tobytes())

    print(f"Exported mesh to {output_path}")
    print(f"  Vertices: {len(positions):,}")
    print(f"  Triangles: {len(indices) // 3:,}")
    print(f"  File size: {len(positions) * 12 + len(indices) * 4 + len(elevation) * 4 + 14:,} bytes")


def main():
    if len(sys.argv) < 2:
        print("Usage: python convert_healpix_to_mesh.py <input.bin> [output.mesh]")
        print("\nAvailable files:")
        print("  sources/sur_healpix_nside128.bin - Surface elevation")
        print("  sources/bed_healpix_nside128.bin - Bedrock elevation")
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else input_path.replace('.bin', '.mesh')

    # Load HEALPix data
    print(f"Loading {input_path}...")
    healpix_data = np.fromfile(input_path, dtype='<f4')

    # Determine nside from data length
    npix = len(healpix_data)
    nside = int(np.sqrt(npix / 12))

    print(f"  Pixels: {npix:,}")
    print(f"  nside: {nside}")
    print(f"  Elevation range: {healpix_data.min():.1f} to {healpix_data.max():.1f} m")

    # Create mesh
    print("Creating mesh...")
    positions, indices, elevation = create_healpix_mesh(healpix_data, nside)

    # Export
    export_mesh_binary(positions, indices, elevation, output_path)


if __name__ == '__main__':
    main()
