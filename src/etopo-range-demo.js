/**
 * ETOPO Range Demo
 * Demonstrates loading and rendering HEALPix elevation range data (min, mean, max)
 * from etopo2022_surface_min_mean_max_healpix128_NESTED.npy
 * 
 * Each HEALPix cell is rendered with two meshes:
 * - MIN mesh: solid surface at minimum elevation
 * - MAX mesh: transparent surface at maximum elevation (shows elevation range)
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { geoDelaunay } from 'd3-geo-voronoi';
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
let healpixMesh = null; // MIN elevation mesh (solid)
let maxHealpixMesh = null; // MAX elevation mesh (transparent)
let quadMesh = null;
let innerSphere = null;
let material = null; // Material for MIN mesh
let maxMaterial = null; // Transparent material for MAX mesh
let quadMaterial = null;
let geometryData = null; // Store data for regeneration
let alphaValue = 0.1; // Default alpha value
let regenerateTimeout = null; // For debouncing slider updates
let meshWorker = null; // Worker for mesh generation
let showMaxMesh = true; // Toggle for max elevation mesh

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
    
    // Create material for min elevation mesh
    material = createEtopoRangeMaterial(globalMin, globalMax, maxAbsElevation);
    
    // Create transparent material for max elevation mesh
    maxMaterial = createEtopoRangeMaterial(globalMin, globalMax, maxAbsElevation);
    maxMaterial.transparent = true;
    maxMaterial.opacity = 0.3;
    maxMaterial.depthWrite = false; // Prevent z-fighting issues
    
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
 * Implements the correct approach:
 * 1. Generate positions on sphere
 * 2. Create mesh using d3-geo-voronoi's geoDelaunay (spherical Delaunay triangulation)
 * 3. Displace vertices temporarily for min and max elevations
 * 4. Compute normals from displaced geometry for both min and max
 * 5. Undisplace vertices (back to sphere)
 * 6. Store both sphere positions and precomputed normals
 * 7. Vertex shader re-displaces based on alpha using precomputed normals
 */
