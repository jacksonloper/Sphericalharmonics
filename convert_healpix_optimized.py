#!/usr/bin/env python3
"""
Convert HEALPix data to an optimized spherical mesh for three.js.
Includes downsampling and compact encoding to stay under 1MB.
"""

import numpy as np
import struct
import sys


def pix2vec_ring(nside, ipix):
    """Convert HEALPix pixel index to Cartesian coordinates (RING scheme)."""
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


def ring2nest(nside, ipix_ring):
    """Convert RING pixel index to NESTED (approximate, for downsampling)."""
    # For simplicity, we'll use a different approach for downsampling
    return ipix_ring


def downsample_healpix(data, nside_in, nside_out):
    """
    Downsample HEALPix map from nside_in to nside_out.
    Uses simple averaging of pixels.
    """
    if nside_in == nside_out:
        return data

    npix_in = 12 * nside_in * nside_in
    npix_out = 12 * nside_out * nside_out

    # Downsampling factor
    factor = nside_in // nside_out

    if factor * nside_out != nside_in:
        raise ValueError("nside_in must be a multiple of nside_out")

    # Simple averaging approach: group pixels spatially
    # For each output pixel, average corresponding input pixels
    data_out = np.zeros(npix_out, dtype=np.float32)

    # Build mapping from output to input pixels
    for i_out in range(npix_out):
        x_out, y_out, z_out = pix2vec_ring(nside_out, i_out)

        # Find nearby input pixels and average them
        samples = []
        # Sample multiple input pixels near this output pixel direction
        for dx in np.linspace(-0.02, 0.02, factor):
            for dy in np.linspace(-0.02, 0.02, factor):
                # Perturb direction slightly
                x = x_out + dx
                y = y_out + dy
                z = z_out

                # Normalize back to unit sphere
                norm = np.sqrt(x*x + y*y + z*z)
                x, y, z = x/norm, y/norm, z/norm

                # Convert to spherical coords
                theta = np.arccos(np.clip(z, -1, 1))
                phi = np.arctan2(y, x)
                if phi < 0:
                    phi += 2 * np.pi

                # Find corresponding input pixel (approximate)
                i_in = vec2pix_ring_approx(nside_in, x, y, z)
                if 0 <= i_in < npix_in:
                    samples.append(data[i_in])

        if samples:
            data_out[i_out] = np.mean(samples)

    return data_out


def vec2pix_ring_approx(nside, x, y, z):
    """Approximate conversion from vector to HEALPix pixel (RING)."""
    # Convert to spherical
    theta = np.arccos(np.clip(z, -1, 1))
    phi = np.arctan2(y, x)
    if phi < 0:
        phi += 2 * np.pi

    # Approximate pixel index
    z_val = z
    if z >= 2.0/3.0:  # North polar cap
        temp = nside * np.sqrt(3 * (1 - z_val))
        iring = int(temp)
        iphi = int(phi / (2 * np.pi) * 4 * iring)
        ipix = 2 * iring * (iring - 1) + iphi
    elif z <= -2.0/3.0:  # South polar cap
        temp = nside * np.sqrt(3 * (1 + z_val))
        iring = int(temp)
        iphi = int(phi / (2 * np.pi) * 4 * iring)
        npix = 12 * nside * nside
        ipix = npix - 2 * iring * (iring + 1) + iphi
    else:  # Equatorial belt
        temp = nside * (2 - 1.5 * z_val)
        iring = int(temp)
        iphi = int(phi / (2 * np.pi) * 4 * nside)
        ncap = 2 * nside * (nside - 1)
        ipix = ncap + (iring - nside) * 4 * nside + iphi

    return int(np.clip(ipix, 0, 12 * nside * nside - 1))


