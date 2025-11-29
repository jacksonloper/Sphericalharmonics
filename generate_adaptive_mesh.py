#!/usr/bin/env python3
"""
Generate a watertight adaptive mesh using convex hull.

Strategy:
1. Generate vertices adaptively based on error
2. Use trimesh.convex_hull() to create watertight triangulation
3. Since all points are on a sphere, convex hull = sphere triangulation
"""

import numpy as np
import healpy as hp
import struct
import trimesh
from dataclasses import dataclass
from typing import Set


class AdaptiveMeshConvex:
    """Adaptive mesh generator using convex hull for guaranteed watertightness."""

    def __init__(self, healpix_data, nside):
        self.healpix_data = healpix_data
        self.nside = nside
        self.vertices = []  # List of (x, y, z) unit vectors
        self.elevations = []  # Elevation at each vertex
        self.edges_to_subdivide = set()  # Edges that need subdivision

    def sample_elevation(self, direction):
        """Sample elevation at a direction (unit vector)."""
        theta = np.arccos(np.clip(direction[2], -1, 1))
        phi = np.arctan2(direction[1], direction[0])
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

    def edge_error(self, v0_idx, v1_idx):
        """
        Compute error along an edge.

        Checks how well linear interpolation represents the midpoint.
        """
        v0 = np.array(self.vertices[v0_idx])
        v1 = np.array(self.vertices[v1_idx])
        e0 = self.elevations[v0_idx]
        e1 = self.elevations[v1_idx]

        # Midpoint on sphere
        mid = (v0 + v1) / 2.0
        mid = mid / np.linalg.norm(mid)

        # Actual elevation at midpoint
        actual = self.sample_elevation(mid)

        # Interpolated elevation
        interpolated = (e0 + e1) / 2.0

        return abs(actual - interpolated)

    def edge_length(self, v0_idx, v1_idx):
        """Compute edge length (angular distance)."""
        v0 = np.array(self.vertices[v0_idx])
        v1 = np.array(self.vertices[v1_idx])
        return np.arccos(np.clip(np.dot(v0, v1), -1, 1))

    def initialize_icosahedron(self):
        """Create initial icosahedron vertices."""
        t = (1.0 + np.sqrt(5.0)) / 2.0

        vertices = [
            (-1,  t,  0), ( 1,  t,  0), (-1, -t,  0), ( 1, -t,  0),
            ( 0, -1,  t), ( 0,  1,  t), ( 0, -1, -t), ( 0,  1, -t),
            ( t,  0, -1), ( t,  0,  1), (-t,  0, -1), (-t,  0,  1)
        ]

        for v in vertices:
            self.add_vertex(v[0], v[1], v[2])

        # Initial edges (30 edges in icosahedron)
        edges = [
            (0, 1), (0, 5), (0, 7), (0, 10), (0, 11),
            (1, 5), (1, 7), (1, 8), (1, 9),
            (2, 3), (2, 4), (2, 6), (2, 10), (2, 11),
            (3, 4), (3, 6), (3, 8), (3, 9),
            (4, 5), (4, 9), (4, 11),
            (5, 9), (5, 11),
            (6, 7), (6, 8), (6, 10),
            (7, 8), (7, 10),
            (8, 9),
            (10, 11)
        ]

        for edge in edges:
            self.edges_to_subdivide.add(tuple(sorted(edge)))

    def generate(self, max_vertices=100000, error_threshold=10.0, min_edge_length=None):
        """
        Generate adaptive vertices.

        Args:
            max_vertices: Maximum number of vertices
            error_threshold: Error threshold in meters
            min_edge_length: Minimum edge length (Nyquist limit)
        """
        self.initialize_icosahedron()

        if min_edge_length is None:
            min_edge_length = np.pi / 4320  # 2x Nyquist for lmax=2160

        print(f"Generating adaptive vertices...")
        print(f"Max vertices: {max_vertices}")
        print(f"Error threshold: {error_threshold}m")
        print(f"Min edge length: {min_edge_length:.6f} rad ({np.degrees(min_edge_length):.4f}°)")

        iteration = 0
        while self.edges_to_subdivide and len(self.vertices) < max_vertices:
            # Get next edge to check
            edge = self.edges_to_subdivide.pop()
            v0_idx, v1_idx = edge

            # Check error
            error = self.edge_error(v0_idx, v1_idx)

            if error < error_threshold:
                continue

            # Check edge length (Nyquist)
            edge_len = self.edge_length(v0_idx, v1_idx)
            if edge_len < min_edge_length:
                continue

            # Subdivide edge
            if len(self.vertices) >= max_vertices:
                break

            # Create midpoint
            v0 = np.array(self.vertices[v0_idx])
            v1 = np.array(self.vertices[v1_idx])
            mid = (v0 + v1) / 2.0
            mid_idx = self.add_vertex(mid[0], mid[1], mid[2])

            # Add new edges to check
            edge0 = tuple(sorted([v0_idx, mid_idx]))
            edge1 = tuple(sorted([mid_idx, v1_idx]))

            self.edges_to_subdivide.add(edge0)
            self.edges_to_subdivide.add(edge1)

            iteration += 1
            if iteration % 1000 == 0:
                print(f"Iteration {iteration}: {len(self.vertices)} vertices, "
                      f"{len(self.edges_to_subdivide)} edges to check, error={error:.2f}m")

        print(f"\nVertex generation complete!")
        print(f"Vertices: {len(self.vertices)}")

    def create_convex_hull(self):
        """
        Create watertight triangulation using convex hull.

        Returns trimesh object.
        """
        print(f"\nCreating convex hull triangulation...")

        vertices_array = np.array(self.vertices, dtype=np.float64)

        # Create convex hull - guaranteed watertight!
        hull = trimesh.Trimesh(vertices=vertices_array).convex_hull

        print(f"Hull: {len(hull.vertices)} vertices, {len(hull.faces)} faces")
        print(f"Is watertight: {hull.is_watertight}")
        print(f"Is winding consistent: {hull.is_winding_consistent}")

        # Map elevations to hull vertices
        # Hull may have reordered/deduplicated vertices
        hull_elevations = np.zeros(len(hull.vertices))

        for i, hull_vertex in enumerate(hull.vertices):
            # Find closest original vertex
            hull_vertex_norm = hull_vertex / np.linalg.norm(hull_vertex)

            # Since we're on unit sphere, can use dot product
            dots = np.array([np.dot(hull_vertex_norm, v) for v in self.vertices])
            closest_idx = np.argmax(dots)

            hull_elevations[i] = self.elevations[closest_idx]

        return hull, hull_elevations

    def save(self, filename, hull, hull_elevations):
        """Save mesh to binary file."""
        print(f"\nSaving to {filename}...")

        with open(filename, 'wb') as f:
            # Header
            f.write(b'ADAMESH')
            f.write(struct.pack('B', 1))  # Version

            # Counts
            f.write(struct.pack('I', len(hull.vertices)))
            f.write(struct.pack('I', len(hull.faces)))

            # Vertices (x, y, z)
            for v in hull.vertices:
                f.write(struct.pack('fff', v[0], v[1], v[2]))

            # Elevations
            for e in hull_elevations:
                f.write(struct.pack('f', e))

            # Triangles
            for face in hull.faces:
                f.write(struct.pack('III', face[0], face[1], face[2]))

        file_size = len(open(filename, 'rb').read())
        print(f"Saved {len(hull.vertices)} vertices, {len(hull.faces)} triangles")
        print(f"File size: {file_size / 1024 / 1024:.2f} MB")


def main():
    import argparse

    parser = argparse.ArgumentParser(description='Generate watertight adaptive mesh via convex hull')
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

    # Load HEALPix data
    print(f"Loading HEALPix data from {args.input}...")
    healpix_data = np.fromfile(args.input, dtype='<f4')

    npix = len(healpix_data)
    expected_npix = hp.nside2npix(args.nside)
    if npix != expected_npix:
        args.nside = int(np.sqrt(npix / 12))
        print(f"Warning: Inferred nside={args.nside} from file size ({npix} pixels)")

    print(f"Loaded {npix} HEALPix pixels (nside={args.nside})")
    print(f"Elevation range: {healpix_data.min():.1f} to {healpix_data.max():.1f} meters")

    # Generate adaptive mesh
    mesh = AdaptiveMeshConvex(healpix_data, args.nside)
    mesh.generate(
        max_vertices=args.max_vertices,
        error_threshold=args.error_threshold
    )

    # Create convex hull
    hull, hull_elevations = mesh.create_convex_hull()

    # Save
    mesh.save(args.output, hull, hull_elevations)

    print("\n✓ Watertight mesh generated successfully!")


if __name__ == '__main__':
    main()
