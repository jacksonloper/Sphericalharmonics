/**
 * Population Height Material for three.js
 * Creates shader materials for visualizing population density using pre-built pyramid geometry
 * Pyramids are already displaced to correct heights, so no vertex displacement needed
 */

import * as THREE from 'three';

/**
 * Create a material for visualizing population density with pyramid geometry
 * Pyramids are pre-built with volumes proportional to population
 *
 * @param {number} maxPopulation - Maximum population value for normalization
 * @returns {THREE.ShaderMaterial} Material with population-based coloring
 */
export function createPopulationHeightMaterial(maxPopulation = 1000000) {
  const vertexShader = `
    attribute float population;
    varying float vPopulation;
    varying vec3 vNormal;
    varying vec3 vPosition;

    void main() {
      // Store population for color mapping
      vPopulation = population;
      
      // Use precomputed normals from geometry
      vNormal = normalize(normalMatrix * normal);

      // Pyramids are already at correct positions, no displacement needed
      vPosition = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
    uniform float maxPopulation;

    varying float vPopulation;
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

    void main() {
      // Normalize population to [0, 1] range for color mapping
      // Use logarithmic scale for better visualization of varying densities
      float normalizedPop = vPopulation / maxPopulation;
      // Apply logarithmic scaling: log(1 + x) to compress high values
      float logScale = log(1.0 + normalizedPop * 99.0) / log(100.0);
      float pop_t = clamp(logScale, 0.0, 1.0);
      
      // Apply turbo colormap
      vec3 color = turbo_colormap(pop_t);

      // Multi-directional lighting for full illumination
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
      maxPopulation: { value: maxPopulation }
    },
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide
  });
}
