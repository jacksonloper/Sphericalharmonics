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


@dataclass
class Triangle:
    """Triangle for adaptive subdivision."""
    v0: int
    v1: int
    v2: int
    error: float = 0.0

    def __lt__(self, other):
        return self.error > other.error  # Max heap


class AdaptiveMeshConvex:
    """Adaptive mesh generator using convex hull for guaranteed watertightness."""

    def __init__(self, healpix_data, nside):
        self.healpix_data = healpix_data
        self.nside = nside
        self.vertices = []  # List of (x, y, z) unit vectors
        self.elevations = []  # Elevation at each vertex
        self.edge_midpoints = {}  # Cache: (v0, v1) -> midpoint_index
        self.triangles_to_check = []  # Priority queue of triangles

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

    def get_midpoint(self, v0_idx, v1_idx):
        """Get or create edge midpoint."""
        edge = tuple(sorted([v0_idx, v1_idx]))

        if edge in self.edge_midpoints:
            return self.edge_midpoints[edge]

        v0 = np.array(self.vertices[v0_idx])
        v1 = np.array(self.vertices[v1_idx])
        mid = (v0 + v1) / 2.0
        mid_idx = self.add_vertex(mid[0], mid[1], mid[2])

        self.edge_midpoints[edge] = mid_idx
        return mid_idx

    def compute_triangle_error(self, tri):
        """Compute error for a triangle."""
        v0 = np.array(self.vertices[tri.v0])
        v1 = np.array(self.vertices[tri.v1])
        v2 = np.array(self.vertices[tri.v2])

        e0 = self.elevations[tri.v0]
        e1 = self.elevations[tri.v1]
        e2 = self.elevations[tri.v2]

        # Test points: centroid and edge midpoints
        test_points = [
            (v0 + v1 + v2) / 3.0,  # Centroid
            (v0 + v1) / 2.0,
            (v1 + v2) / 2.0,
            (v2 + v0) / 2.0,
        ]

        max_error = 0.0
        for point in test_points:
            point = point / np.linalg.norm(point)
            actual = self.sample_elevation(point)

            # Inverse distance weighted interpolation
            d0 = np.linalg.norm(point - v0)
            d1 = np.linalg.norm(point - v1)
            d2 = np.linalg.norm(point - v2)

            w0 = 1.0 / (d0 + 1e-10)
            w1 = 1.0 / (d1 + 1e-10)
            w2 = 1.0 / (d2 + 1e-10)
            total_w = w0 + w1 + w2

            interpolated = (w0 * e0 + w1 * e1 + w2 * e2) / total_w
            error = abs(actual - interpolated)
            max_error = max(max_error, error)

        return max_error

    def triangle_max_edge_length(self, tri):
        """Get max edge length of triangle."""
        v0 = np.array(self.vertices[tri.v0])
        v1 = np.array(self.vertices[tri.v1])
        v2 = np.array(self.vertices[tri.v2])

        e01 = np.arccos(np.clip(np.dot(v0, v1), -1, 1))
        e12 = np.arccos(np.clip(np.dot(v1, v2), -1, 1))
        e20 = np.arccos(np.clip(np.dot(v2, v0), -1, 1))

        return max(e01, e12, e20)

    def initialize_icosahedron(self):
        """Create initial icosahedron vertices and triangles."""
        t = (1.0 + np.sqrt(5.0)) / 2.0

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

        import heapq
        for f in faces:
            tri = Triangle(f[0], f[1], f[2])
            tri.error = self.compute_triangle_error(tri)
            heapq.heappush(self.triangles_to_check, tri)

    def subdivide_triangle(self, tri):
        """Subdivide a triangle into 4 sub-triangles."""
        # Get edge midpoints (creates vertices if needed)
        m01 = self.get_midpoint(tri.v0, tri.v1)
        m12 = self.get_midpoint(tri.v1, tri.v2)
        m20 = self.get_midpoint(tri.v2, tri.v0)

        # Create 4 new triangles
        return [
            Triangle(tri.v0, m01, m20),
            Triangle(tri.v1, m12, m01),
            Triangle(tri.v2, m20, m12),
            Triangle(m01, m12, m20)
        ]

    def generate(self, max_vertices=100000, error_threshold=10.0, min_edge_length=None):
        """
        Generate adaptive vertices by subdividing triangles.

        Args:
            max_vertices: Maximum number of vertices
            error_threshold: Error threshold in meters
            min_edge_length: Minimum edge length (Nyquist limit)
        """
        import heapq

        self.initialize_icosahedron()

        if min_edge_length is None:
            min_edge_length = np.pi / 4320  # 2x Nyquist for lmax=2160

        print(f"Generating adaptive vertices...")
        print(f"Max vertices: {max_vertices}")
        print(f"Error threshold: {error_threshold}m")
        print(f"Min edge length: {min_edge_length:.6f} rad ({np.degrees(min_edge_length):.4f}°)")

        iteration = 0
        while self.triangles_to_check and len(self.vertices) < max_vertices:
            # Get triangle with highest error
            tri = heapq.heappop(self.triangles_to_check)

            if tri.error < error_threshold:
                # Error acceptable, don't subdivide further
                continue

            # Check edge length (Nyquist limit)
            max_edge = self.triangle_max_edge_length(tri)
            if max_edge < min_edge_length:
                continue

            # Would subdivision exceed vertex limit?
            if len(self.vertices) + 3 > max_vertices:
                break

            # Subdivide into 4 triangles
            new_tris = self.subdivide_triangle(tri)

            # Compute errors and add to queue
            for new_tri in new_tris:
                new_tri.error = self.compute_triangle_error(new_tri)
                heapq.heappush(self.triangles_to_check, new_tri)

            iteration += 1
            if iteration % 1000 == 0:
                print(f"Iteration {iteration}: {len(self.vertices)} vertices, "
                      f"{len(self.triangles_to_check)} triangles in queue, error={tri.error:.2f}m")

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