function generateHealpixMeshDirect(elevationData, maxAbsElevation) {
  const numPixels = NPIX;
  
  // Step 1: Generate vertex positions on unit sphere
  console.log('Step 1: Generating vertex positions on sphere...');
  
  const positions = new Float32Array(numPixels * 3);
  const minElevations = new Float32Array(numPixels);
  const maxElevations = new Float32Array(numPixels);
  const lonLatPoints = []; // [longitude, latitude] pairs for geoDelaunay
  
  for (let i = 0; i < numPixels; i++) {
    const { theta, phi } = pix2ang_nest(NSIDE, i);
    const [x, y, z] = sphericalToCartesian(theta, phi, 1.0);
    
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    
    // Convert to longitude/latitude for geoDelaunay
    // theta is colatitude [0, π], phi is longitude [0, 2π]
    // latitude = 90° - theta (in degrees)
    // longitude = phi (in degrees), then convert to [-180, 180]
    let longitude = phi * 180 / Math.PI; // Convert to [0, 360]
    if (longitude > 180) longitude -= 360; // Convert to [-180, 180]
    const latitude = 90 - (theta * 180 / Math.PI);  // Convert to [-90, 90]
    lonLatPoints.push([longitude, latitude]);
    
    // Store min and max elevations for this pixel
    minElevations[i] = elevationData[i * 3 + 0];
    maxElevations[i] = elevationData[i * 3 + 2];
  }
  
  // Step 2: Use geoDelaunay for spherical Delaunay triangulation (watertight mesh)
  console.log('Step 2: Creating spherical Delaunay triangulation...');
  const delaunay = geoDelaunay(lonLatPoints);
  // geoDelaunay returns array of arrays: [[i1, i2, i3], [i4, i5, i6], ...]
  // Flatten it to a single array for Three.js: [i1, i2, i3, i4, i5, i6, ...]
  const triangles = delaunay.triangles.flat();
  
  console.log(`Generated ${triangles.length / 3} triangles (spherical Delaunay)`);
  
  // Step 3: Displace vertices temporarily based on MIN elevation
  console.log('Step 3: Temporarily displacing vertices with MIN elevation data...');
  const displacedMinPositions = new Float32Array(positions.length);
  const alpha = MESH_GENERATION_ALPHA;
  
  for (let i = 0; i < numPixels; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    
    const elevation = minElevations[i];
    const r = 1.0 + alpha * elevation / maxAbsElevation;
    
    displacedMinPositions[i * 3] = x * r;
    displacedMinPositions[i * 3 + 1] = y * r;
    displacedMinPositions[i * 3 + 2] = z * r;
  }
  
  // Step 4: Compute normals from displaced MIN geometry
  console.log('Step 4: Computing normals from displaced MIN geometry...');
  const minNormals = new Float32Array(numPixels * 3);
  
  // Accumulate face normals for each vertex
  for (let i = 0; i < triangles.length; i += 3) {
    const i1 = triangles[i], i2 = triangles[i + 1], i3 = triangles[i + 2];
    
    const ax = displacedMinPositions[i1 * 3], ay = displacedMinPositions[i1 * 3 + 1], az = displacedMinPositions[i1 * 3 + 2];
    const bx = displacedMinPositions[i2 * 3], by = displacedMinPositions[i2 * 3 + 1], bz = displacedMinPositions[i2 * 3 + 2];
    const cx = displacedMinPositions[i3 * 3], cy = displacedMinPositions[i3 * 3 + 1], cz = displacedMinPositions[i3 * 3 + 2];
    
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    
    minNormals[i1 * 3] += nx; minNormals[i1 * 3 + 1] += ny; minNormals[i1 * 3 + 2] += nz;
    minNormals[i2 * 3] += nx; minNormals[i2 * 3 + 1] += ny; minNormals[i2 * 3 + 2] += nz;
    minNormals[i3 * 3] += nx; minNormals[i3 * 3 + 1] += ny; minNormals[i3 * 3 + 2] += nz;
  }
  
  // Normalize min normals
  for (let i = 0; i < numPixels; i++) {
    const x = minNormals[i * 3], y = minNormals[i * 3 + 1], z = minNormals[i * 3 + 2];
    const len = Math.sqrt(x * x + y * y + z * z);
    if (len > 0) {
      minNormals[i * 3] /= len;
      minNormals[i * 3 + 1] /= len;
      minNormals[i * 3 + 2] /= len;
    }
  }
  
  // Step 5: Displace vertices temporarily based on MAX elevation
  console.log('Step 5: Temporarily displacing vertices with MAX elevation data...');
  const displacedMaxPositions = new Float32Array(positions.length);
  
  for (let i = 0; i < numPixels; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    
    const elevation = maxElevations[i];
    const r = 1.0 + alpha * elevation / maxAbsElevation;
    
    displacedMaxPositions[i * 3] = x * r;
    displacedMaxPositions[i * 3 + 1] = y * r;
    displacedMaxPositions[i * 3 + 2] = z * r;
  }
  
  // Step 6: Compute normals from displaced MAX geometry
  console.log('Step 6: Computing normals from displaced MAX geometry...');
  const maxNormals = new Float32Array(numPixels * 3);
  
  // Accumulate face normals for each vertex
  for (let i = 0; i < triangles.length; i += 3) {
    const i1 = triangles[i], i2 = triangles[i + 1], i3 = triangles[i + 2];
    
    const ax = displacedMaxPositions[i1 * 3], ay = displacedMaxPositions[i1 * 3 + 1], az = displacedMaxPositions[i1 * 3 + 2];
    const bx = displacedMaxPositions[i2 * 3], by = displacedMaxPositions[i2 * 3 + 1], bz = displacedMaxPositions[i2 * 3 + 2];
    const cx = displacedMaxPositions[i3 * 3], cy = displacedMaxPositions[i3 * 3 + 1], cz = displacedMaxPositions[i3 * 3 + 2];
    
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    
    maxNormals[i1 * 3] += nx; maxNormals[i1 * 3 + 1] += ny; maxNormals[i1 * 3 + 2] += nz;
    maxNormals[i2 * 3] += nx; maxNormals[i2 * 3 + 1] += ny; maxNormals[i2 * 3 + 2] += nz;
    maxNormals[i3 * 3] += nx; maxNormals[i3 * 3 + 1] += ny; maxNormals[i3 * 3 + 2] += nz;
  }
  
  // Normalize max normals
  for (let i = 0; i < numPixels; i++) {
    const x = maxNormals[i * 3], y = maxNormals[i * 3 + 1], z = maxNormals[i * 3 + 2];
    const len = Math.sqrt(x * x + y * y + z * z);
    if (len > 0) {
      maxNormals[i * 3] /= len;
      maxNormals[i * 3 + 1] /= len;
      maxNormals[i * 3 + 2] /= len;
    }
  }
  
  // Step 7: Vertices are already back on the sphere (we kept 'positions' unchanged)
  console.log('Step 7: Using undisplaced sphere positions with precomputed normals...');
  
  // Step 8: Create Three.js geometry for MIN mesh
  console.log('Step 8: Creating MIN mesh geometry...');
  const minGeometry = new THREE.BufferGeometry();
  minGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); // Sphere positions
  minGeometry.setAttribute('normal', new THREE.BufferAttribute(minNormals, 3));     // Precomputed normals for min
  minGeometry.setAttribute('elevation', new THREE.BufferAttribute(minElevations, 1));
  
  // Set indices from Delaunay triangulation
  minGeometry.setIndex(new THREE.BufferAttribute(new Uint32Array(triangles), 1));
  
  // Create min mesh material
  const meshMaterial = material;
  meshMaterial.side = THREE.DoubleSide;
  
  // Step 9: Create and add MIN mesh to scene
  // Vertex shader will re-displace based on alpha uniform using precomputed normals
  healpixMesh = new THREE.Mesh(minGeometry, meshMaterial);
  scene.add(healpixMesh);
  
  console.log(`MIN HEALPix mesh added: ${numPixels} vertices, ${triangles.length / 3} triangles`);
  
  // Step 10: Create Three.js geometry for MAX mesh
  console.log('Step 10: Creating MAX mesh geometry...');
  const maxGeometry = new THREE.BufferGeometry();
  maxGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); // Sphere positions
  maxGeometry.setAttribute('normal', new THREE.BufferAttribute(maxNormals, 3));     // Precomputed normals for max
  maxGeometry.setAttribute('elevation', new THREE.BufferAttribute(maxElevations, 1));
  
  // Set indices from Delaunay triangulation
  maxGeometry.setIndex(new THREE.BufferAttribute(new Uint32Array(triangles), 1));
  
  // Step 11: Create and add transparent MAX mesh to scene if enabled
  if (showMaxMesh) {
    maxHealpixMesh = new THREE.Mesh(maxGeometry, maxMaterial);
    scene.add(maxHealpixMesh);
    console.log(`MAX HEALPix mesh added: ${numPixels} vertices, ${triangles.length / 3} triangles`);
  }
  
  console.log('Vertex shader will handle displacement based on alpha uniform');
}

