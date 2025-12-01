/**
 * ETOPO Range Demo
 * Demonstrates loading and rendering HEALPix elevation range data (min, mean, max)
 * from etopo2022_surface_min_mean_max_healpix128_NESTED.npy
 * 
 * Each HEALPix cell is rendered as a line segment from min to max elevation
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createEtopoRangeMaterial } from './etopoRangeMaterial.js';
import { load } from 'npyjs';
import { pix2ang_nest } from '@hscmap/healpix';
import * as healpix from '@hscmap/healpix';

// HEALPix parameters
const NSIDE = 128;
const HEALPIX_BASE_FACES = 12; // HEALPix tessellation has 12 base faces
const NPIX = HEALPIX_BASE_FACES * NSIDE * NSIDE; // 196608

// Mesh generation parameters
const MESH_GENERATION_ALPHA = 0.11; // Alpha value used for vertex displacement during mesh generation

// UI constants
const DEBOUNCE_DELAY_MS = 100; // Delay for slider debouncing

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 0.5, 2.5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

// Orbit controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 1.2;
controls.maxDistance = 10;
controls.autoRotate = false;

// Loading indicator
const loadingDiv = document.createElement('div');
loadingDiv.style.position = 'absolute';
loadingDiv.style.top = '50%';
loadingDiv.style.left = '50%';
loadingDiv.style.transform = 'translate(-50%, -50%)';
loadingDiv.style.color = 'white';
loadingDiv.style.fontFamily = 'monospace';
loadingDiv.style.fontSize = '16px';
loadingDiv.style.textAlign = 'center';
loadingDiv.innerHTML = 'Loading HEALPix data...';
document.body.appendChild(loadingDiv);

// Global state
let healpixMesh = null;
let lineSegments = null;
let quadMesh = null;
let innerSphere = null;
let material = null;
let quadMaterial = null;
let geometryData = null; // Store data for regeneration
let alphaValue = 0.1; // Default alpha value
let regenerateTimeout = null; // For debouncing slider updates
let meshWorker = null; // Worker for mesh generation

/**
 * Convert HEALPix NESTED pixel index to (theta, phi) in spherical coordinates
 * Uses the @hscmap/healpix library for accurate conversion
 * 
 * @param {number} nside - HEALPix nside parameter
 * @param {number} ipix - Pixel index in NESTED scheme
 * @returns {Array} [theta, phi] in radians where theta is colatitude [0, π], phi is longitude [0, 2π]
 */
function healpixNestedToSpherical(nside, ipix) {
  const { theta, phi } = pix2ang_nest(nside, ipix);
  return [theta, phi];
}

/**
 * Convert spherical coordinates (theta, phi) to Cartesian (x, y, z)
 * with optional radial displacement
 * 
 * @param {number} theta - Colatitude in radians [0, π]
 * @param {number} phi - Longitude in radians [0, 2π]
 * @param {number} r - Radial distance (default 1.0)
 * @returns {Array} [x, y, z]
 */
function sphericalToCartesian(theta, phi, r = 1.0) {
  const sinTheta = Math.sin(theta);
  const cosTheta = Math.cos(theta);
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  
  // Standard right-handed spherical coordinates with y-up convention
  // theta=0 at north pole (positive y), phi=0 at positive x
  // Negate z for correct chirality (left-right orientation)
  return [
    r * sinTheta * cosPhi,
    r * cosTheta,           // y-axis points to poles
    -r * sinTheta * sinPhi  // Negate for correct chirality
  ];
}

/**
 * Load and visualize HEALPix data
 */
