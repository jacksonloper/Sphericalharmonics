/**
 * Load and render adaptive mesh for spherical data
 *
 * Format:
 *   Header: 'ADAMESH' (7 bytes)
 *   Version: uint8 (1 byte) = 1
 *   Num vertices: uint32 (4 bytes)
 *   Num triangles: uint32 (4 bytes)
 *   Vertices: float32[num_vertices * 3] - (x, y, z) positions on unit sphere
 *   Elevations: float32[num_vertices] - elevation in meters
 *   Triangles: uint32[num_triangles * 3] - vertex indices
 */

import * as THREE from 'three';

/**
 * Load adaptive mesh from binary file
 * @param {string} url - URL to mesh file
 * @returns {Promise<Object>} Object containing {geometry, elevations, stats}
 */
export async function loadAdaptiveMesh(url) {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const dataView = new DataView(buffer);

  let offset = 0;

  // Read header
  const header = new TextDecoder().decode(buffer.slice(offset, offset + 7));
  offset += 7;

  if (header !== 'ADAMESH') {
    throw new Error(`Invalid adaptive mesh header: ${header}`);
  }

  // Read version
  const version = dataView.getUint8(offset);
  offset += 1;

  if (version !== 1) {
    throw new Error(`Unsupported mesh version: ${version}`);
  }

  // Read counts
  const numVertices = dataView.getUint32(offset, true);
  offset += 4;

  const numTriangles = dataView.getUint32(offset, true);
  offset += 4;

  console.log(`Loading adaptive mesh: ${numVertices} vertices, ${numTriangles} triangles`);

  // Read vertices (positions on unit sphere)
  const positions = new Float32Array(numVertices * 3);
  for (let i = 0; i < numVertices * 3; i++) {
    positions[i] = dataView.getFloat32(offset, true);
    offset += 4;
  }

  // Read elevations
  const elevations = new Float32Array(numVertices);
  let minElev = Infinity;
  let maxElev = -Infinity;

  for (let i = 0; i < numVertices; i++) {
    elevations[i] = dataView.getFloat32(offset, true);
    minElev = Math.min(minElev, elevations[i]);
    maxElev = Math.max(maxElev, elevations[i]);
    offset += 4;
  }

  // Read triangles
  const indices = new Uint32Array(numTriangles * 3);
  for (let i = 0; i < numTriangles * 3; i++) {
    indices[i] = dataView.getUint32(offset, true);
    offset += 4;
  }

  // Create Three.js geometry
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));

  // Compute normals for lighting
  geometry.computeVertexNormals();

  // Store elevations as attribute for shader
  geometry.setAttribute('elevation', new THREE.BufferAttribute(elevations, 1));

  const stats = {
    numVertices,
    numTriangles,
    minElevation: minElev,
    maxElevation: maxElev,
    fileSize: buffer.byteLength
  };

  console.log('Adaptive mesh loaded:', stats);

  return { geometry, elevations, stats };
}

/**
 * Create a mesh with elevation-based displacement
 * @param {THREE.BufferGeometry} geometry - The mesh geometry
 * @param {Object} options - Rendering options
 * @returns {THREE.Mesh}
 */
