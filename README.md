# Spherical Harmonics Visualizations

Interactive 3D visualizations demonstrating spherical harmonic functions through WebGL and custom shaders.

**[View Live Demo](https://comfy-quokka-337655.netlify.app)**

## Demos

### 🌊 SH Flow (Lava Lamp)

A real-time 3D shape with coefficients evolving via an Ornstein-Uhlenbeck process, creating organic, lava lamp-like morphing.

- **Position** `x ∈ R¹⁵` represents 15 spherical harmonic coefficients (l=1 through l=3)
- **Velocity** `v ∈ R¹⁵` evolves via Ornstein-Uhlenbeck process: `dv = -θv dt + σ√dt dW`
- Position updates as `x += v dt`, then is normalized to remain on the 14-sphere
- The shape's radius at each direction is `r = |f(θ,φ)|` where f is the spherical harmonic function
- Colors indicate sign: red/orange for positive values, teal/blue for negative

### 📊 ETOPO Range

Earth surface elevation range (min to max) for each HEALPix cell, visualizing terrain roughness and topographic diversity.

- Each line segment shows the elevation variation within a region
- Color-coded by elevation using the turbo colormap
- Multiple resolution levels (HEALPix 64, 128, 256)
- Circular dots at HEALPix cell centers
- Interactive camera controls

## Features

### Common Features (All Demos)
- Real-time WebGL rendering with Three.js
- Custom GLSL shaders for spherical harmonic evaluation
- Smooth camera controls (orbit, zoom, pan)
- Mobile-friendly touch controls
- Responsive design

### SH Flow Specific
- **Physics Controls**
  - **θ (theta)**: Mean reversion rate (0-2) - controls damping/smoothness
  - **σ (sigma)**: Volatility/noise (0-1) - controls chaos/energy
- Hamburger menu for parameter adjustment
- Optional wireframe mode
- Live coefficient display (all 15 values)
- Dual-light setup with ambient lighting

### ETOPO Range Specific
- HEALPix grid-based elevation data
- Multiple resolution options (64, 128, 256)
- Min/mean/max elevation per cell
- Range visualization with line segments
- Turbo colormap for elevation coding
- Optional grid dots and axes visualization

## Technical Details

### Spherical Harmonics

**SH Flow Demo:**
- Uses real spherical harmonics up to l=3 (f orbitals)
- l=1 (p orbitals): 3 coefficients
- l=2 (d orbitals): 5 coefficients
- l=3 (f orbitals): 7 coefficients
- Total: 15 active coefficients evolving on the 14-sphere
- l=0 term (Y₀⁰) fixed at 0 for balanced red/blue coloring

**ETOPO Range Demo:**
- HEALPix grid representation at multiple resolutions
- Each cell stores min, mean, and max elevation
- Data derived from ETOPO 2022 15 Arc-Second Global Relief Model
- Visualizes terrain roughness and topographic diversity

### Physics Simulation (SH Flow)
Ornstein-Uhlenbeck process for smooth, organic motion:
- Gaussian noise generation (Box-Muller transform)
- Frame-rate independent timestep (capped at 100ms)
- Sphere constraint via normalization after each update
- Proper Wiener process scaling: `σ√dt`

### Rendering

**All Demos:**
- WebGL with Three.js
- Custom GLSL shaders where applicable
- Interactive camera controls

**SH Flow:**
- Base geometry: Icosahedron with 64 subdivisions
- Two-point lighting (key + fill) with ambient
- Vertex displacement: `r = |f(θ,φ)| × scale`
- Custom GLSL shaders for spherical harmonic evaluation

**ETOPO Range:**
- Line segments representing elevation ranges
- Circular dots at HEALPix cell centers
- Color mapping using turbo colormap
- Efficient instanced rendering for thousands of elements

## Controls

### Camera (All Demos)

**Desktop:**
- **Left-click + drag**: Rotate view
- **Scroll**: Zoom in/out
- **Right-click + drag**: Pan camera

**Mobile:**
- **One finger drag**: Rotate view
- **Pinch**: Zoom in/out
- **Two finger drag**: Pan camera

### SH Flow Settings
- **Hamburger button (⋮)**: Opens settings menu
- **θ (theta)**: Mean reversion rate slider
- **σ (sigma)**: Volatility slider
- **Wireframe**: Toggle wireframe rendering
- **Max Harmonic Order**: Adjust active spherical harmonic levels

### ETOPO Range Settings
- **Resolution**: Select HEALPix resolution (64, 128, 256)
- **Show Dots**: Toggle circular dots at cell centers
- **Show Axes**: Toggle polar axis and equator ring
- **Auto-rotate**: Toggle automatic rotation

## Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Deployment

Configured for Netlify deployment:
- Build command: `npm run build`
- Publish directory: `dist`
- Live at: https://comfy-quokka-337655.netlify.app

## Built With

- [Three.js](https://threejs.org/) - 3D graphics library
- [Vite](https://vitejs.dev/) - Build tool and dev server
- Custom GLSL shaders for spherical harmonic evaluation

## License

MIT