async function loadAndVisualize() {
  try {
    // Load NPY file using the functional API
    const data = await load('./earthtoposources/etopo2022_surface_min_mean_max_healpix128_NESTED.npy');
    
    console.log('Data shape:', data.shape);
    console.log('Data dtype:', data.dtype);
    
    // Extract min, mean, max arrays
    const numPixels = data.shape[0];
    const minVals = new Float32Array(numPixels);
    const meanVals = new Float32Array(numPixels);
    const maxVals = new Float32Array(numPixels);
    
    let globalMin = Infinity;
    let globalMax = -Infinity;
    
    for (let i = 0; i < numPixels; i++) {
      const minVal = data.data[i * 3 + 0];
      const meanVal = data.data[i * 3 + 1];
      const maxVal = data.data[i * 3 + 2];
      minVals[i] = minVal;
      meanVals[i] = meanVal;
      maxVals[i] = maxVal;
      
      if (minVal < globalMin) globalMin = minVal;
      if (maxVal > globalMax) globalMax = maxVal;
    }
    
    // Calculate max absolute elevation
    const maxAbsElevation = Math.max(Math.abs(globalMin), Math.abs(globalMax));
    
    console.log(`Elevation range: ${globalMin.toFixed(2)}m to ${globalMax.toFixed(2)}m`);
    console.log(`Max absolute elevation: ${maxAbsElevation.toFixed(2)}m`);
    
    // Store data for regeneration when slider changes
    geometryData = {
      numPixels,
      minVals,
      meanVals,
      maxVals,
      globalMin,
      globalMax,
      maxAbsElevation
    };
    
    // Create material for line segments
    material = createEtopoRangeMaterial(globalMin, globalMax, maxAbsElevation);
    
    // Create inner non-transparent sphere at radius 0.4
    const innerSphereGeometry = new THREE.SphereGeometry(0.4, 64, 64);
    const innerSphereMaterial = new THREE.MeshBasicMaterial({
      color: 0x1a1a1a,
      side: THREE.BackSide
    });
    innerSphere = new THREE.Mesh(innerSphereGeometry, innerSphereMaterial);
    scene.add(innerSphere);
    
    // Generate HEALPix mesh directly (not in worker to avoid complexity)
    loadingDiv.innerHTML = 'Generating HEALPix mesh...';
    setTimeout(() => {
      generateHealpixMeshDirect(data.data, maxAbsElevation);
      loadingDiv.style.display = 'none';
    }, 100); // Small delay to allow loading message to display
    
  } catch (error) {
    console.error('Failed to load data:', error);
    loadingDiv.innerHTML = 'Failed: ' + error.message;
    loadingDiv.style.color = '#ff4444';
  }
}

/**
 * Generate HEALPix mesh directly in main thread using healpix library
 */
