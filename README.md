# Spherical Harmonics Lava Lamp

An interactive 3D visualization of spherical harmonics evolving on a sphere via an Ornstein-Uhlenbeck process, creating organic, lava lamp-like morphing shapes.

**[View Live Demo](https://comfy-quokka-337655.netlify.app)**

## What It Does

This project renders a real-time 3D shape defined by spherical harmonic basis functions. The shape continuously morphs using physics-based motion:

- **Position** `x ∈ R¹⁵` represents 15 spherical harmonic coefficients (l=1 through l=3)
- **Velocity** `v ∈ R¹⁵` evolves via Ornstein-Uhlenbeck process: `dv = -θv dt + σ√dt dW`
- Position updates as `x += v dt`, then is normalized to remain on the 14-sphere
- The shape's radius at each direction is `r = |f(θ,φ)|` where f is the spherical harmonic function
- Colors indicate sign: red/orange for positive values, teal/blue for negative

## Features

### Visualization
- Real-time morphing 3D shape with dual-light setup
- Color-coded surface (positive/negative values)
- Smooth camera controls (orbit, zoom, pan)
- Optional wireframe mode
- Live coefficient display (all 15 values)

### Physics Controls
- **θ (theta)**: Mean reversion rate (0-2)
  - Higher = faster damping, smoother motion
  - Lower = more persistent momentum
- **σ (sigma)**: Volatility/noise (0-1)
  - Higher = more chaotic, energetic motion
  - Lower = calmer evolution

### Mobile-Friendly UI
- Hamburger menu at bottom center
- Touch-optimized controls
- Adjustable OU process parameters
- Wireframe toggle

## Technical Details

### Spherical Harmonics
The shape uses real spherical harmonics up to l=3 (f orbitals):
- l=1 (p orbitals): 3 coefficients
- l=2 (d orbitals): 5 coefficients
- l=3 (f orbitals): 7 coefficients
- Total: 15 active coefficients evolving on the 14-sphere

The l=0 term (Y₀⁰) is fixed at 0 for balanced red/blue coloring.

### Physics Simulation
The evolution uses an Ornstein-Uhlenbeck process with:
- Gaussian noise generation (Box-Muller transform)
- Frame-rate independent timestep (capped at 100ms)
- Sphere constraint via normalization after each update
- Proper Wiener process scaling: `σ√dt`

### Rendering
- WebGL with Three.js
- Custom GLSL shaders for spherical harmonic evaluation
- Vertex displacement: `r = |f(θ,φ)| × scale`
- Two-point lighting (key + fill) with ambient
- Base geometry: Icosahedron with 64 subdivisions

## Controls

### Desktop
- **Left-click + drag**: Rotate view
- **Scroll**: Zoom in/out
- **Right-click + drag**: Pan camera

### Mobile
- **One finger drag**: Rotate view
- **Pinch**: Zoom in/out
- **Two finger drag**: Pan camera

### Settings Menu
1. Tap hamburger button (⋮) at bottom
2. Select parameter to adjust or toggle wireframe
3. For θ/σ: Use slider to change value
4. Tap "← Back" to return to menu

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
