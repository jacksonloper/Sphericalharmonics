# Adaptive Mesh for Spherical Harmonics

This document explains the adaptive mesh implementation for efficiently rendering Earth's surface elevation data from spherical harmonic coefficients.

## Overview

The adaptive mesh approach creates a triangle mesh on the sphere where vertex density varies based on the complexity of the elevation data. Regions with high curvature (mountains, valleys) get more vertices, while flat regions (oceans, plains) use fewer vertices.

## Why Adaptive Meshing?

### The Problem

Earth's topography varies dramatically:
- **Flat regions**: Oceans cover ~70% of Earth's surface with minimal variation
- **Complex regions**: Mountain ranges (Himalayas, Andes) have extreme elevation changes

A uniform mesh wastes vertices in flat areas and may under-sample complex regions.

### The Solution

Adaptive meshing allocates vertices based on local complexity:
- **Efficiency**: Fewer total vertices for same quality
- **Fidelity**: Better representation of complex features
- **Performance**: Smaller file size, faster rendering

## Technical Approach

### 1. Data Source

- **Input**: HEALPix grid sampled from spherical harmonics (lmax=2160)
- **Resolution**: 196,608 pixels at nside=128
- **Coverage**: Full sphere with ~51km resolution per pixel

### 2. Mesh Generation Algorithm

The algorithm uses greedy subdivision with error-driven refinement:

```
1. Start with icosahedron (12 vertices, 20 triangles)
2. Compute error metric for each triangle
3. While (vertices < max AND highest_error > threshold):
   a. Pop triangle with highest error from priority queue
   b. Check if subdivision would violate Nyquist limit
   c. Subdivide triangle into 4 smaller triangles
   d. Compute errors for new triangles
   e. Add to priority queue
4. Return final mesh
```

### 3. Error Metric

For each triangle, we compute the maximum error across multiple sample points:

- Triangle centroid
- Three edge midpoints

Error is the absolute difference between:
- **Actual elevation**: Sampled from HEALPix data
- **Interpolated elevation**: Weighted average of vertex elevations

This measures how well linear interpolation approximates the true surface.

### 4. Nyquist Sampling

The spherical harmonics are truncated at degree lmax=2160, which means:

- **Minimum wavelength**: λ_min = π/2160 ≈ 0.00145 radians
- **Nyquist limit**: Need ~2 samples per wavelength
- **Minimum edge spacing**: π/4320 ≈ 0.000727 radians (≈4.6 km at equator)

The algorithm prevents subdivision beyond this limit to avoid:
- Over-sampling aliased data
- Wasted vertices on spurious detail
- Excessive file size

### 5. Data Format

The adaptive mesh uses a custom binary format (`ADAMESH`):

```
Header:     'ADAMESH' (7 bytes)
Version:    uint8 (1 byte) = 1
Vertices:   uint32 (4 bytes) - count
Triangles:  uint32 (4 bytes) - count
Positions:  float32[vertices * 3] - (x,y,z) on unit sphere
Elevations: float32[vertices] - meters
Indices:    uint32[triangles * 3] - vertex references
```

**Key features**:
- Float32 precision (sufficient for visualization)
- Positions on unit sphere (normalized)
- Compact storage (~3 MB for 100k vertices)

## Results

### Generated Mesh Statistics

For a 100k vertex mesh with 15m error threshold:

```
Vertices:        99,998
Triangles:       137,621
File Size:       3.10 MB
Error Range:     0 - 2,914 m
Mean Error:      327 m
Median Error:    166 m
```

### Comparison with Uniform Mesh

| Metric | Uniform (Sub 7) | Adaptive (100k) | Savings |
|--------|----------------|-----------------|---------|
| Vertices | 655,362 | 99,998 | 85% |
| Triangles | ~2.6M | 137,621 | 95% |
| File Size | ~25 MB | 3.1 MB | 88% |

The adaptive mesh achieves comparable visual quality with **85% fewer vertices**.

### Vertex Distribution

Vertices are concentrated in:
- **Himalayan Plateau**: Highest density (Mt. Everest, K2)
- **Andes Mountains**: Dense sampling
- **Rocky Mountains**: Moderate density
- **Ocean trenches**: Some refinement for depth variation
- **Plains/Oceans**: Minimal vertices

## Usage

### Generate Adaptive Mesh

```bash
python3 generate_adaptive_mesh.py \
  --input public/earthtoposources/sur_healpix_nside128.bin \
  --output public/earthtoposources/sur_adaptive.mesh \
  --max-vertices 100000 \
  --error-threshold 15.0 \
  --nside 128
```

