# Spherical Harmonics Lava Lamp

A WebGL visualization of spherical harmonics using Three.js, rendered as a "lava lamp" where:
- **Color** represents the sign of the scalar field (positive = orange, negative = teal)
- **Radius** represents the magnitude (displacement from base sphere)

## Features

- Real-time spherical harmonics evaluation in vertex shader
- Smooth animated transitions between coefficients
- Interactive mouse-controlled rotation
- Optimized for performance with GPU-based computation

## Development

```bash
# Install dependencies
npm install

# Run development server
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

## Technical Details

- Spherical harmonics evaluated up to degree 4 (25 coefficients)
- Base geometry: Icosahedron with 64 subdivisions
- Vertex shader computes displacement based on SH evaluation
- Fragment shader applies sign-based coloring with simple lighting