function generateHealpixMeshDirect(elevationData, maxAbsElevation) {
  const numPixels = NPIX;
  
  // Generate vertex positions on unit sphere
  const positions = new Float32Array(numPixels * 3);
  const elevations = new Float32Array(numPixels);
  
  console.log('Generating vertex positions...');
  
  for (let i = 0; i < numPixels; i++) {
    const { theta, phi } = pix2ang_nest(NSIDE, i);
    const [x, y, z] = sphericalToCartesian(theta, phi, 1.0);
    
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    
    // Store min elevation for this pixel
    elevations[i] = elevationData[i * 3 + 0];
  }
  
  // Generate mesh indices using HEALPix grid structure
  // Each base face is an nside x nside grid
  console.log('Generating mesh connectivity...');
  const indices = [];
  const npface = NSIDE * NSIDE;
  
  // For each of the 12 base faces
  for (let face = 0; face < 12; face++) {
    // Create quads within each face
    for (let iy = 0; iy < NSIDE - 1; iy++) {
      for (let ix = 0; ix < NSIDE - 1; ix++) {
        // Get the 4 corners of the quad in NESTED ordering
        // This needs to respect the NESTED bit-interleaved structure
        const getNestedIndex = (face, ix, iy) => {
          // Convert (ix, iy) to NESTED index within face
          let ipf = 0;
          for (let bit = 0; bit < 16; bit++) {
            ipf |= ((ix >> bit) & 1) << (2 * bit);
            ipf |= ((iy >> bit) & 1) << (2 * bit + 1);
          }
          return face * npface + ipf;
        };
        
        const i1 = getNestedIndex(face, ix, iy);
        const i2 = getNestedIndex(face, ix + 1, iy);
        const i3 = getNestedIndex(face, ix + 1, iy + 1);
        const i4 = getNestedIndex(face, ix, iy + 1);
        
        // Create two triangles for the quad
        if (i1 < numPixels && i2 < numPixels && i3 < numPixels && i4 < numPixels) {
          indices.push(i1, i2, i3);
          indices.push(i1, i3, i4);
        }
      }
    }
  }
  
  console.log(`Generated ${indices.length / 3} triangles`);
  
  // Displace vertices and compute normals
  console.log('Displacing vertices with elevation data...');
  const displacedPositions = new Float32Array(positions.length);
  const alpha = MESH_GENERATION_ALPHA;
  
  for (let i = 0; i < numPixels; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    
    const elevation = elevations[i];
    const r = 1.0 + alpha * elevation / maxAbsElevation;
    
    displacedPositions[i * 3] = x * r;
    displacedPositions[i * 3 + 1] = y * r;
    displacedPositions[i * 3 + 2] = z * r;
  }
  
  // Compute normals from displaced geometry
  console.log('Computing normals...');
  const normals = new Float32Array(numPixels * 3);
  
  for (let i = 0; i < indices.length; i += 3) {
    const i1 = indices[i], i2 = indices[i + 1], i3 = indices[i + 2];
    
    const ax = displacedPositions[i1 * 3], ay = displacedPositions[i1 * 3 + 1], az = displacedPositions[i1 * 3 + 2];
    const bx = displacedPositions[i2 * 3], by = displacedPositions[i2 * 3 + 1], bz = displacedPositions[i2 * 3 + 2];
    const cx = displacedPositions[i3 * 3], cy = displacedPositions[i3 * 3 + 1], cz = displacedPositions[i3 * 3 + 2];
    
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    
    normals[i1 * 3] += nx; normals[i1 * 3 + 1] += ny; normals[i1 * 3 + 2] += nz;
    normals[i2 * 3] += nx; normals[i2 * 3 + 1] += ny; normals[i2 * 3 + 2] += nz;
    normals[i3 * 3] += nx; normals[i3 * 3 + 1] += ny; normals[i3 * 3 + 2] += nz;
  }
  
  // Normalize normals
  for (let i = 0; i < numPixels; i++) {
    const x = normals[i * 3], y = normals[i * 3 + 1], z = normals[i * 3 + 2];
    const len = Math.sqrt(x * x + y * y + z * z);
    if (len > 0) {
      normals[i * 3] /= len;
      normals[i * 3 + 1] /= len;
      normals[i * 3 + 2] /= len;
    }
  }
  
  console.log('Creating Three.js geometry...');
  
  // Create Three.js geometry
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('elevation', new THREE.BufferAttribute(elevations, 1));
  geometry.setIndex(new Uint32Array(indices));
  
  // Create mesh material
  const meshMaterial = material;
  meshMaterial.side = THREE.DoubleSide;
  
  // Create and add mesh to scene
  healpixMesh = new THREE.Mesh(geometry, meshMaterial);
  scene.add(healpixMesh);
  
  // Generate line segments
  generateLineSegments();
  
  console.log(`HEALPix mesh added: ${numPixels} vertices, ${indices.length / 3} triangles`);
}

/**
 * Clean up old line segments and dispose of geometry
 */
function cleanupOldGeometry() {
  if (lineSegments) {
    scene.remove(lineSegments);
    lineSegments.geometry.dispose();
    // Material is reused, so don't dispose it
  }
  if (quadMesh) {
    scene.remove(quadMesh);
    quadMesh.geometry.dispose();
    // Quad material is reused, so don't dispose it
  }
  if (healpixMesh) {
    scene.remove(healpixMesh);
    healpixMesh.geometry.dispose();
    // Material is reused, so don't dispose it
  }
}

/**
 * Generate line segments from min to max elevation
 * Shows feathery extensions from the mesh surface to max elevation
 */
