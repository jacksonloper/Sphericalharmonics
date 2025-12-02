/**
 * ETOPO Range Material for three.js
 * Creates shader materials for visualizing elevation range data (min to max) on HEALPix meshes
 * Supports both turbo colormap and water-based colormap
 */

import * as THREE from 'three';

/**
 * Create a material for visualizing elevation range data with line segments
 * Each HEALPix cell is represented by a line from min to max elevation
 *
 * @param {number} minElevation - Minimum elevation value (default -11000m for ETOPO surface data)
 * @param {number} maxElevation - Maximum elevation value (default 9000m for ETOPO surface data)
 * @returns {THREE.ShaderMaterial} Material with elevation-based coloring
 */
export function createEtopoRangeMaterial(minElevation = -11000, maxElevation = 9000, maxAbsElevation = 11000) {
  const vertexShader = `
    attribute float elevation;
    attribute float waterOccurrence;
    uniform float alpha;
    uniform float maxAbsElevation;
    uniform float flipSign;
    varying float vElevation;
    varying float vOriginalElevation;
    varying float vWaterOccurrence;
    varying vec3 vNormal;
    varying vec3 vPosition;

    void main() {
      // Store original elevation for color mapping (not affected by flip sign)
      vOriginalElevation = elevation;
      
      // Pass water occurrence to fragment shader
      vWaterOccurrence = waterOccurrence;
      
      // Apply flip sign to elevation for displacement
      vElevation = elevation * flipSign;

      // Use precomputed normals from geometry (computed at alpha=0.11)
      // When flipSign is -1, we need to invert the normals since the displacement is reversed
      // Transform to view space for lighting calculations
      vNormal = normalize(normalMatrix * normal * flipSign);

      // Compute radial displacement: r = 1 + alpha * e / maxAbsElevation
      // Depths (negative) point inward, heights (positive) point outward
      float radius = 1.0 + alpha * vElevation / maxAbsElevation;

      // Displace vertex radially (positions are on unit sphere)
      vec3 displacedPosition = position * radius;

      vPosition = displacedPosition;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(displacedPosition, 1.0);
    }
  `;

  const fragmentShader = `
    uniform float minElevation;
    uniform float maxElevation;
    uniform bool useWaterColormap;

    varying float vElevation;
    varying float vOriginalElevation;
    varying float vWaterOccurrence;
    varying vec3 vNormal;
    varying vec3 vPosition;

    // Turbo colormap - a perceptually uniform colormap developed by Google
    // Maps a value in [0, 1] to an RGB color
    vec3 turbo_colormap(float t) {
      t = clamp(t, 0.0, 1.0);
      const vec3 c0 = vec3(0.1140890109226559, 0.06288340699912215, 0.2248337216805064);
      const vec3 c1 = vec3(6.716419496985708, 3.182286745507602, 7.571581586103393);
      const vec3 c2 = vec3(-66.09402360453038, -4.9279827041226, -10.09439367561635);
      const vec3 c3 = vec3(228.7660791526501, 25.04986699771073, -91.54105330182436);
      const vec3 c4 = vec3(-334.8351565777451, -69.31749712757485, 288.5858850615712);
      const vec3 c5 = vec3(218.7637218434795, 67.52150567819112, -305.2045772184957);
      const vec3 c6 = vec3(-52.88903478218835, -21.54527364654712, 110.5174647748972);
      
      return c0 + t * (c1 + t * (c2 + t * (c3 + t * (c4 + t * (c5 + t * c6)))));
    }

    // Water-based colormap: blue for water, green for land, black for lowest, white for highest
    vec3 water_colormap(float elevation_t, float water_t) {
      // Threshold for distinguishing water from land (values > 10 capture lakes and oceans)
      bool isWater = water_t > (10.0 / 255.0);
      
      vec3 baseColor;
      if (isWater) {
        // Blue gradient for water: darker blue at low elevations, lighter blue at high elevations
        baseColor = mix(vec3(0.0, 0.0, 0.5), vec3(0.3, 0.5, 1.0), elevation_t);
      } else {
        // Green gradient for land: darker green at low elevations, lighter green at high elevations
        baseColor = mix(vec3(0.0, 0.3, 0.0), vec3(0.4, 0.8, 0.3), elevation_t);
      }
      
      // Mix with black (lowest) and white (highest) based on elevation
      // Black contribution is strongest at lowest elevation, white at highest
      vec3 finalColor = baseColor;
      if (elevation_t < 0.2) {
        // Blend toward black for lowest elevations
        finalColor = mix(vec3(0.0, 0.0, 0.0), baseColor, elevation_t / 0.2);
      } else if (elevation_t > 0.8) {
        // Blend toward white for highest elevations
        finalColor = mix(baseColor, vec3(1.0, 1.0, 1.0), (elevation_t - 0.8) / 0.2);
      }
      
      return finalColor;
    }

    void main() {
      // Map elevation to [0, 1] range
      // Always use original elevation for color mapping
      float elevation_t = (vOriginalElevation - minElevation) / (maxElevation - minElevation);
      elevation_t = clamp(elevation_t, 0.0, 1.0);
      
      // Map water occurrence to [0, 1] range
      float water_t = vWaterOccurrence / 255.0;
      water_t = clamp(water_t, 0.0, 1.0);
      
      // Choose colormap based on uniform
      vec3 color;
      if (useWaterColormap) {
        color = water_colormap(elevation_t, water_t);
      } else {
        color = turbo_colormap(elevation_t);
      }

      // Multi-directional lighting for full illumination
      // Multiple lights from different directions ensure all surfaces are well lit
      vec3 light1 = normalize(vec3(1.0, 1.0, 1.0));
      vec3 light2 = normalize(vec3(-1.0, 0.5, -0.5));
      vec3 light3 = normalize(vec3(0.0, -1.0, 0.5));
      vec3 light4 = normalize(vec3(-0.5, 1.0, -1.0));

      float diffuse1 = max(dot(vNormal, light1), 0.0) * 0.25;
      float diffuse2 = max(dot(vNormal, light2), 0.0) * 0.2;
      float diffuse3 = max(dot(vNormal, light3), 0.0) * 0.15;
      float diffuse4 = max(dot(vNormal, light4), 0.0) * 0.15;
      float ambient = 0.8;

      float lighting = diffuse1 + diffuse2 + diffuse3 + diffuse4 + ambient;
      vec3 finalColor = color * lighting;

      gl_FragColor = vec4(finalColor, 1.0);
    }
  `;

  return new THREE.ShaderMaterial({
    uniforms: {
      minElevation: { value: minElevation },
      maxElevation: { value: maxElevation },
      maxAbsElevation: { value: maxAbsElevation },
      alpha: { value: 0.1 },
      flipSign: { value: 1.0 },
      useWaterColormap: { value: true }  // Default to water-based colormap
    },
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide
  });
}