/**
 * Clean up old geometry and dispose of resources
 */
function cleanupOldGeometry() {
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
  if (maxHealpixMesh) {
    scene.remove(maxHealpixMesh);
    maxHealpixMesh.geometry.dispose();
    // Material is reused, so don't dispose it
  }
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

  // Show max mesh checkbox
  const maxMeshGroup = document.createElement('div');
  maxMeshGroup.style.display = 'flex';
  maxMeshGroup.style.alignItems = 'center';
  maxMeshGroup.style.gap = '8px';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = 'showMaxMeshCheckbox';
  checkbox.checked = showMaxMesh;
  checkbox.style.cursor = 'pointer';

  const checkboxLabel = document.createElement('label');
  checkboxLabel.htmlFor = 'showMaxMeshCheckbox';
  checkboxLabel.textContent = 'Show max mesh';
  checkboxLabel.style.cursor = 'pointer';

  checkbox.addEventListener('change', (e) => {
    showMaxMesh = e.target.checked;
    if (showMaxMesh) {
      if (maxHealpixMesh) {
        scene.add(maxHealpixMesh);
      }
    } else {
      if (maxHealpixMesh) {
        scene.remove(maxHealpixMesh);
      }
    }
  });

  maxMeshGroup.appendChild(checkbox);
  maxMeshGroup.appendChild(checkboxLabel);
  panel.appendChild(maxMeshGroup);

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
    }
    if (maxMaterial) {
      maxMaterial.uniforms.alpha.value = newAlpha;
    }
    // Vertex shader handles displacement based on alpha uniform
    // No need to regenerate geometry
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