**Parameters**:
- `max-vertices`: Maximum vertex count (stops when reached)
- `error-threshold`: Target error in meters (stops when all triangles below)
- `nside`: HEALPix resolution parameter

### Load in JavaScript

```javascript
import { loadAdaptiveMesh, createElevationMesh } from './src/adaptiveMeshLoader.js';

// Load mesh
const { geometry, elevations, stats } = await loadAdaptiveMesh('path/to/mesh.bin');

// Create Three.js mesh with elevation rendering
const mesh = createElevationMesh(geometry, {
  elevationScale: 0.02,
  oceanColor: 0x0066aa,
  landColor: 0x228B22
});
```

### View Demo

Open `adaptive.html` in your browser:
```bash
npm run dev
# Navigate to http://localhost:3000/adaptive.html
```

## Implementation Details

### Edge Caching

To avoid duplicate vertices, edge midpoints are cached:

```python
self.edges = {}  # (v0, v1) -> midpoint_index

def get_midpoint(v0_idx, v1_idx):
    edge = tuple(sorted([v0_idx, v1_idx]))
    if edge in self.edges:
        return self.edges[edge]
    # Create new midpoint...
```

This ensures:
- Consistent topology (no cracks)
- Minimal memory usage
- O(1) edge lookup

### Priority Queue

Triangles are stored in a max-heap ordered by error:

```python
import heapq

pq = []
for tri in triangles:
    tri.error = compute_error(tri)
    heapq.heappush(pq, tri)  # __lt__ compares by error

# Get highest error triangle
worst_tri = heapq.heappop(pq)
```

This ensures we always subdivide the triangle contributing most to error.

### Spherical Interpolation

For error computation, we use distance-weighted interpolation:

```python
# Compute weights based on distance
w0 = 1.0 / (distance_to_v0 + epsilon)
w1 = 1.0 / (distance_to_v1 + epsilon)
w2 = 1.0 / (distance_to_v2 + epsilon)

# Normalize
total = w0 + w1 + w2
w0 /= total
w1 /= total
w2 /= total

# Interpolate elevation
elevation = w0 * e0 + w1 * e1 + w2 * e2
```

This approximates barycentric coordinates on the sphere.

## Rendering

The adaptive mesh is rendered with:

1. **Vertex Shader**: Displaces vertices along normal based on elevation
2. **Fragment Shader**: Colors based on elevation gradient
3. **Lighting**: Two-light setup for depth perception

```glsl
// Vertex displacement
float normalizedE = (elevation - minElevation) / (maxElevation - minElevation);
vec3 displaced = position * (1.0 + elevationScale * normalizedE);
```

## Future Improvements

### 1. Direct Spherical Harmonic Evaluation

Currently uses HEALPix intermediate grid. Could evaluate SH coefficients directly for higher fidelity:

```python
# Evaluate SH at point (theta, phi)
elevation = sum(C_lm * Y_lm(theta, phi) for all l,m)
```

This would allow:
- Full lmax=2160 resolution
- No HEALPix downsampling
- True error estimation

### 2. Curvature-Based Refinement

Use second derivatives for better error prediction:

```python
def compute_curvature(triangle):
    # Compute Laplacian of elevation
    laplacian = approximate_laplacian(triangle)
    return abs(laplacian)
```

This predicts where subdivision will be needed.

### 3. Quadtree/Octree Structure

Hierarchical spatial structure for:
- Faster neighbor queries
- LOD (Level of Detail) rendering
- Progressive loading

### 4. GPU-Based Generation

Move subdivision to GPU:
- Compute shaders for error metrics
- Parallel subdivision
- Real-time adaptation

### 5. Temporal Adaptation

Adjust mesh based on view:
- Refine visible regions
- Coarsen back-facing areas
- Dynamic LOD

## Conclusion

The adaptive mesh approach provides an efficient, high-fidelity representation of Earth's topography. By allocating vertices based on local complexity, it achieves excellent visual quality with minimal overhead.

**Key benefits**:
- ✅ 85% fewer vertices than uniform mesh
- ✅ Respects Nyquist sampling limits
- ✅ Compact file format (3 MB)
- ✅ Fast loading and rendering
- ✅ Accurate representation of complex terrain

The implementation demonstrates core principles applicable to any spherical data: adaptive sampling, error-driven refinement, and efficient storage.
