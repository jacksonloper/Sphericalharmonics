#!/usr/bin/env python3
"""
Generate an adaptive mesh for spherical harmonic data.

This script creates a triangle mesh on the sphere with adaptive refinement:
- Starts with an icosahedron
- Subdivides triangles where the surface has high curvature
- Keeps Nyquist sampling in mind (lmax=2160 requires ~4.6km spacing at equator)
- Outputs float32 elevations per vertex
"""

import numpy as np
import healpy as hp
import struct
from dataclasses import dataclass
from typing import List, Tuple, Set
import heapq


@dataclass
class Triangle:
    """A triangle on the sphere with three vertex indices."""
    v0: int
    v1: int
    v2: int
    error: float = 0.0

    def __lt__(self, other):
        return self.error > other.error  # Max heap (highest error first)


class AdaptiveMesh:
    """Adaptive mesh generator for spherical data."""

    def __init__(self, healpix_data, nside):
        """
        Initialize with HEALPix data.

        Args:
            healpix_data: HEALPix map array
            nside: HEALPix nside parameter
        """
        self.healpix_data = healpix_data
        self.nside = nside
        self.vertices = []  # List of (x, y, z) unit vectors
        self.elevations = []  # List of elevation values
        self.triangles = []  # List of Triangle objects
        self.edges = {}  # (v0, v1) -> midpoint_vertex_index

    def sample_elevation(self, direction):
        """
        Sample elevation at a given direction (unit vector).

        Args:
            direction: (x, y, z) unit vector

        Returns:
            Elevation value
        """
        # Convert to spherical coordinates
        theta = np.arccos(direction[2])  # colatitude
        phi = np.arctan2(direction[1], direction[0])  # longitude

        # Get HEALPix pixel
        ipix = hp.ang2pix(self.nside, theta, phi)
        return self.healpix_data[ipix]

    def add_vertex(self, x, y, z):
        """Add a vertex and return its index."""
        # Normalize to unit sphere
        norm = np.sqrt(x*x + y*y + z*z)
        x, y, z = x/norm, y/norm, z/norm

        idx = len(self.vertices)
        self.vertices.append((x, y, z))
        self.elevations.append(self.sample_elevation((x, y, z)))
        return idx

    def initialize_icosahedron(self):
        """Create the initial icosahedron mesh."""
        # Golden ratio
        t = (1.0 + np.sqrt(5.0)) / 2.0

        # 12 vertices of icosahedron
        vertices = [
            (-1,  t,  0), ( 1,  t,  0), (-1, -t,  0), ( 1, -t,  0),
            ( 0, -1,  t), ( 0,  1,  t), ( 0, -1, -t), ( 0,  1, -t),
            ( t,  0, -1), ( t,  0,  1), (-t,  0, -1), (-t,  0,  1)
        ]

        for v in vertices:
            self.add_vertex(v[0], v[1], v[2])

        # 20 faces of icosahedron
        faces = [
            (0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11),
            (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6), (7, 1, 8),
            (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9),
            (4, 9, 5), (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1)
        ]

        for f in faces:
            tri = Triangle(f[0], f[1], f[2])
            self.triangles.append(tri)

    def get_midpoint(self, v0_idx, v1_idx):
        """
        Get or create midpoint vertex between two vertices.
        Uses edge cache to avoid duplicate vertices.
        """
        # Canonical edge ordering
        edge = tuple(sorted([v0_idx, v1_idx]))

        if edge in self.edges:
            return self.edges[edge]

        # Create new midpoint vertex
        v0 = self.vertices[v0_idx]
        v1 = self.vertices[v1_idx]
        mid_x = (v0[0] + v1[0]) / 2.0
        mid_y = (v0[1] + v1[1]) / 2.0
        mid_z = (v0[2] + v1[2]) / 2.0

        mid_idx = self.add_vertex(mid_x, mid_y, mid_z)
        self.edges[edge] = mid_idx
        return mid_idx

    def compute_triangle_error(self, tri):
        """
        Compute error metric for a triangle.

        Error is based on how well linear interpolation approximates
        the actual elevation data at interior points.
        """
        v0 = np.array(self.vertices[tri.v0])
        v1 = np.array(self.vertices[tri.v1])
        v2 = np.array(self.vertices[tri.v2])

        e0 = self.elevations[tri.v0]
        e1 = self.elevations[tri.v1]
        e2 = self.elevations[tri.v2]

        # Sample at triangle center and edge midpoints
        test_points = [
            (v0 + v1 + v2) / 3.0,  # Centroid
            (v0 + v1) / 2.0,        # Edge 01 midpoint
            (v1 + v2) / 2.0,        # Edge 12 midpoint
            (v2 + v0) / 2.0,        # Edge 20 midpoint
        ]

        max_error = 0.0
        for point in test_points:
            # Normalize to sphere
            point = point / np.linalg.norm(point)

            # Get actual elevation
            actual = self.sample_elevation(point)

            # Compute barycentric coordinates (approximate for sphere)
            # For simplicity, use planar barycentric coordinates
            # This is approximate but sufficient for error estimation

            # Use vertex elevations to estimate via nearest vertices
            # Simple approach: use closest vertex elevation
            dist0 = np.linalg.norm(point - v0)
            dist1 = np.linalg.norm(point - v1)
            dist2 = np.linalg.norm(point - v2)

            total_dist = dist0 + dist1 + dist2
            if total_dist > 0:
                w0 = (1.0 / (dist0 + 1e-10))
                w1 = (1.0 / (dist1 + 1e-10))
                w2 = (1.0 / (dist2 + 1e-10))
                total_w = w0 + w1 + w2
                w0 /= total_w
                w1 /= total_w
                w2 /= total_w

                interpolated = w0 * e0 + w1 * e1 + w2 * e2
            else:
                interpolated = e0

            error = abs(actual - interpolated)
            max_error = max(max_error, error)

        return max_error

    def subdivide_triangle(self, tri):
        """
        Subdivide a triangle into 4 smaller triangles.

        Returns the 4 new triangles.
        """
        # Get midpoints
        m01 = self.get_midpoint(tri.v0, tri.v1)
        m12 = self.get_midpoint(tri.v1, tri.v2)
        m20 = self.get_midpoint(tri.v2, tri.v0)

        # Create 4 new triangles
        t0 = Triangle(tri.v0, m01, m20)
        t1 = Triangle(tri.v1, m12, m01)
        t2 = Triangle(tri.v2, m20, m12)
        t3 = Triangle(m01, m12, m20)

        return [t0, t1, t2, t3]

    def generate(self, max_vertices=100000, error_threshold=10.0, min_edge_length=None):
        """
        Generate adaptive mesh.

        Args:
            max_vertices: Maximum number of vertices
            error_threshold: Stop when all triangles have error below this (meters)
            min_edge_length: Minimum edge length in radians (for Nyquist limit)

        Returns:
            None (modifies mesh in place)
        """
        # Initialize with icosahedron
        self.initialize_icosahedron()

        # Compute Nyquist limit if not specified
        # For lmax=2160, we need spacing < π/2160 ≈ 0.00145 radians
        if min_edge_length is None:
            min_edge_length = np.pi / 4320  # Conservative: 2x Nyquist

        print(f"Generating adaptive mesh...")
        print(f"Max vertices: {max_vertices}")
        print(f"Error threshold: {error_threshold}m")
        print(f"Min edge length: {min_edge_length:.6f} rad ({np.degrees(min_edge_length):.4f}°)")

        # Compute initial errors and build priority queue
        pq = []
        for tri in self.triangles:
            tri.error = self.compute_triangle_error(tri)
            heapq.heappush(pq, tri)

        self.triangles = []  # Will rebuild from refined triangles

        iteration = 0
        while pq and len(self.vertices) < max_vertices:
            # Get triangle with highest error
            tri = heapq.heappop(pq)

            if tri.error < error_threshold:
                # Error is acceptable, keep triangle as-is
                self.triangles.append(tri)
                continue

            # Check edge length (Nyquist limit)
            v0 = np.array(self.vertices[tri.v0])
            v1 = np.array(self.vertices[tri.v1])
            v2 = np.array(self.vertices[tri.v2])

            # Compute edge lengths (angular distance on sphere)
            edge_len_01 = np.arccos(np.clip(np.dot(v0, v1), -1, 1))
            edge_len_12 = np.arccos(np.clip(np.dot(v1, v2), -1, 1))
            edge_len_20 = np.arccos(np.clip(np.dot(v2, v0), -1, 1))
            max_edge = max(edge_len_01, edge_len_12, edge_len_20)

            if max_edge < min_edge_length:
                # Too small, would violate Nyquist limit
                self.triangles.append(tri)
                continue

            # Subdivide triangle
            if len(self.vertices) + 3 > max_vertices:
                # Would exceed vertex limit
                self.triangles.append(tri)
                continue

            new_tris = self.subdivide_triangle(tri)

            # Compute errors and add to queue
            for new_tri in new_tris:
                new_tri.error = self.compute_triangle_error(new_tri)
                heapq.heappush(pq, new_tri)

            iteration += 1
            if iteration % 1000 == 0:
                print(f"Iteration {iteration}: {len(self.vertices)} vertices, "
                      f"{len(pq)} triangles in queue, error={tri.error:.2f}m")

        # Add remaining triangles
        while pq:
            self.triangles.append(heapq.heappop(pq))

        print(f"\nMesh generation complete!")
        print(f"Vertices: {len(self.vertices)}")
        print(f"Triangles: {len(self.triangles)}")

        # Compute statistics
        errors = [tri.error for tri in self.triangles]
        print(f"Error stats: min={min(errors):.2f}m, max={max(errors):.2f}m, "
              f"mean={np.mean(errors):.2f}m, median={np.median(errors):.2f}m")

    def save(self, filename):
        """
        Save mesh to binary file.

        Format:
            Header: 'ADAMESH' (7 bytes)
            Version: uint8 (1 byte) = 1
            Num vertices: uint32 (4 bytes)
            Num triangles: uint32 (4 bytes)
            Vertices: float32[num_vertices * 3] - (x, y, z) positions on unit sphere
            Elevations: float32[num_vertices] - elevation in meters
            Triangles: uint32[num_triangles * 3] - vertex indices
        """
        print(f"\nSaving to {filename}...")

        with open(filename, 'wb') as f:
            # Header
            f.write(b'ADAMESH')
            f.write(struct.pack('B', 1))  # Version

            # Counts
            f.write(struct.pack('I', len(self.vertices)))
            f.write(struct.pack('I', len(self.triangles)))

            # Vertices (x, y, z)
            for v in self.vertices:
                f.write(struct.pack('fff', v[0], v[1], v[2]))

            # Elevations
            for e in self.elevations:
                f.write(struct.pack('f', e))

            # Triangles
            for tri in self.triangles:
                f.write(struct.pack('III', tri.v0, tri.v1, tri.v2))

        file_size = open(filename, 'rb').read().__sizeof__()
        print(f"Saved {len(self.vertices)} vertices, {len(self.triangles)} triangles")
        print(f"File size: {file_size / 1024 / 1024:.2f} MB")


