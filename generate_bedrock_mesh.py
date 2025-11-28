#!/usr/bin/env python3
"""
Generate a subdivided icosahedral mesh with bedrock harmonics baked in.
Format suitable for Three.js loading.
"""

import struct
import numpy as np
import json
from pathlib import Path

def load_bshc_float32(filepath):
    """Load .bshc file in float32 format."""
    with open(filepath, 'rb') as f:
        data = np.fromfile(f, dtype=np.float32)
    metadata = data[0]
    max_degree = int(data[1])
    coefficients = data[2:]
    return metadata, max_degree, coefficients

def icosahedron_vertices():
    """Generate vertices of a regular icosahedron."""
    phi = (1 + np.sqrt(5)) / 2  # Golden ratio

    vertices = np.array([
        [-1,  phi,  0], [ 1,  phi,  0], [-1, -phi,  0], [ 1, -phi,  0],
        [ 0, -1,  phi], [ 0,  1,  phi], [ 0, -1, -phi], [ 0,  1, -phi],
        [ phi,  0, -1], [ phi,  0,  1], [-phi,  0, -1], [-phi,  0,  1]
    ], dtype=np.float32)

    # Normalize to unit sphere
    vertices = vertices / np.linalg.norm(vertices, axis=1, keepdims=True)

    # Faces (triangles)
    faces = np.array([
        [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
        [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
        [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
        [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
    ], dtype=np.uint32)

    return vertices, faces

def subdivide_mesh(vertices, faces, num_subdivisions):
    """Subdivide triangular mesh by splitting each edge."""
    for sub in range(num_subdivisions):
        new_faces = []
        edge_cache = {}
        new_vertices = []

        for face in faces:
            v0, v1, v2 = face

            # Helper to get or create midpoint
            def get_midpoint(v1_idx, v2_idx):
                edge = tuple(sorted([v1_idx, v2_idx]))
                if edge in edge_cache:
                    return edge_cache[edge]

                # Create new vertex at midpoint
                v1 = vertices[v1_idx]
                v2 = vertices[v2_idx]
                mid = (v1 + v2) / 2
                mid = mid / np.linalg.norm(mid)  # Project to sphere

                new_idx = len(vertices) + len(new_vertices)
                new_vertices.append(mid)
                edge_cache[edge] = new_idx
                return new_idx

            # Get midpoint indices
            m01 = get_midpoint(v0, v1)
            m12 = get_midpoint(v1, v2)
            m20 = get_midpoint(v2, v0)

            # Create 4 new faces
            new_faces.extend([
                [v0, m01, m20],
                [v1, m12, m01],
                [v2, m20, m12],
                [m01, m12, m20]
            ])

        # Add new vertices
        if new_vertices:
            vertices = np.vstack([vertices, np.array(new_vertices)])

        faces = np.array(new_faces, dtype=np.uint32)
        print(f"  Subdivision {sub+1}/{num_subdivisions}: {len(vertices)} vertices, {len(faces)} faces")

    return vertices, faces

def cartesian_to_spherical(x, y, z):
    """Convert cartesian to spherical coordinates (theta, phi)."""
    theta = np.arccos(np.clip(z, -1, 1))  # [0, pi]
    phi = np.arctan2(y, x)  # [-pi, pi]
    return theta, phi

def log_factorial(n):
    """Compute log(n!) using Stirling's approximation for large n."""
    if n <= 1:
        return 0.0
    if n < 20:
        # Direct computation for small n
        result = 0.0
        for i in range(2, n + 1):
            result += np.log(i)
        return result
    else:
        # Stirling's approximation for large n
        return n * np.log(n) - n + 0.5 * np.log(2 * np.pi * n)

def associated_legendre_polynomial(l, m, x):
    """
    Compute associated Legendre polynomial P_l^m(x) using recursion.
    Works for any degree l and order m.
    """
    # Handle scalar input
    x = np.atleast_1d(x)

    # Base case: P_m^m
    if l == m:
        # P_m^m = (-1)^m * (2m-1)!! * (1-x^2)^(m/2)
        result = np.ones_like(x)
        for i in range(1, m + 1):
            result *= -(2 * i - 1)
        result *= np.power(1 - x * x, m / 2.0)
        return result

    # Base case: P_{m+1}^m
    if l == m + 1:
        return x * (2 * m + 1) * associated_legendre_polynomial(m, m, x)

    # Recursion: P_l^m = [(2l-1)*x*P_{l-1}^m - (l+m-1)*P_{l-2}^m] / (l-m)
    P_lm2 = associated_legendre_polynomial(l - 2, m, x)
    P_lm1 = associated_legendre_polynomial(l - 1, m, x)
    return ((2 * l - 1) * x * P_lm1 - (l + m - 1) * P_lm2) / (l - m)

def spherical_harmonic_real(l, m, theta, phi):
    """Evaluate real spherical harmonic Y_l^m at (theta, phi)."""
    cos_theta = np.cos(theta)
    abs_m = abs(m)

    # Normalization constant
    K = np.sqrt((2 * l + 1) / (4 * np.pi) * factorial(l - abs_m) / factorial(l + abs_m))

    # Associated Legendre polynomial
    P = associated_legendre_polynomial(l, abs_m, cos_theta)

    # Angular part
    if m > 0:
        angular = np.cos(m * phi) * np.sqrt(2)
    elif m < 0:
        angular = np.sin(abs(m) * phi) * np.sqrt(2)
    else:
        angular = 1.0

    return K * P * angular

def compute_all_normalized_legendre(l_max, x):
    """
    Compute all normalized associated Legendre functions up to degree l_max.
    These are P_l^m multiplied by normalization factors to avoid overflow.
    Returns dict with (l,m) -> normalized P_l^m values.
    Uses stable recursion relations from Numerical Recipes.
    """
    x = np.atleast_1d(x)
    sqrt_1mx2 = np.sqrt(np.clip(1 - x * x, 0, 1))

    # Store normalized functions
    P_norm = {}

    # Starting values for diagonal (m = l)
    P_norm[(0, 0)] = np.ones_like(x)

    # Compute all values using stable recursion
    for m in range(l_max + 1):
        # Diagonal element P[m, m]
        if m > 0:
            # P[m,m] = sqrt((2m+1)/(2m)) * sin(theta) * P[m-1,m-1]
            factor = np.sqrt((2 * m + 1) / (2 * m))
            P_norm[(m, m)] = factor * sqrt_1mx2 * P_norm[(m - 1, m - 1)]

        # Off-diagonal element P[m+1, m]
        if m + 1 <= l_max:
            # P[m+1,m] = sqrt(2m+3) * cos(theta) * P[m,m]
            factor = np.sqrt(2 * m + 3)
            P_norm[(m + 1, m)] = factor * x * P_norm[(m, m)]

        # General recursion for l > m+1
        for l in range(m + 2, l_max + 1):
            # Stable recursion using normalized functions
            a_lm = np.sqrt((4 * l * l - 1) / (l * l - m * m))
            b_lm = np.sqrt(((l - 1) * (l - 1) - m * m) / (4 * (l - 1) * (l - 1) - 1))

            P_norm[(l, m)] = a_lm * (x * P_norm[(l - 1, m)] - b_lm * P_norm[(l - 2, m)])

    return P_norm

def evaluate_spherical_harmonics(vertices, coefficients, max_degree):
    """Evaluate spherical harmonics at all vertices."""
    print(f"Evaluating spherical harmonics (L={max_degree}) at {len(vertices)} vertices...")

    # Convert to spherical coordinates
    theta, phi = cartesian_to_spherical(vertices[:, 0], vertices[:, 1], vertices[:, 2])
    cos_theta = np.cos(theta)

    # Pre-compute all normalized Legendre functions
    print(f"  Computing normalized Legendre functions...")
    P_norm = compute_all_normalized_legendre(max_degree, cos_theta)

    # Evaluate sum of spherical harmonics
    values = np.zeros(len(vertices), dtype=np.float32)

    idx = 0
    print(f"  Summing spherical harmonic contributions...")
    for l in range(max_degree + 1):
        if l % 50 == 0:
            print(f"    Degree {l}/{max_degree}...")
        for m in range(-l, l + 1):
            if idx >= len(coefficients):
                break

            abs_m = abs(m)

            # Get normalized Legendre function (already includes normalization)
            P_norm_lm = P_norm[(l, abs_m)]

            # Angular part and final normalization
            if m > 0:
                Y_lm = P_norm_lm * np.cos(m * phi)
            elif m < 0:
                Y_lm = P_norm_lm * np.sin(abs_m * phi)
            else:
                Y_lm = P_norm_lm

            # Add contribution
            values += coefficients[idx] * Y_lm
            idx += 1

    print(f"  Evaluated {idx} coefficients")
    print(f"  Value range: [{np.nanmin(values):.2f}, {np.nanmax(values):.2f}]")

    return values

def generate_mesh(subdivision_level=6):
    """Generate bedrock mesh."""
    print("Generating subdivided icosahedral mesh...")
    vertices, faces = icosahedron_vertices()
    print(f"Base icosahedron: {len(vertices)} vertices, {len(faces)} faces")

    vertices, faces = subdivide_mesh(vertices, faces, subdivision_level)

    print(f"\nLoading bedrock harmonics...")
    metadata, max_degree, coefficients = load_bshc_float32('sources/bed_f32_361.bshc')
    print(f"Loaded L={max_degree}, {len(coefficients)} coefficients")

    print(f"\nEvaluating bedrock topography...")
    values = evaluate_spherical_harmonics(vertices, coefficients, max_degree)

    # Scale vertices by |value| for radius
    radii = np.abs(values)
    max_radius = np.max(radii)
    print(f"Radius range: [0, {max_radius:.2f}]")

    # Normalize radius to reasonable range (e.g., 0.5 to 1.5)
    radii_normalized = 1.0 + (radii / max_radius) * 0.5

    # Position vertices
    positions = vertices * radii_normalized[:, np.newaxis]

    # Colors based on sign (blue for negative, orange for positive)
    colors = np.zeros((len(vertices), 3), dtype=np.float32)
    positive_mask = values >= 0
    colors[positive_mask] = [1.0, 0.42, 0.21]   # Orange (#ff6b35)
    colors[~positive_mask] = [0.31, 0.80, 0.77]  # Teal (#4ecdc4)

    return positions, colors, faces, values

def save_mesh_json(positions, colors, faces, values, output_path):
    """Save mesh in JSON format for Three.js."""
    mesh_data = {
        'metadata': {
            'version': 1.0,
            'type': 'BedrockMesh',
            'generator': 'generate_bedrock_mesh.py'
        },
        'positions': positions.flatten().tolist(),
        'colors': colors.flatten().tolist(),
        'indices': faces.flatten().tolist(),
        'values': values.tolist(),
        'vertexCount': len(positions),
        'faceCount': len(faces)
    }

    with open(output_path, 'w') as f:
        json.dump(mesh_data, f)

    size_mb = Path(output_path).stat().st_size / 1024 / 1024
    print(f"\nSaved JSON mesh: {output_path}")
    print(f"  Size: {size_mb:.2f} MB")

def save_mesh_binary(positions, colors, faces, values, output_path):
    """Save mesh in binary format for Three.js."""
    with open(output_path, 'wb') as f:
        # Header
        f.write(struct.pack('I', len(positions)))  # vertex count
        f.write(struct.pack('I', len(faces)))      # face count

        # Positions (3 floats per vertex)
        f.write(positions.astype(np.float32).tobytes())

        # Colors (3 floats per vertex)
        f.write(colors.astype(np.float32).tobytes())

        # Indices (3 uints per face)
        f.write(faces.astype(np.uint32).tobytes())

        # Values (1 float per vertex)
        f.write(values.astype(np.float32).tobytes())

    size_mb = Path(output_path).stat().st_size / 1024 / 1024
    print(f"\nSaved binary mesh: {output_path}")
    print(f"  Size: {size_mb:.2f} MB")

if __name__ == '__main__':
    import sys

    # Default: subdivision level 5 (~10k vertices)
    # Level 6 gives ~40k vertices for higher detail
    subdivision = 5 if len(sys.argv) < 2 else int(sys.argv[1])

    print(f"Generating mesh with subdivision level {subdivision}")
    print("(Use: python generate_bedrock_mesh.py [subdivision_level])")
    print()

    positions, colors, faces, values = generate_mesh(subdivision_level=subdivision)

    # Save in both formats
    save_mesh_json(positions, colors, faces, values, f'sources/bedrock_mesh_sub{subdivision}.json')
    save_mesh_binary(positions, colors, faces, values, f'sources/bedrock_mesh_sub{subdivision}.bin')

    print("\nDone!")
