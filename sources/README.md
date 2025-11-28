# Bedrock Spherical Harmonics Data

This directory contains Earth bedrock topography data in spherical harmonic format (`.bshc`).

## Files

| File | Format | Degree | Coefficients | Size | Description |
|------|--------|--------|--------------|------|-------------|
| `bed.bshc` | float64 | L=2160 | 4,669,921 | 36 MB | Full resolution (original) |
| `bed_f32_361.bshc` | float32 | L=361 | 131,044 | 0.5 MB | Compact version (recommended for web) |
| `bed_f32_510.bshc` | float32 | L=510 | 261,121 | 1.0 MB | High detail version |

## File Format

Each `.bshc` file contains:
1. **Header** (2 values):
   - `metadata` (float/double): Reserved for metadata (currently 0)
   - `max_degree` (float/double): Maximum spherical harmonic degree L

2. **Coefficients** ((L+1)² values):
   - Real spherical harmonic coefficients in standard order
   - Ordered by degree l, then order m: Y₀⁰, Y₁⁻¹, Y₁⁰, Y₁¹, Y₂⁻², ...

## Recommendations

- **Web deployment**: Use `bed_f32_361.bshc` (smallest, good quality)
- **High detail visualization**: Use `bed_f32_510.bshc` (best quality under 1MB)
- **Scientific analysis**: Use `bed.bshc` (full resolution)

## Notes

- Float32 precision (~7 decimal digits) is sufficient for topography visualization
- L=361 provides ~50km resolution at Earth's surface
- L=510 provides ~40km resolution at Earth's surface
- L=2160 provides ~9km resolution at Earth's surface
