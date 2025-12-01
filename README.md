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

### 🌍 Earth Topography

Earth surface elevation rendered using spherical harmonic decomposition on a subdivided icosahedron.

- Select different harmonic truncation levels (lmax: 4 to 2160) to see approximation quality
- Higher lmax values include more coefficients for finer detail
- Visualizes how spherical harmonics can represent real-world geographic data
- Interactive time-of-day lighting based on your timezone
- Relief slider to adjust topographic exaggeration

### 🪨 Bedrock Elevation

Earth's bedrock topography including ocean bathymetry and sub-ice terrain, visualized with spherical harmonics.

- Green indicates elevation above sea level
- Blue shows areas below sea level (ocean floors, sub-ice topography)
- Reveals the true shape of Earth's crust beneath water and ice
- Adjustable relief to emphasize topographic features

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

### Earth & Bedrock Specific
- Icosahedral mesh with adaptive subdivision levels
- Spherical harmonic coefficient-based topography (BSHC format)
- Real geographic data visualization
- Color-coded elevation mapping
- Relief control for topographic exaggeration
- Selectable truncation levels (lmax) to compare approximations

## Technical Details

### Spherical Harmonics

**SH Flow Demo:**
- Uses real spherical harmonics up to l=3 (f orbitals)
- l=1 (p orbitals): 3 coefficients
- l=2 (d orbitals): 5 coefficients
- l=3 (f orbitals): 7 coefficients
- Total: 15 active coefficients evolving on the 14-sphere
- l=0 term (Y₀⁰) fixed at 0 for balanced red/blue coloring

**Earth & Bedrock Demos:**
- Variable truncation levels from lmax=4 to lmax=2160
- Higher lmax provides more detail: lmax=2160 uses over 4.5 million coefficients
- Data stored in BSHC (spherical harmonic coefficient) format
- Demonstrates approximation quality at different resolutions

### Physics Simulation (SH Flow)
Ornstein-Uhlenbeck process for smooth, organic motion:
- Gaussian noise generation (Box-Muller transform)
- Frame-rate independent timestep (capped at 100ms)
- Sphere constraint via normalization after each update
- Proper Wiener process scaling: `σ√dt`

### Rendering

**All Demos:**
- WebGL with Three.js
- Custom GLSL shaders for spherical harmonic evaluation
- Vertex displacement based on harmonic functions

**SH Flow:**
- Base geometry: Icosahedron with 64 subdivisions
- Two-point lighting (key + fill) with ambient
- Vertex displacement: `r = |f(θ,φ)| × scale`

**Earth & Bedrock:**
- Procedurally generated icosahedral mesh (2-9 subdivision levels)
- Adaptive subdivision based on Nyquist frequency: `sqrt(vertices)/2 >= lmax`
- Web Worker support for large meshes (subdivision >= 7)
- Dynamic time-of-day lighting (Earth only)

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

### Earth & Bedrock Settings
- **lmax**: Select truncation level (4, 8, 16, 32, 64, 128, 360, 2160)
- **Relief**: Adjust topographic exaggeration
- **Wireframe**: Toggle wireframe rendering
- **Axes**: Show/hide polar axis and equator ring
- **Time slider** (Earth only): Adjust sun position (0-24 hours)

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
