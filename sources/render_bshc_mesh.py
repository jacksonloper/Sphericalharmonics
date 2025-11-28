#!/usr/bin/env python3
"""
Render spherical harmonic coefficients from a .bshc file to a 3D mesh.

The mesh uses the "balloon" rendering style where:
- Radius at each direction = |f(θ, φ)| (absolute value of SH function)
- Color indicates sign: positive values get one color, negative get another

Output: GLB mesh file (sub-MB) and PNG screenshot.
"""

import numpy as np
from scipy.special import sph_harm_y
import struct
import json
import os


def create_icosahedron_subdivided(subdivisions=4):
    """
    Create a subdivided icosahedron mesh.
    
    Args:
        subdivisions: Number of subdivision iterations (4 gives ~2562 vertices)
    
    Returns:
        vertices: (N, 3) array of vertex positions on unit sphere
        faces: (M, 3) array of triangle face indices
    """
    # Golden ratio
    phi = (1.0 + np.sqrt(5.0)) / 2.0
    
    # Initial icosahedron vertices (normalized)
    vertices = np.array([
        [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0],
        [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi],
        [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1]
    ], dtype=np.float32)
    
    # Normalize to unit sphere
    vertices = vertices / np.linalg.norm(vertices, axis=1, keepdims=True)
    
    # Initial icosahedron faces
    faces = np.array([
        [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
        [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
        [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
        [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
    ], dtype=np.int32)
    
    # Subdivide
    for _ in range(subdivisions):
        vertices, faces = subdivide_mesh(vertices, faces)
    
    return vertices, faces


def subdivide_mesh(vertices, faces):
    """Subdivide each triangle into 4 triangles."""
    vertices = list(vertices)
    edge_midpoint_cache = {}
    new_faces = []
    
    def get_midpoint(v1_idx, v2_idx):
        """Get or create midpoint vertex between two vertices."""
        key = tuple(sorted([v1_idx, v2_idx]))
        if key in edge_midpoint_cache:
            return edge_midpoint_cache[key]
        
        v1 = vertices[v1_idx]
        v2 = vertices[v2_idx]
        midpoint = (v1 + v2) / 2.0
        # Normalize to unit sphere
        midpoint = midpoint / np.linalg.norm(midpoint)
        
        new_idx = len(vertices)
        vertices.append(midpoint)
        edge_midpoint_cache[key] = new_idx
        return new_idx
    
    for face in faces:
        v0, v1, v2 = face
        
        # Get midpoints
        m01 = get_midpoint(v0, v1)
        m12 = get_midpoint(v1, v2)
        m20 = get_midpoint(v2, v0)
        
        # Create 4 new triangles
        new_faces.append([v0, m01, m20])
        new_faces.append([v1, m12, m01])
        new_faces.append([v2, m20, m12])
        new_faces.append([m01, m12, m20])
    
    return np.array(vertices, dtype=np.float32), np.array(new_faces, dtype=np.int32)


def evaluate_real_spherical_harmonics(cosine_coeffs, sine_coeffs, theta, phi, max_lmax=None):
    """
    Evaluate real spherical harmonics at given angles using cosine/sine coefficients.
    
    Real SH expansion: f(θ, φ) = Σ_{l,m} [C(l,m) * Y_l^m_c(θ, φ) + S(l,m) * Y_l^m_s(θ, φ)]
    
    Where Y_l^m_c and Y_l^m_s are the real spherical harmonics:
    - Y_l^0 = P_l^0(cos θ) * normalization
    - Y_l^m_c = P_l^m(cos θ) * cos(m φ) * normalization (for m > 0)
    - Y_l^m_s = P_l^m(cos θ) * sin(m φ) * normalization (for m > 0)
    
    Args:
        cosine_coeffs: 2D array of cosine coefficients [l, m]
        sine_coeffs: 2D array of sine coefficients [l, m]
        theta: Polar angle (0 to pi) - array
        phi: Azimuthal angle (0 to 2*pi) - array
        max_lmax: Maximum l to use (if None, use all available)
    
    Returns:
        values: SH function values at each direction
    """
    lmax = cosine_coeffs.shape[0] - 1
    if max_lmax is not None:
        lmax = min(lmax, max_lmax)
    
    values = np.zeros_like(theta)
    
    for l in range(lmax + 1):
        for m in range(l + 1):
            c_lm = cosine_coeffs[l, m]
            s_lm = sine_coeffs[l, m]
            
            # Skip if both coefficients are negligible
            if abs(c_lm) < 1e-15 and abs(s_lm) < 1e-15:
                continue
            
            # scipy's sph_harm_y(l, m, theta, phi) returns the complex SH Y_l^m
            # We need real SH which are combinations of complex SH
            Y_complex = sph_harm_y(l, m, theta, phi)
            
            if m == 0:
                # For m=0, Y_l^0 is already real
                Y_real_c = np.real(Y_complex)
                values += c_lm * Y_real_c
                # S(l,0) is typically 0 by convention
            else:
                # For m > 0, real SH are combinations of complex SH.
                # scipy's sph_harm_y returns fully normalized complex SH: Y_l^m = P_l^m * exp(i*m*phi) * norm
                # Real part gives cos(m*phi) component, imaginary part gives sin(m*phi) component.
                # The sqrt(2) factor accounts for the normalization difference between
                # complex and real SH conventions.
                Y_real_c = np.sqrt(2) * np.real(Y_complex)  # cos(m*phi) component
                Y_real_s = np.sqrt(2) * np.imag(Y_complex)  # sin(m*phi) component
                
                values += c_lm * Y_real_c + s_lm * Y_real_s
    
    return values


def cartesian_to_spherical(vertices):
    """Convert Cartesian coordinates to spherical (theta, phi)."""
    x, y, z = vertices[:, 0], vertices[:, 1], vertices[:, 2]
    
    # theta: polar angle from z-axis (0 to pi)
    theta = np.arccos(np.clip(z, -1.0, 1.0))
    
    # phi: azimuthal angle in xy-plane from x-axis (0 to 2*pi)
    phi = np.arctan2(y, x)
    phi = np.where(phi < 0, phi + 2 * np.pi, phi)
    
    return theta, phi


def create_glb_mesh(vertices, faces, colors):
    """
    Create a GLB (binary glTF) mesh file.
    
    Args:
        vertices: (N, 3) vertex positions
        faces: (M, 3) triangle indices
        colors: (N, 3) vertex colors (RGB, 0-1 range)
    
    Returns:
        GLB bytes
    """
    from pygltflib import GLTF2, Scene, Node, Mesh, Primitive, Accessor, BufferView, Buffer, Asset
    
    # Prepare binary data
    vertices_flat = vertices.astype(np.float32).tobytes()
    indices_flat = faces.astype(np.uint16).flatten().tobytes()
    colors_flat = colors.astype(np.float32).tobytes()
    
    # Pad to 4-byte alignment
    def pad_to_4(data):
        padding = (4 - len(data) % 4) % 4
        return data + b'\x00' * padding
    
    vertices_flat = pad_to_4(vertices_flat)
    indices_flat = pad_to_4(indices_flat)
    colors_flat = pad_to_4(colors_flat)
    
    # Calculate offsets
    vertices_offset = 0
    vertices_length = len(vertices_flat)
    
    indices_offset = vertices_length
    indices_length = len(indices_flat)
    
    colors_offset = indices_offset + indices_length
    colors_length = len(colors_flat)
    
    # Combine all binary data
    binary_data = vertices_flat + indices_flat + colors_flat
    
    # Calculate bounds
    v_min = vertices.min(axis=0).tolist()
    v_max = vertices.max(axis=0).tolist()
    
    # Create glTF structure
    gltf = GLTF2(
        asset=Asset(version="2.0", generator="render_bshc_mesh.py"),
        scene=0,
        scenes=[Scene(nodes=[0])],
        nodes=[Node(mesh=0)],
        meshes=[Mesh(primitives=[
            Primitive(
                attributes={"POSITION": 0, "COLOR_0": 2},
                indices=1,
                mode=4  # TRIANGLES
            )
        ])],
        accessors=[
            # Position accessor
            Accessor(
                bufferView=0,
                componentType=5126,  # FLOAT
                count=len(vertices),
                type="VEC3",
                max=v_max,
                min=v_min
            ),
            # Indices accessor
            Accessor(
                bufferView=1,
                componentType=5123,  # UNSIGNED_SHORT
                count=len(faces) * 3,
                type="SCALAR"
            ),
            # Color accessor
            Accessor(
                bufferView=2,
                componentType=5126,  # FLOAT
                count=len(colors),
                type="VEC3"
            )
        ],
        bufferViews=[
            BufferView(buffer=0, byteOffset=vertices_offset, byteLength=len(vertices) * 12, target=34962),  # ARRAY_BUFFER
            BufferView(buffer=0, byteOffset=indices_offset, byteLength=len(faces) * 6, target=34963),  # ELEMENT_ARRAY_BUFFER
            BufferView(buffer=0, byteOffset=colors_offset, byteLength=len(colors) * 12, target=34962)
        ],
        buffers=[Buffer(byteLength=len(binary_data))]
    )
    
    # Create GLB
    # GLB header: magic (4) + version (4) + length (4) = 12 bytes
    # JSON chunk: length (4) + type (4) + data
    # BIN chunk: length (4) + type (4) + data
    
    json_str = gltf.to_json()
    json_bytes = json_str.encode('utf-8')
    
    # Pad JSON to 4-byte alignment
    json_padding = (4 - len(json_bytes) % 4) % 4
    json_bytes += b' ' * json_padding
    
    # Build GLB
    glb_magic = b'glTF'
    glb_version = struct.pack('<I', 2)
    
    json_chunk_type = struct.pack('<I', 0x4E4F534A)  # JSON
    bin_chunk_type = struct.pack('<I', 0x004E4942)   # BIN
    
    json_chunk_length = struct.pack('<I', len(json_bytes))
    bin_chunk_length = struct.pack('<I', len(binary_data))
    
    total_length = 12 + 8 + len(json_bytes) + 8 + len(binary_data)
    glb_length = struct.pack('<I', total_length)
    
    glb = (glb_magic + glb_version + glb_length +
           json_chunk_length + json_chunk_type + json_bytes +
           bin_chunk_length + bin_chunk_type + binary_data)
    
    return glb


def render_png_matplotlib(vertices, faces, colors, output_path, title="Spherical Harmonics"):
    """
    Render the mesh to a PNG using matplotlib.
    
    Args:
        vertices: (N, 3) vertex positions
        faces: (M, 3) triangle indices
        colors: (N, 3) vertex colors (RGB, 0-1 range)
        output_path: Path to save PNG
        title: Plot title
    """
    import matplotlib
    matplotlib.use('Agg')  # Non-interactive backend
    import matplotlib.pyplot as plt
    from mpl_toolkits.mplot3d.art3d import Poly3DCollection
    
    fig = plt.figure(figsize=(10, 10), dpi=100)
    ax = fig.add_subplot(111, projection='3d')
    
    # Create triangles with vertex colors
    triangles = vertices[faces]
    face_colors = colors[faces].mean(axis=1)  # Average vertex colors for face
    
    # Create collection
    mesh_collection = Poly3DCollection(triangles, alpha=1.0)
    mesh_collection.set_facecolor(face_colors)
    mesh_collection.set_edgecolor('none')
    
    ax.add_collection3d(mesh_collection)
    
    # Set equal aspect ratio
    max_range = np.max(np.abs(vertices)) * 1.1
    ax.set_xlim(-max_range, max_range)
    ax.set_ylim(-max_range, max_range)
    ax.set_zlim(-max_range, max_range)
    
    # Set viewing angle
    ax.view_init(elev=20, azim=45)
    
    ax.set_xlabel('X')
    ax.set_ylabel('Y')
    ax.set_zlabel('Z')
    ax.set_title(title)
    
    # Equal aspect ratio
    ax.set_box_aspect([1, 1, 1])
    
    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    plt.close()
    
    print(f"PNG saved to: {output_path}")


def load_bshc(filepath):
    """
    Load spherical harmonic coefficients from a binary .bshc file.
    
    BSHC format (as used by SHTOOLS/Curtin University):
    - File is composed of 8-byte little-endian floats
    - First two values: min_degree, max_degree (lmax)
    - Then cosine coefficients: C(0,0), C(1,0), C(1,1), C(2,0), C(2,1), ... C(lmax,lmax)
    - Then sine coefficients: S(0,0), S(1,0), S(1,1), S(2,0), S(2,1), ... S(lmax,lmax)
    
    Args:
        filepath: Path to .bshc file
    
    Returns:
        lmax: Maximum spherical harmonic degree
        cosine_coeffs: 2D array of cosine coefficients, shape (lmax+1, lmax+1)
                       cosine_coeffs[l, m] = C(l, m)
        sine_coeffs: 2D array of sine coefficients, shape (lmax+1, lmax+1)
                     sine_coeffs[l, m] = S(l, m)
    """
    with open(filepath, 'rb') as f:
        data = f.read()
    
    arr = np.frombuffer(data, dtype='<f8')  # little-endian float64
    
    # First two values are min_degree and max_degree
    min_deg = int(arr[0])
    max_deg = int(arr[1])
    lmax = max_deg
    
    # Number of coefficients for each type (cosine or sine)
    # For degrees 0 to lmax, we have: sum_{l=0}^{lmax} (l+1) = (lmax+1)(lmax+2)/2
    n_coeffs = (lmax + 1) * (lmax + 2) // 2
    
    # Extract cosine and sine coefficients
    cosine_flat = arr[2:2 + n_coeffs]
    sine_flat = arr[2 + n_coeffs:2 + 2 * n_coeffs]
    
    # Create 2D arrays indexed by [l, m]
    cosine_coeffs = np.zeros((lmax + 1, lmax + 1), dtype=np.float64)
    sine_coeffs = np.zeros((lmax + 1, lmax + 1), dtype=np.float64)
    
    # Fill in the coefficients
    # Order in file: C(0,0), C(1,0), C(1,1), C(2,0), C(2,1), C(2,2), ...
    idx = 0
    for l in range(lmax + 1):
        for m in range(l + 1):
            cosine_coeffs[l, m] = cosine_flat[idx]
            sine_coeffs[l, m] = sine_flat[idx]
            idx += 1
    
    return lmax, cosine_coeffs, sine_coeffs


def main():
    """Main function to render the bshc file to mesh."""
    import argparse
    
    parser = argparse.ArgumentParser(description='Render BSHC to mesh')
    parser.add_argument('--input', '-i', default='sources/bed.bshc', help='Input BSHC file')
    parser.add_argument('--output-mesh', '-m', default='sources/bed_mesh.glb', help='Output GLB mesh file')
    parser.add_argument('--output-png', '-p', default='sources/bed_mesh.png', help='Output PNG screenshot')
    parser.add_argument('--subdivisions', '-d', type=int, default=4, help='Icosahedron subdivisions (default: 4)')
    parser.add_argument('--max-lmax', type=int, default=8, help='Maximum L to use for SH evaluation (default: 8)')
    args = parser.parse_args()
    
    # Get script directory for relative paths
    script_dir = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.dirname(script_dir)
    
    input_path = os.path.join(repo_root, args.input) if not os.path.isabs(args.input) else args.input
    output_mesh = os.path.join(repo_root, args.output_mesh) if not os.path.isabs(args.output_mesh) else args.output_mesh
    output_png = os.path.join(repo_root, args.output_png) if not os.path.isabs(args.output_png) else args.output_png
    
    print(f"Loading BSHC file: {input_path}")
    lmax, cosine_coeffs, sine_coeffs = load_bshc(input_path)
    print(f"Loaded SH coefficients up to lmax={lmax}")
    print(f"Cosine coeff range: [{cosine_coeffs.min():.2f}, {cosine_coeffs.max():.2f}]")
    print(f"Sine coeff range: [{sine_coeffs.min():.2f}, {sine_coeffs.max():.2f}]")
    
    # Limit to max_lmax for visualization
    effective_lmax = min(lmax, args.max_lmax)
    print(f"Using lmax={effective_lmax} for visualization")
    
    # Create subdivided icosahedron
    print(f"Creating subdivided icosahedron with {args.subdivisions} subdivisions...")
    base_vertices, faces = create_icosahedron_subdivided(args.subdivisions)
    print(f"Created mesh with {len(base_vertices)} vertices and {len(faces)} faces")
    
    # Convert to spherical coordinates
    theta, phi = cartesian_to_spherical(base_vertices)
    
    # Evaluate SH function at each vertex
    print("Evaluating spherical harmonics...")
    sh_values = evaluate_real_spherical_harmonics(cosine_coeffs, sine_coeffs, theta, phi, max_lmax=effective_lmax)
    print(f"SH values range: [{sh_values.min():.2f}, {sh_values.max():.2f}]")
    
    # Balloon style: radius = |f(θ, φ)|, normalized
    radii = np.abs(sh_values)
    if radii.max() > 0:
        radii = radii / radii.max()  # Normalize to [0, 1]
    radii = np.maximum(radii, 0.1)  # Minimum radius to avoid degenerate triangles
    
    # Apply radii to vertices
    vertices = base_vertices * radii[:, np.newaxis]
    
    # Color based on sign
    # Positive: orange/red (like in the shader)
    # Negative: teal/cyan (like in the shader)
    positive_color = np.array([1.0, 0.42, 0.21])  # #ff6b35 orange
    negative_color = np.array([0.31, 0.80, 0.77])  # #4ecdc4 teal
    
    colors = np.where(sh_values[:, np.newaxis] >= 0, positive_color, negative_color)
    
    # Add some shading based on normal direction (simple directional light)
    # Compute vertex normals from face normals
    face_normals = np.cross(
        vertices[faces[:, 1]] - vertices[faces[:, 0]],
        vertices[faces[:, 2]] - vertices[faces[:, 0]]
    )
    face_normals = face_normals / (np.linalg.norm(face_normals, axis=1, keepdims=True) + 1e-10)
    
    # Accumulate face normals to vertices
    vertex_normals = np.zeros_like(vertices)
    for i, face in enumerate(faces):
        for v_idx in face:
            vertex_normals[v_idx] += face_normals[i]
    vertex_normals = vertex_normals / (np.linalg.norm(vertex_normals, axis=1, keepdims=True) + 1e-10)
    
    # Simple lighting
    light_dir = np.array([1, 1, 1])
    light_dir = light_dir / np.linalg.norm(light_dir)
    
    diffuse = np.maximum(np.dot(vertex_normals, light_dir), 0.0)
    ambient = 0.3
    lighting = ambient + (1 - ambient) * diffuse
    
    colors = colors * lighting[:, np.newaxis]
    colors = np.clip(colors, 0, 1)
    
    # Create GLB mesh
    print(f"Creating GLB mesh: {output_mesh}")
    glb_data = create_glb_mesh(vertices.astype(np.float32), faces.astype(np.int32), colors.astype(np.float32))
    
    with open(output_mesh, 'wb') as f:
        f.write(glb_data)
    
    mesh_size = len(glb_data)
    print(f"GLB size: {mesh_size / 1024:.1f} KB")
    
    if mesh_size > 1024 * 1024:
        print("Warning: Mesh is larger than 1 MB!")
    
    # Render PNG screenshot
    print(f"Rendering PNG: {output_png}")
    render_png_matplotlib(vertices, faces, colors, output_png, 
                         title=f"Spherical Harmonics (lmax={effective_lmax})")
    
    print("Done!")


if __name__ == '__main__':
    main()
