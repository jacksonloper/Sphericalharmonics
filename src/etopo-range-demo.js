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

// HEALPix parameters
const NSIDE = 128;
const HEALPIX_BASE_FACES = 12; // HEALPix tessellation has 12 base faces
const NPIX = HEALPIX_BASE_FACES * NSIDE * NSIDE; // 196608

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
let lineSegments = null;
let quadMesh = null;
let innerSphere = null;
let material = null;
let quadMaterial = null;
let geometryData = null; // Store data for regeneration
let alphaValue = 0.1; // Default alpha value
let regenerateTimeout = null; // For debouncing slider updates

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
    
    // Generate initial geometry
    generateGeometry();
    
    loadingDiv.style.display = 'none';
    
    console.log(`Rendered ${numPixels.toLocaleString()} line segments and quads`);
  } catch (error) {
    console.error('Failed to load data:', error);
    loadingDiv.innerHTML = 'Failed: ' + error.message;
    loadingDiv.style.color = '#ff4444';
  }
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
}

/**
 * Generate or regenerate line segment geometry based on current alpha value
 */
function generateGeometry() {
  if (!geometryData) return;
  
  const { numPixels, minVals, meanVals, maxVals, maxAbsElevation } = geometryData;
  
  // Create geometry for line segments
  // Each HEALPix pixel becomes one line segment from min to max
  const linePositions = new Float32Array(numPixels * 2 * 3); // 2 vertices per line
  const lineElevations = new Float32Array(numPixels * 2);
  
  // Create geometry for quads at min elevation
  // Each HEALPix pixel becomes a small quad at its minimum elevation
  const quadPositions = new Float32Array(numPixels * 4 * 3); // 4 vertices per quad
  const quadElevations = new Float32Array(numPixels * 4);
  const quadIndices = new Uint32Array(numPixels * 6); // 2 triangles per quad
  
  // Approximate quad size based on HEALPix resolution (moved outside loop)
  // For HEALPix, each pixel subtends approximately sqrt(4π / npix) radians (angular diameter)
  // Divide by 2 for half-size quads to avoid overlap between neighboring pixels
  const quadSize = Math.sqrt(4 * Math.PI / (HEALPIX_BASE_FACES * NSIDE * NSIDE)) / 2;
  
  for (let i = 0; i < numPixels; i++) {
    const [theta, phi] = healpixNestedToSpherical(NSIDE, i);
    
    const minElev = minVals[i];
    const meanElev = meanVals[i];
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
    
    // Create quad at min elevation (not mean)
    // Approximate corners by offsetting theta and phi
    const dTheta = quadSize;
    // Prevent division by zero at poles
    const dPhi = quadSize / Math.max(Math.sin(theta), 1e-6);
    
    const corners = [
      [theta - dTheta/2, phi - dPhi/2],
      [theta - dTheta/2, phi + dPhi/2],
      [theta + dTheta/2, phi + dPhi/2],
      [theta + dTheta/2, phi - dPhi/2]
    ];
    
    const quadIdx = i * 12;
    for (let j = 0; j < 4; j++) {
      const [thetaCorner, phiCorner] = corners[j];
      const [x, y, z] = sphericalToCartesian(thetaCorner, phiCorner, rMin);
      const vIdx = (i * 4 + j) * 3;
      quadPositions[vIdx + 0] = x;
      quadPositions[vIdx + 1] = y;
      quadPositions[vIdx + 2] = z;
      quadElevations[i * 4 + j] = minElev;
    }
    
    // Create two triangles for the quad
    const baseIdx = i * 4;
    const triIdx = i * 6;
    quadIndices[triIdx + 0] = baseIdx + 0;
    quadIndices[triIdx + 1] = baseIdx + 1;
    quadIndices[triIdx + 2] = baseIdx + 2;
    quadIndices[triIdx + 3] = baseIdx + 0;
    quadIndices[triIdx + 4] = baseIdx + 2;
    quadIndices[triIdx + 5] = baseIdx + 3;
  }
  
  // Create line segments geometry
  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
  lineGeometry.setAttribute('elevation', new THREE.BufferAttribute(lineElevations, 1));
  
  // Create quad mesh geometry
  const quadGeometry = new THREE.BufferGeometry();
  quadGeometry.setAttribute('position', new THREE.BufferAttribute(quadPositions, 3));
  quadGeometry.setAttribute('elevation', new THREE.BufferAttribute(quadElevations, 1));
  quadGeometry.setIndex(new THREE.BufferAttribute(quadIndices, 1));
  
  // Clean up old geometry before creating new one
  cleanupOldGeometry();
  
  // Create line segments (NO rotation - Earth should be upright)
  lineSegments = new THREE.LineSegments(lineGeometry, material);
  scene.add(lineSegments);
  
  // Create semitransparent quad mesh at mean elevations
  if (!quadMaterial) {
    quadMaterial = createEtopoRangeMaterial(geometryData.globalMin, geometryData.globalMax, geometryData.maxAbsElevation);
    quadMaterial.transparent = true;
    quadMaterial.opacity = 0.3;
    quadMaterial.side = THREE.DoubleSide;
  }
  quadMesh = new THREE.Mesh(quadGeometry, quadMaterial);
  scene.add(quadMesh);
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
      
      // Debounce geometry regeneration to avoid excessive computation
      if (regenerateTimeout) {
        clearTimeout(regenerateTimeout);
      }
      regenerateTimeout = setTimeout(() => {
        generateGeometry();
      }, DEBOUNCE_DELAY_MS);
    }
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