def create_healpix_mesh(healpix_data, nside):
    """Create a triangulated spherical mesh from HEALPix data."""
    npix = len(healpix_data)

    # Generate vertex positions
    positions = np.zeros((npix, 3), dtype=np.float32)
    for i in range(npix):
        x, y, z = pix2vec_ring(nside, i)
        positions[i] = [x, y, z]

    # Create triangle indices by connecting pixels
    indices = []
    ncap = 2 * nside * (nside - 1)

    # North polar cap
    for ring in range(1, nside):
        npix_ring = 4 * ring
        start_curr = 2 * ring * (ring - 1)

        for i in range(npix_ring):
            i_curr = start_curr + i
            i_next = start_curr + (i + 1) % npix_ring

            if ring == 1:
                indices.extend([0, i_next, i_curr])
            else:
                npix_prev = 4 * (ring - 1)
                start_prev = 2 * (ring - 1) * (ring - 2)
                ratio = npix_prev / npix_ring

                i_prev1 = start_prev + int(i * ratio)
                i_prev2 = start_prev + int((i + 1) * ratio)

                if i_prev1 == i_prev2:
                    indices.extend([i_prev1, i_next, i_curr])
                else:
                    indices.extend([i_prev1, i_next, i_curr])
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
                npix_prev = 4 * (nside - 1)
                i_prev = start_prev + int(i * npix_prev / npix_ring)
                indices.extend([i_prev, i_next, i_curr])
            else:
                i_prev = start_prev + i
                i_prev_next = start_prev + (i + 1) % npix_ring
                indices.extend([i_prev, i_next, i_curr])
                indices.extend([i_prev, i_prev_next, i_next])

    # South polar cap
    for ring in range(3 * nside, 4 * nside - 1):
        ring_from_south = 4 * nside - 1 - ring
        npix_ring = 4 * ring_from_south
        start_curr = npix - 2 * ring_from_south * (ring_from_south + 1)

        for i in range(npix_ring):
            i_curr = start_curr + i
            i_prev = start_curr + (i - 1 + npix_ring) % npix_ring

            if ring_from_south == 1:
                indices.extend([i_prev, i_curr, npix - 1])
            else:
                npix_next = 4 * (ring_from_south - 1)
                start_next = npix - 2 * (ring_from_south - 1) * ring_from_south
                i_next = start_next + int(i * npix_next / npix_ring)
                indices.extend([i_prev, i_curr, i_next])

    indices = np.array(indices, dtype=np.uint32 if npix > 65535 else np.uint16)

    return positions, indices, healpix_data.astype(np.float32)


def export_mesh_binary(positions, indices, elevation, output_path):
    """Export mesh in compact binary format."""
    with open(output_path, 'wb') as f:
        # Header
        f.write(b'HPMESH')

        # Metadata
        num_vertices = len(positions)
        num_indices = len(indices)
        index_type = 2 if indices.dtype == np.uint16 else 4

        f.write(struct.pack('<I', num_vertices))
        f.write(struct.pack('<I', num_indices))
        f.write(struct.pack('<B', index_type))

        # Data
        f.write(positions.tobytes())
        f.write(indices.tobytes())
        f.write(elevation.tobytes())

    size_kb = (len(positions) * 12 + len(indices) * index_type + len(elevation) * 4 + 15) / 1024
    print(f"\nExported mesh to {output_path}")
    print(f"  Vertices: {len(positions):,}")
    print(f"  Triangles: {len(indices) // 3:,}")
    print(f"  Index type: uint{index_type * 8}")
    print(f"  File size: {size_kb:.1f} KB")


def main():
    if len(sys.argv) < 2:
        print("Usage: python convert_healpix_optimized.py <input.bin> [nside_out] [output.bin]")
        print("\nExamples:")
        print("  python convert_healpix_optimized.py sources/sur_healpix_nside128.bin 32 sources/sur_mesh32.bin")
        print("  python convert_healpix_optimized.py sources/sur_healpix_nside128.bin 64 sources/sur_mesh64.bin")
        sys.exit(1)

    input_path = sys.argv[1]
    nside_out = int(sys.argv[2]) if len(sys.argv) > 2 else 64
    output_path = sys.argv[3] if len(sys.argv) > 3 else f"sources/mesh_nside{nside_out}.bin"

    # Load HEALPix data
    print(f"Loading {input_path}...")
    healpix_data = np.fromfile(input_path, dtype='<f4')

    npix_in = len(healpix_data)
    nside_in = int(np.sqrt(npix_in / 12))

    print(f"  Input pixels: {npix_in:,} (nside={nside_in})")
    print(f"  Elevation range: {healpix_data.min():.1f} to {healpix_data.max():.1f} m")

    # Downsample if needed
    if nside_out < nside_in:
        print(f"\nDownsampling to nside={nside_out}...")
        healpix_data = downsample_healpix(healpix_data, nside_in, nside_out)
        print(f"  Output pixels: {len(healpix_data):,}")

    # Create mesh
    print("\nCreating mesh...")
    positions, indices, elevation = create_healpix_mesh(healpix_data, nside_out)

    # Export
    export_mesh_binary(positions, indices, elevation, output_path)


if __name__ == '__main__':
    main()