export function createElevationMesh(geometry, options = {}) {
  const {
    minElevation = -500,
    maxElevation = 9000,
    elevationScale = 0.02,
    oceanColor = 0x0066aa,
    landColor = 0x228B22,
    mountainColor = 0x8B4513,
    peakColor = 0xFFFFFF
  } = options;

  // Custom shader material for elevation-based coloring and displacement
  const material = new THREE.ShaderMaterial({
    uniforms: {
      minElevation: { value: minElevation },
      maxElevation: { value: maxElevation },
      elevationScale: { value: elevationScale },
      oceanColor: { value: new THREE.Color(oceanColor) },
      landColor: { value: new THREE.Color(landColor) },
      mountainColor: { value: new THREE.Color(mountainColor) },
      peakColor: { value: new THREE.Color(peakColor) },
      lightDir1: { value: new THREE.Vector3(1, 1, 1).normalize() },
      lightDir2: { value: new THREE.Vector3(-1, -0.5, -0.5).normalize() }
    },

    vertexShader: `
      attribute float elevation;
      varying vec3 vNormal;
      varying float vElevation;

      uniform float minElevation;
      uniform float maxElevation;
      uniform float elevationScale;

      void main() {
        vNormal = normalize(normalMatrix * normal);
        vElevation = elevation;

        // Normalize elevation to [0, 1]
        float normalizedE = (elevation - minElevation) / (maxElevation - minElevation);
        normalizedE = clamp(normalizedE, 0.0, 1.0);

        // Displace vertex along normal
        vec3 displaced = position * (1.0 + elevationScale * normalizedE);

        gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
      }
    `,

    fragmentShader: `
      varying vec3 vNormal;
      varying float vElevation;

      uniform float minElevation;
      uniform float maxElevation;
      uniform vec3 oceanColor;
      uniform vec3 landColor;
      uniform vec3 mountainColor;
      uniform vec3 peakColor;
      uniform vec3 lightDir1;
      uniform vec3 lightDir2;

      void main() {
        // Normalize elevation
        float t = (vElevation - minElevation) / (maxElevation - minElevation);
        t = clamp(t, 0.0, 1.0);

        // Color gradient based on elevation
        vec3 color;
        if (t < 0.1) {
          // Ocean
          color = oceanColor;
        } else if (t < 0.3) {
          // Coast -> lowland
          float local_t = (t - 0.1) / 0.2;
          color = mix(oceanColor, landColor, local_t);
        } else if (t < 0.6) {
          // Lowland -> mountains
          float local_t = (t - 0.3) / 0.3;
          color = mix(landColor, mountainColor, local_t);
        } else {
          // Mountains -> peaks
          float local_t = (t - 0.6) / 0.4;
          color = mix(mountainColor, peakColor, local_t);
        }

        // Simple two-light setup
        float light1 = max(0.0, dot(vNormal, lightDir1));
        float light2 = max(0.0, dot(vNormal, lightDir2));
        float lighting = 0.3 + 0.5 * light1 + 0.2 * light2;

        gl_FragColor = vec4(color * lighting, 1.0);
      }
    `,

    flatShading: true
  });

  return new THREE.Mesh(geometry, material);
}

/**
 * Create scene with adaptive mesh
 * @param {string} meshUrl - URL to mesh file
 * @param {HTMLCanvasElement} canvas - Canvas element
 * @param {Object} options - Rendering options
 * @returns {Promise<Object>} Object containing {scene, camera, renderer, mesh, stats}
 */
export async function createAdaptiveMeshScene(meshUrl, canvas, options = {}) {
  const { geometry, elevations, stats } = await loadAdaptiveMesh(meshUrl);

  // Create scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000011);

  // Create camera
  const camera = new THREE.PerspectiveCamera(
    50,
    canvas.width / canvas.height,
    0.1,
    100
  );
  camera.position.z = 3;

  // Create mesh with elevation
  const mesh = createElevationMesh(geometry, {
    minElevation: stats.minElevation,
    maxElevation: stats.maxElevation,
    ...options
  });

  scene.add(mesh);

  // Create renderer
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true
  });
  renderer.setSize(canvas.width, canvas.height);
  renderer.setPixelRatio(window.devicePixelRatio);

  return { scene, camera, renderer, mesh, stats };
}

/**
 * Animation loop helper
 * @param {Object} sceneData - Object from createAdaptiveMeshScene
 * @param {Function} onFrame - Optional callback called each frame
 * @returns {Function} Stop function
 */
export function animateAdaptiveMesh(sceneData, onFrame = null) {
  const { scene, camera, renderer, mesh } = sceneData;

  let animationId = null;
  let time = 0;

  function animate() {
    animationId = requestAnimationFrame(animate);

    // Rotate mesh
    mesh.rotation.y += 0.002;
    time += 0.016;

    // Call user callback
    if (onFrame) {
      onFrame(time, mesh);
    }

    renderer.render(scene, camera);
  }

  animate();

  // Return stop function
  return () => {
    if (animationId !== null) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
  };
}
