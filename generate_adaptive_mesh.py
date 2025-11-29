#!/usr/bin/env python3
"""
Generate a watertight adaptive mesh for spherical harmonic data.

This script creates a conforming triangle mesh on the sphere:
- Starts with an icosahedron
- Subdivides triangles where the surface has high curvature
- Ensures watertight mesh by conforming neighbor triangles to subdivided edges
- Keeps Nyquist sampling in mind (lmax=2160 requires ~4.6km spacing at equator)
- Outputs float32 elevations per vertex
"""

import numpy as np
import healpy as hp
import struct
from dataclasses import dataclass
from typing import List, Tuple, Set, Dict
import heapq


@dataclass
class Triangle:
    """A triangle on the sphere with three vertex indices."""
    v0: int
    v1: int
    v2: int
    error: float = 0.0
    id: int = -1  # Unique triangle ID

    def __lt__(self, other):
        return self.error > other.error  # Max heap (highest error first)

    def edges(self):
        """Return the three edges as sorted tuples."""
        return [
            tuple(sorted([self.v0, self.v1])),
            tuple(sorted([self.v1, self.v2])),
            tuple(sorted([self.v2, self.v0]))
        ]


class AdaptiveMesh:
    """Adaptive mesh generator for spherical data with watertight guarantee."""

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
        self.edges = {}  # (v0, v1) -> midpoint_vertex_index (global edge midpoints)
        self.edge_to_triangles = {}  # edge -> set of triangle IDs
        self.triangle_id_counter = 0

    def sample_elevation(self, direction):
        """
        Sample elevation at a given direction (unit vector).

        Args:
            direction: (x, y, z) unit vector

        Returns:
            Elevation value
        """
        # Convert to spherical coordinates
        theta = np.arccos(np.clip(direction[2], -1, 1))  # colatitude
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
            tri = Triangle(f[0], f[1], f[2], id=self.triangle_id_counter)
            self.triangle_id_counter += 1
            self.triangles.append(tri)

            # Register edges
            for edge in tri.edges():
                if edge not in self.edge_to_triangles:
                    self.edge_to_triangles[edge] = set()
                self.edge_to_triangles[edge].add(tri.id)

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

            # Inverse distance weighting
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

    def subdivide_triangle_conforming(self, tri):
        """
        Subdivide a triangle in a way that conforms to already-subdivided edges.

        Returns list of new triangles based on which edges are subdivided.
        """
        edges = tri.edges()
        edge01, edge12, edge20 = edges

        # Check which edges are already subdivided
        has_m01 = edge01 in self.edges
        has_m12 = edge12 in self.edges
        has_m20 = edge20 in self.edges

        # Count subdivided edges
        subdivided_count = sum([has_m01, has_m12, has_m20])

        if subdivided_count == 0:
            # No edges subdivided yet - do full 1-to-4 subdivision
            m01 = self.get_midpoint(tri.v0, tri.v1)
            m12 = self.get_midpoint(tri.v1, tri.v2)
            m20 = self.get_midpoint(tri.v2, tri.v0)

            return [
                Triangle(tri.v0, m01, m20, id=self.triangle_id_counter),
                Triangle(tri.v1, m12, m01, id=self.triangle_id_counter + 1),
                Triangle(tri.v2, m20, m12, id=self.triangle_id_counter + 2),
                Triangle(m01, m12, m20, id=self.triangle_id_counter + 3)
            ], 4

        elif subdivided_count == 1:
            # One edge subdivided - do 1-to-2 bisection
            if has_m01:
                m01 = self.edges[edge01]
                return [
                    Triangle(tri.v0, m01, tri.v2, id=self.triangle_id_counter),
                    Triangle(m01, tri.v1, tri.v2, id=self.triangle_id_counter + 1)
                ], 2
            elif has_m12:
                m12 = self.edges[edge12]
                return [
                    Triangle(tri.v1, m12, tri.v0, id=self.triangle_id_counter),
                    Triangle(m12, tri.v2, tri.v0, id=self.triangle_id_counter + 1)
                ], 2
            else:  # has_m20
                m20 = self.edges[edge20]
                return [
                    Triangle(tri.v2, m20, tri.v1, id=self.triangle_id_counter),
                    Triangle(m20, tri.v0, tri.v1, id=self.triangle_id_counter + 1)
                ], 2

        elif subdivided_count == 2:
            # Two edges subdivided - do 1-to-3 subdivision
            if not has_m01:
                m12 = self.edges[edge12]
                m20 = self.edges[edge20]
                return [
                    Triangle(tri.v0, tri.v1, m20, id=self.triangle_id_counter),
                    Triangle(tri.v1, m12, m20, id=self.triangle_id_counter + 1),
                    Triangle(m20, m12, tri.v2, id=self.triangle_id_counter + 2)
                ], 3
            elif not has_m12:
                m01 = self.edges[edge01]
                m20 = self.edges[edge20]
                return [
                    Triangle(tri.v1, tri.v2, m01, id=self.triangle_id_counter),
                    Triangle(tri.v2, m20, m01, id=self.triangle_id_counter + 1),
                    Triangle(m01, m20, tri.v0, id=self.triangle_id_counter + 2)
                ], 3
            else:  # not has_m20
                m01 = self.edges[edge01]
                m12 = self.edges[edge12]
                return [
                    Triangle(tri.v2, tri.v0, m12, id=self.triangle_id_counter),
                    Triangle(tri.v0, m01, m12, id=self.triangle_id_counter + 1),
                    Triangle(m12, m01, tri.v1, id=self.triangle_id_counter + 2)
                ], 3

        else:  # subdivided_count == 3
            # All edges already subdivided - do 1-to-4 subdivision
            m01 = self.edges[edge01]
            m12 = self.edges[edge12]
            m20 = self.edges[edge20]

            return [
                Triangle(tri.v0, m01, m20, id=self.triangle_id_counter),
                Triangle(tri.v1, m12, m01, id=self.triangle_id_counter + 1),
                Triangle(tri.v2, m20, m12, id=self.triangle_id_counter + 2),
                Triangle(m01, m12, m20, id=self.triangle_id_counter + 3)
            ], 4

    def generate(self, max_vertices=100000, error_threshold=10.0, min_edge_length=None):
        """
        Generate watertight adaptive mesh.

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
        if min_edge_length is None:
            min_edge_length = np.pi / 4320  # Conservative: 2x Nyquist

        print(f"Generating watertight adaptive mesh...")
        print(f"Max vertices: {max_vertices}")
        print(f"Error threshold: {error_threshold}m")
        print(f"Min edge length: {min_edge_length:.6f} rad ({np.degrees(min_edge_length):.4f}°)")

        # Build priority queue with initial triangles
        pq = []
        tri_dict = {}  # triangle_id -> Triangle object

        for tri in self.triangles:
            tri.error = self.compute_triangle_error(tri)
            heapq.heappush(pq, tri)
            tri_dict[tri.id] = tri

        iteration = 0
        while pq and len(self.vertices) < max_vertices:
            # Get triangle with highest error
            tri = heapq.heappop(pq)

            # Check if this triangle is still valid (not already subdivided)
            if tri.id not in tri_dict:
                continue

            if tri.error < error_threshold:
                # Error is acceptable, stop refining
                break

            # Check edge length (Nyquist limit)
            v0 = np.array(self.vertices[tri.v0])
            v1 = np.array(self.vertices[tri.v1])
            v2 = np.array(self.vertices[tri.v2])

            edge_len_01 = np.arccos(np.clip(np.dot(v0, v1), -1, 1))
            edge_len_12 = np.arccos(np.clip(np.dot(v1, v2), -1, 1))
            edge_len_20 = np.arccos(np.clip(np.dot(v2, v0), -1, 1))
            max_edge = max(edge_len_01, edge_len_12, edge_len_20)

            if max_edge < min_edge_length:
                # Too small, would violate Nyquist limit
                continue

            # Subdivide triangle (conforming to neighbor subdivisions)
            new_tris, num_new = self.subdivide_triangle_conforming(tri)

            if len(self.vertices) + num_new > max_vertices:
                # Would exceed vertex limit
                break

            self.triangle_id_counter += num_new

            # Remove old triangle from tracking
            for edge in tri.edges():
                self.edge_to_triangles[edge].discard(tri.id)
            del tri_dict[tri.id]

            # Add new triangles
            for new_tri in new_tris:
                new_tri.error = self.compute_triangle_error(new_tri)
                heapq.heappush(pq, new_tri)
                tri_dict[new_tri.id] = new_tri

                # Register new triangle edges
                for edge in new_tri.edges():
                    if edge not in self.edge_to_triangles:
                        self.edge_to_triangles[edge] = set()
                    self.edge_to_triangles[edge].add(new_tri.id)

            iteration += 1
            if iteration % 1000 == 0:
                print(f"Iteration {iteration}: {len(self.vertices)} vertices, "
                      f"{len(pq)} triangles in queue, error={tri.error:.2f}m")

        # Collect final triangles
        self.triangles = list(tri_dict.values())

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

    parser = argparse.ArgumentParser(description='Generate watertight adaptive mesh for spherical harmonics')
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