def main():
    import argparse

    parser = argparse.ArgumentParser(description='Generate adaptive mesh for spherical harmonics')
    parser.add_argument('--input', default='public/earthtoposources/sur_healpix_nside128.bin',
                        help='Input HEALPix file')
    parser.add_argument('--output', default='public/earthtoposources/sur_adaptive.mesh',
                        help='Output mesh file')
    parser.add_argument('--max-vertices', type=int, default=100000,
                        help='Maximum number of vertices')
    parser.add_argument('--error-threshold', type=float, default=10.0,
                        help='Error threshold in meters')
    parser.add_argument('--nside', type=int, default=128,
                        help='HEALPix nside parameter')

    args = parser.parse_args()

    # Load HEALPix data (raw float32 format)
    print(f"Loading HEALPix data from {args.input}...")
    healpix_data = np.fromfile(args.input, dtype='<f4')

    # Verify nside
    npix = len(healpix_data)
    expected_npix = hp.nside2npix(args.nside)
    if npix != expected_npix:
        # Try to infer nside from file size
        args.nside = int(np.sqrt(npix / 12))
        print(f"Warning: Inferred nside={args.nside} from file size ({npix} pixels)")

    print(f"Loaded {npix} HEALPix pixels (nside={args.nside})")
    print(f"Elevation range: {healpix_data.min():.1f} to {healpix_data.max():.1f} meters")

    # Generate adaptive mesh
    mesh = AdaptiveMesh(healpix_data, args.nside)
    mesh.generate(
        max_vertices=args.max_vertices,
        error_threshold=args.error_threshold
    )

    # Save mesh
    mesh.save(args.output)

    print("\nDone!")


if __name__ == '__main__':
    main()