function generateLineSegments() {
  if (!geometryData) return;
  
  const { numPixels, minVals, maxVals, maxAbsElevation } = geometryData;
  
  // Create geometry for line segments
  // Each HEALPix pixel becomes one line segment from min to max
  const linePositions = new Float32Array(numPixels * 2 * 3); // 2 vertices per line
  const lineElevations = new Float32Array(numPixels * 2);
  
  for (let i = 0; i < numPixels; i++) {
    const [theta, phi] = healpixNestedToSpherical(NSIDE, i);
    
    const minElev = minVals[i];
    const maxElev = maxVals[i];
    
    // Calculate radii using formula: r = 1 + alpha * e / maxAbsElevation
    const rMin = 1.0 + alphaValue * minElev / maxAbsElevation;
    const rMax = 1.0 + alphaValue * maxElev / maxAbsElevation;
    
    // Create line segment from min to max
    const [x1, y1, z1] = sphericalToCartesian(theta, phi, rMin);
    const [x2, y2, z2] = sphericalToCartesian(theta, phi, rMax);
    
    const lineIdx = i * 6;
    linePositions[lineIdx + 0] = x1;
    linePositions[lineIdx + 1] = y1;
    linePositions[lineIdx + 2] = z1;
    linePositions[lineIdx + 3] = x2;
    linePositions[lineIdx + 4] = y2;
    linePositions[lineIdx + 5] = z2;
    
    lineElevations[i * 2 + 0] = minElev;
    lineElevations[i * 2 + 1] = maxElev;
  }
  
  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
  lineGeometry.setAttribute('elevation', new THREE.BufferAttribute(lineElevations, 1));
  
  // Clean up old line segments if they exist
  if (lineSegments) {
    scene.remove(lineSegments);
    lineSegments.geometry.dispose();
    // Material is reused, so don't dispose it
  }
  
  // Create line segments (NO rotation - Earth should be upright)
  lineSegments = new THREE.LineSegments(lineGeometry, material);
  scene.add(lineSegments);
}

function addControlPanel() {
  const panel = document.createElement('div');
  panel.style.position = 'absolute';
  panel.style.bottom = '15px';
  panel.style.left = '50%';
  panel.style.transform = 'translateX(-50%)';
  panel.style.color = 'white';
  panel.style.fontFamily = 'monospace';
  panel.style.fontSize = '12px';
  panel.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  panel.style.padding = '12px 15px';
  panel.style.borderRadius = '8px';
  panel.style.display = 'flex';
  panel.style.alignItems = 'center';
  panel.style.gap = '15px';
  panel.style.flexWrap = 'wrap';
  panel.style.justifyContent = 'center';

  // Relief slider
  const reliefGroup = document.createElement('div');
  reliefGroup.style.display = 'flex';
  reliefGroup.style.alignItems = 'center';
  reliefGroup.style.gap = '8px';

  const reliefLabel = document.createElement('span');
  reliefLabel.textContent = 'Relief:';
  reliefGroup.appendChild(reliefLabel);

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0.01';
  slider.max = '0.5';
  slider.step = '0.01';
  slider.value = '0.1';
  slider.style.width = '120px';
  slider.style.cursor = 'pointer';

  const valueDisplay = document.createElement('span');
  valueDisplay.textContent = slider.value;
  valueDisplay.style.minWidth = '35px';
  valueDisplay.style.color = '#4ecdc4';

  slider.addEventListener('input', (e) => {
    const newAlpha = parseFloat(e.target.value);
    valueDisplay.textContent = newAlpha.toFixed(2);
    alphaValue = newAlpha;
    
    if (material) {
      material.uniforms.alpha.value = newAlpha;
      // Vertex shader handles displacement based on alpha uniform
      // No need to regenerate geometry
    }
    
    // Regenerate line segments to match new alpha
    if (regenerateTimeout) {
      clearTimeout(regenerateTimeout);
    }
    regenerateTimeout = setTimeout(() => {
      generateLineSegments();
    }, DEBOUNCE_DELAY_MS);
  });

  reliefGroup.appendChild(slider);
  reliefGroup.appendChild(valueDisplay);
  panel.appendChild(reliefGroup);

  document.body.appendChild(panel);
}

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

// Handle window resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Initialize
addControlPanel();
loadAndVisualize();
animate();
