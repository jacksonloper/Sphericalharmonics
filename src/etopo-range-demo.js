/**
 * ETOPO Range Demo
 * Demonstrates loading and rendering HEALPix elevation range data (min, mean, max)
 * from etopo2022_surface_min_mean_max_healpix128_NESTED.npy
 * 
 * Each HEALPix cell is rendered with two meshes:
 * - MIN mesh: solid surface at minimum elevation
 * - MAX mesh: solid surface at maximum elevation (shows elevation range)
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createEtopoRangeMaterial } from './etopoRangeMaterial.js';
import { load } from 'npyjs';
import { pix2ang_nest } from '@hscmap/healpix';
import EtopoRangeWorker from './etopoRangeWorker.js?worker';

// HEALPix parameters
const INITIAL_NSIDE = 64; // Initial resolution
let currentNside = INITIAL_NSIDE; // Track current resolution
const HEALPIX_BASE_FACES = 12; // HEALPix tessellation has 12 base faces

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

// Info card for introduction and loading
const infoCard = document.createElement('div');
infoCard.id = 'infoCard';
infoCard.style.position = 'absolute';
infoCard.style.top = '50%';
infoCard.style.left = '50%';
infoCard.style.transform = 'translate(-50%, -50%)';
infoCard.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
infoCard.style.color = 'white';
infoCard.style.fontFamily = 'system-ui, -apple-system, sans-serif';
infoCard.style.fontSize = '16px';
infoCard.style.padding = '20px';
infoCard.style.borderRadius = '12px';
infoCard.style.width = '90%';
infoCard.style.maxWidth = '500px';
infoCard.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.5)';
infoCard.style.lineHeight = '1.5';
infoCard.style.zIndex = '1000';
infoCard.style.boxSizing = 'border-box';

const cardTitle = document.createElement('h2');
cardTitle.textContent = 'Earth Elevation Visualization';
cardTitle.style.marginTop = '0';
cardTitle.style.marginBottom = '15px';
cardTitle.style.fontSize = '22px';
cardTitle.style.fontWeight = 'bold';

const cardContent = document.createElement('div');
cardContent.id = 'cardContent';
cardContent.innerHTML = `
  <p style="margin: 0 0 12px 0;">Using <strong id="vertexCount">${getNpix(currentNside).toLocaleString()} samples</strong> to map Earth's elevation—will the Great Lakes be visible? Mt. Denali?</p>
  <p style="margin: 0 0 12px 0;">This visualization shows the <em>min</em> and <em>max</em> elevation in each region, divided equally using <a href="https://healpix.sourceforge.io/" target="_blank" style="color: #4ecdc4;">HEALPix</a>. You can also flip to view deep ocean trenches.</p>
  <div id="loadingStatus" style="margin-top: 20px; text-align: center; color: #4ecdc4;">Loading HEALPix data...</div>
`;

infoCard.appendChild(cardTitle);
infoCard.appendChild(cardContent);
document.body.appendChild(infoCard);

// About button (initially hidden)
const aboutButton = document.createElement('button');
aboutButton.id = 'aboutButton';
aboutButton.textContent = 'About';
aboutButton.style.position = 'absolute';
aboutButton.style.top = '15px';
aboutButton.style.left = '15px';
aboutButton.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
aboutButton.style.color = 'white';
aboutButton.style.border = 'none';
aboutButton.style.padding = '10px 20px';
aboutButton.style.borderRadius = '6px';
aboutButton.style.fontSize = '14px';
aboutButton.style.fontFamily = 'system-ui, -apple-system, sans-serif';
aboutButton.style.cursor = 'pointer';
aboutButton.style.display = 'none';
aboutButton.style.zIndex = '1000';
aboutButton.style.transition = 'background-color 0.2s';

aboutButton.addEventListener('mouseenter', () => {
  aboutButton.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
});
aboutButton.addEventListener('mouseleave', () => {
  aboutButton.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
});
aboutButton.addEventListener('click', () => {
  // Show the info card again
  infoCard.style.display = 'block';
  aboutButton.style.display = 'none';
  // Update content to show without loading status
  const loadingStatus = document.getElementById('loadingStatus');
  if (loadingStatus) {
    loadingStatus.style.display = 'none';
  }
  // Re-add the enter button if it's not there
  let enterBtn = document.getElementById('enterButton');
  if (!enterBtn) {
    enterBtn = createEnterButton();
    infoCard.appendChild(enterBtn);
  }
});

document.body.appendChild(aboutButton);

// Global state
let healpixMesh = null; // MIN elevation mesh (solid)
let maxHealpixMesh = null; // MAX elevation mesh (solid)
let quadMesh = null;
let innerSphere = null;
let material = null; // Material for MIN mesh
let maxMaterial = null; // Material for MAX mesh
let quadMaterial = null;
let geometryData = null; // Store data for regeneration
let alphaValue = 0.1; // Default alpha value
let regenerateTimeout = null; // For debouncing slider updates
let meshWorker = null; // Worker for mesh generation
let showMaxMesh = true; // Toggle for max elevation mesh (true = show max, false = show min)
let flipSign = false; // Toggle for flipping elevation sign

// Available nside resolutions
const AVAILABLE_NSIDES = [64, 128, 256];

// Cache for pre-triangulated meshes
const meshCache = {};
AVAILABLE_NSIDES.forEach(nside => meshCache[nside] = null);

/**
 * Create the "Enter Visualization" button
 */
function createEnterButton() {
  const enterButton = document.createElement('button');
  enterButton.id = 'enterButton';
  enterButton.textContent = 'Enter Visualization';
  enterButton.style.marginTop = '20px';
  enterButton.style.padding = '14px 30px';
  enterButton.style.fontSize = '16px';
  enterButton.style.fontWeight = 'bold';
  enterButton.style.backgroundColor = '#4ecdc4';
  enterButton.style.color = 'black';
  enterButton.style.border = 'none';
  enterButton.style.borderRadius = '6px';
  enterButton.style.cursor = 'pointer';
  enterButton.style.width = '100%';
  enterButton.style.transition = 'background-color 0.2s';
  enterButton.style.touchAction = 'manipulation';
  
  enterButton.addEventListener('mouseenter', () => {
    enterButton.style.backgroundColor = '#45b8af';
  });
  enterButton.addEventListener('mouseleave', () => {
    enterButton.style.backgroundColor = '#4ecdc4';
  });
  enterButton.addEventListener('click', () => {
    // Hide the info card
    infoCard.style.display = 'none';
    // Show the about button
    aboutButton.style.display = 'block';
  });
  
  return enterButton;
}

/**
 * Calculate number of HEALPix pixels for a given nside
 */
function getNpix(nside) {
  return HEALPIX_BASE_FACES * nside * nside;
}

/**
 * Update the vertex count display in the about card
 */
function updateVertexCount() {
  const vertexCountElement = document.getElementById('vertexCount');
  if (vertexCountElement) {
    vertexCountElement.textContent = `${getNpix(currentNside).toLocaleString()} samples`;
  }
}

/**
 * Load HEALPix data for a specific nside value
 */
async function loadHealpixData(nside) {
  const startLoadTime = performance.now();
  console.log(`[nside=${nside}] Starting to load data...`);
  
  const filename = `./earthtoposources/etopo2022_surface_min_mean_max_healpix${nside}_NESTED.npy`;
  const data = await load(filename);
  
  const loadTime = performance.now() - startLoadTime;
  console.log(`[nside=${nside}] Data loaded in ${loadTime.toFixed(2)}ms`);
  console.log(`[nside=${nside}] Data shape: ${data.shape}, dtype: ${data.dtype}`);
  
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
  
  console.log(`[nside=${nside}] Elevation range: ${globalMin.toFixed(2)}m to ${globalMax.toFixed(2)}m`);
  console.log(`[nside=${nside}] Max absolute elevation: ${maxAbsElevation.toFixed(2)}m`);
  
  return {
    data: data.data,
    numPixels,
    minVals,
    meanVals,
    maxVals,
    globalMin,
    globalMax,
    maxAbsElevation
  };
}

/**
 * Generate mesh geometry for a specific nside using a worker (non-blocking)
 * Returns a promise that resolves with geometry data
 */
function generateMeshGeometry(nside, elevationData, minElevations, maxElevations, maxAbsElevation) {
  return new Promise((resolve, reject) => {
    const startTime = performance.now();
    console.log(`[nside=${nside}] Starting triangulation in worker...`);
    
    const worker = new EtopoRangeWorker();
    
    worker.onmessage = (e) => {
      const { type } = e.data;
      
      if (type === 'status') {
        console.log(`[nside=${nside}] ${e.data.message}`);
      } else if (type === 'progress') {
        console.log(`[nside=${nside}] ${e.data.message}`);
      } else if (type === 'complete') {
        const totalTime = performance.now() - startTime;
        console.log(`[nside=${nside}] Triangulation completed in ${totalTime.toFixed(2)}ms`);
        
        // Convert transferred ArrayBuffers back to typed arrays
        const result = {
          positions: new Float32Array(e.data.positions),
          minNormals: new Float32Array(e.data.minNormals),
          maxNormals: new Float32Array(e.data.maxNormals),
          minElevations: new Float32Array(e.data.minElevations),
          maxElevations: new Float32Array(e.data.maxElevations),
          triangles: new Uint32Array(e.data.triangles),
          numPixels: e.data.numPixels
        };
        
        worker.terminate();
        resolve(result);
      } else if (type === 'error') {
        console.error(`[nside=${nside}] Worker error:`, e.data.message);
        worker.terminate();
        reject(new Error(e.data.message));
      }
    };
    
    worker.onerror = (error) => {
      console.error(`[nside=${nside}] Worker error:`, error);
      worker.terminate();
      reject(error);
    };
    
    // Send data to worker
    worker.postMessage({
      nside,
      minElevations,
      maxElevations,
      maxAbsElevation
    });
  });
}

/**
 * Load and visualize HEALPix data
 */
async function loadAndVisualize() {
  try {
    // Load initial data for nside=64
    const data = await loadHealpixData(currentNside);
    
    // Store data for regeneration when slider changes
    geometryData = {
      numPixels: data.numPixels,
      minVals: data.minVals,
      meanVals: data.meanVals,
      maxVals: data.maxVals,
      globalMin: data.globalMin,
      globalMax: data.globalMax,
      maxAbsElevation: data.maxAbsElevation
    };
    
    // Create material for min elevation mesh
    material = createEtopoRangeMaterial(data.globalMin, data.globalMax, data.maxAbsElevation);
    
    // Create material for max elevation mesh (fully opaque)
    maxMaterial = createEtopoRangeMaterial(data.globalMin, data.globalMax, data.maxAbsElevation);
    
    // Create inner non-transparent sphere at radius 0.4
    const innerSphereGeometry = new THREE.SphereGeometry(0.4, 64, 64);
    const innerSphereMaterial = new THREE.MeshBasicMaterial({
      color: 0x1a1a1a,
      side: THREE.BackSide
    });
    innerSphere = new THREE.Mesh(innerSphereGeometry, innerSphereMaterial);
    scene.add(innerSphere);
    
    // Generate HEALPix mesh using worker (non-blocking)
    const loadingStatus = document.getElementById('loadingStatus');
    if (loadingStatus) {
      loadingStatus.textContent = 'Generating HEALPix mesh...';
    }
    
    const meshGeometry = await generateMeshGeometry(currentNside, data.data, data.minVals, data.maxVals, data.maxAbsElevation);
    
    // Store in cache with consistent structure
    meshCache[currentNside] = { geometry: meshGeometry, data: data };
    
    // Create and add meshes to scene
    createMeshesFromGeometry(meshGeometry, data.maxAbsElevation);
    
    // Update loading status and add Enter button
    if (loadingStatus) {
      loadingStatus.style.display = 'none';
    }
    
    // Add Enter Visualization button
    const enterButton = createEnterButton();
    infoCard.appendChild(enterButton);
    
    // Start background triangulation for 128 and 256
    startBackgroundTriangulation();
    
  } catch (error) {
    console.error('Failed to load data:', error);
    const loadingStatus = document.getElementById('loadingStatus');
    if (loadingStatus) {
      loadingStatus.innerHTML = 'Failed: ' + error.message;
      loadingStatus.style.color = '#ff4444';
    }
  }
}

/**
 * Create Three.js meshes from geometry data and add to scene
 */
function createMeshesFromGeometry(meshGeometry, maxAbsElevation) {
  // Create min mesh
  const minGeometry = new THREE.BufferGeometry();
  minGeometry.setAttribute('position', new THREE.BufferAttribute(meshGeometry.positions, 3));
  minGeometry.setAttribute('normal', new THREE.BufferAttribute(meshGeometry.minNormals, 3));
  minGeometry.setAttribute('elevation', new THREE.BufferAttribute(meshGeometry.minElevations, 1));
  minGeometry.setIndex(new THREE.BufferAttribute(new Uint32Array(meshGeometry.triangles), 1));
  
  const meshMaterial = material;
  meshMaterial.side = THREE.DoubleSide;
  
  healpixMesh = new THREE.Mesh(minGeometry, meshMaterial);
  if (!showMaxMesh) {
    scene.add(healpixMesh);
  }
  
  console.log(`MIN HEALPix mesh added: ${meshGeometry.numPixels} vertices, ${meshGeometry.triangles.length / 3} triangles`);
  
  // Create max mesh
  const maxGeometry = new THREE.BufferGeometry();
  maxGeometry.setAttribute('position', new THREE.BufferAttribute(meshGeometry.positions, 3));
  maxGeometry.setAttribute('normal', new THREE.BufferAttribute(meshGeometry.maxNormals, 3));
  maxGeometry.setAttribute('elevation', new THREE.BufferAttribute(meshGeometry.maxElevations, 1));
  maxGeometry.setIndex(new THREE.BufferAttribute(new Uint32Array(meshGeometry.triangles), 1));
  
  maxHealpixMesh = new THREE.Mesh(maxGeometry, maxMaterial);
  if (showMaxMesh) {
    scene.add(maxHealpixMesh);
  }
  
  console.log(`MAX HEALPix mesh added: ${meshGeometry.numPixels} vertices, ${meshGeometry.triangles.length / 3} triangles`);
}

/**
 * Start background triangulation for resolutions not yet loaded
 */
async function startBackgroundTriangulation() {
  // Get nsides that need triangulation (excluding current)
  const nsidesToTriangulate = AVAILABLE_NSIDES.filter(n => n !== currentNside && !meshCache[n]);
  
  // Triangulate each in sequence using worker
  for (const nside of nsidesToTriangulate) {
    try {
      const data = await loadHealpixData(nside);
      const meshGeometry = await generateMeshGeometry(nside, data.data, data.minVals, data.maxVals, data.maxAbsElevation);
      meshCache[nside] = { geometry: meshGeometry, data: data };
      console.log(`[nside=${nside}] Pre-triangulation complete and cached`);
    } catch (error) {
      console.error(`[nside=${nside}] Failed to pre-triangulate:`, error);
    }
  }
}

/**
 * Switch to a different nside resolution
 */
async function switchToNside(newNside) {
  if (newNside === currentNside) return; // Already at this resolution
  
  console.log(`Switching from nside=${currentNside} to nside=${newNside}`);
  
  try {
    // Update current nside
    currentNside = newNside;
    
    // Update vertex count display
    updateVertexCount();
    
    // Check if we have cached geometry
    if (meshCache[newNside]) {
      console.log(`Using cached geometry for nside=${newNside}`);
      const cached = meshCache[newNside];
      
      // Update global geometry data
      geometryData = {
        numPixels: cached.data.numPixels,
        minVals: cached.data.minVals,
        meanVals: cached.data.meanVals,
        maxVals: cached.data.maxVals,
        globalMin: cached.data.globalMin,
        globalMax: cached.data.globalMax,
        maxAbsElevation: cached.data.maxAbsElevation
      };
      
      // Clean up old meshes
      cleanupOldGeometry();
      
      // Update materials (if they exist and have uniforms)
      if (material && material.uniforms) {
        if (material.uniforms.globalMin) material.uniforms.globalMin.value = cached.data.globalMin;
        if (material.uniforms.globalMax) material.uniforms.globalMax.value = cached.data.globalMax;
        if (material.uniforms.maxAbsElevation) material.uniforms.maxAbsElevation.value = cached.data.maxAbsElevation;
      }
      if (maxMaterial && maxMaterial.uniforms) {
        if (maxMaterial.uniforms.globalMin) maxMaterial.uniforms.globalMin.value = cached.data.globalMin;
        if (maxMaterial.uniforms.globalMax) maxMaterial.uniforms.globalMax.value = cached.data.globalMax;
        if (maxMaterial.uniforms.maxAbsElevation) maxMaterial.uniforms.maxAbsElevation.value = cached.data.maxAbsElevation;
      }
      
      // Create new meshes from cached geometry
      createMeshesFromGeometry(cached.geometry, cached.data.maxAbsElevation);
    } else {
      console.log(`Loading and triangulating nside=${newNside}...`);
      // Need to load and triangulate
      const data = await loadHealpixData(newNside);
      
      // Update global geometry data
      geometryData = {
        numPixels: data.numPixels,
        minVals: data.minVals,
        meanVals: data.meanVals,
        maxVals: data.maxVals,
        globalMin: data.globalMin,
        globalMax: data.globalMax,
        maxAbsElevation: data.maxAbsElevation
      };
      
      // Clean up old meshes
      cleanupOldGeometry();
      
      // Update materials (if they exist and have uniforms)
      if (material && material.uniforms) {
        if (material.uniforms.globalMin) material.uniforms.globalMin.value = data.globalMin;
        if (material.uniforms.globalMax) material.uniforms.globalMax.value = data.globalMax;
        if (material.uniforms.maxAbsElevation) material.uniforms.maxAbsElevation.value = data.maxAbsElevation;
      }
      if (maxMaterial && maxMaterial.uniforms) {
        if (maxMaterial.uniforms.globalMin) maxMaterial.uniforms.globalMin.value = data.globalMin;
        if (maxMaterial.uniforms.globalMax) maxMaterial.uniforms.globalMax.value = data.globalMax;
        if (maxMaterial.uniforms.maxAbsElevation) maxMaterial.uniforms.maxAbsElevation.value = data.maxAbsElevation;
      }
      
      // Generate and add meshes using worker
      const meshGeometry = await generateMeshGeometry(newNside, data.data, data.minVals, data.maxVals, data.maxAbsElevation);
      meshCache[newNside] = { geometry: meshGeometry, data: data };
      createMeshesFromGeometry(meshGeometry, data.maxAbsElevation);
    }
  } catch (error) {
    console.error(`Failed to switch to nside=${newNside}:`, error);
    // Revert to previous nside if switch failed
    currentNside = AVAILABLE_NSIDES.find(n => meshCache[n]) || INITIAL_NSIDE;
    updateVertexCount();
  }
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

  // Radio buttons for min/max mesh selection
  const meshTypeGroup = document.createElement('div');
  meshTypeGroup.style.display = 'flex';
  meshTypeGroup.style.alignItems = 'center';
  meshTypeGroup.style.gap = '12px';

  // Min mesh radio button (min elevation)
  const minRadio = document.createElement('input');
  minRadio.type = 'radio';
  minRadio.name = 'meshType';
  minRadio.id = 'minMeshRadio';
  minRadio.checked = !showMaxMesh;
  minRadio.style.cursor = 'pointer';

  const minLabel = document.createElement('label');
  minLabel.htmlFor = 'minMeshRadio';
  minLabel.textContent = 'Min mesh';
  minLabel.style.cursor = 'pointer';

  // Max mesh radio button (max elevation)
  const maxRadio = document.createElement('input');
  maxRadio.type = 'radio';
  maxRadio.name = 'meshType';
  maxRadio.id = 'maxMeshRadio';
  maxRadio.checked = showMaxMesh;
  maxRadio.style.cursor = 'pointer';

  const maxLabel = document.createElement('label');
  maxLabel.htmlFor = 'maxMeshRadio';
  maxLabel.textContent = 'Max mesh';
  maxLabel.style.cursor = 'pointer';

  // Radio button change handlers
  const handleMeshTypeChange = () => {
    showMaxMesh = maxRadio.checked;
    
    if (showMaxMesh) {
      // Show max mesh (max elevation), hide min mesh
      if (maxHealpixMesh && !maxHealpixMesh.parent) scene.add(maxHealpixMesh);
      if (healpixMesh && healpixMesh.parent) scene.remove(healpixMesh);
    } else {
      // Show min mesh (min elevation), hide max mesh
      if (healpixMesh && !healpixMesh.parent) scene.add(healpixMesh);
      if (maxHealpixMesh && maxHealpixMesh.parent) scene.remove(maxHealpixMesh);
    }
  };

  minRadio.addEventListener('change', handleMeshTypeChange);
  maxRadio.addEventListener('change', handleMeshTypeChange);

  meshTypeGroup.appendChild(minRadio);
  meshTypeGroup.appendChild(minLabel);
  meshTypeGroup.appendChild(maxRadio);
  meshTypeGroup.appendChild(maxLabel);
  panel.appendChild(meshTypeGroup);

  // Flip sign checkbox
  const flipSignGroup = document.createElement('div');
  flipSignGroup.style.display = 'flex';
  flipSignGroup.style.alignItems = 'center';
  flipSignGroup.style.gap = '8px';

  const flipCheckbox = document.createElement('input');
  flipCheckbox.type = 'checkbox';
  flipCheckbox.id = 'flipSignCheckbox';
  flipCheckbox.checked = flipSign;
  flipCheckbox.style.cursor = 'pointer';

  const flipLabel = document.createElement('label');
  flipLabel.htmlFor = 'flipSignCheckbox';
  flipLabel.textContent = 'Flip sign';
  flipLabel.style.cursor = 'pointer';

  flipCheckbox.addEventListener('change', (e) => {
    flipSign = e.target.checked;
    // Update uniforms in materials to flip the sign
    if (material) {
      material.uniforms.flipSign.value = flipSign ? -1.0 : 1.0;
    }
    if (maxMaterial) {
      maxMaterial.uniforms.flipSign.value = flipSign ? -1.0 : 1.0;
    }
  });

  flipSignGroup.appendChild(flipCheckbox);
  flipSignGroup.appendChild(flipLabel);
  panel.appendChild(flipSignGroup);

  // Nside selector dropdown
  const nsideGroup = document.createElement('div');
  nsideGroup.style.display = 'flex';
  nsideGroup.style.alignItems = 'center';
  nsideGroup.style.gap = '8px';

  const nsideLabel = document.createElement('span');
  nsideLabel.textContent = 'Resolution:';
  nsideGroup.appendChild(nsideLabel);

  const nsideSelect = document.createElement('select');
  nsideSelect.id = 'nsideSelect';
  nsideSelect.style.cursor = 'pointer';
  nsideSelect.style.padding = '4px 8px';
  nsideSelect.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
  nsideSelect.style.color = 'white';
  nsideSelect.style.border = '1px solid rgba(255, 255, 255, 0.3)';
  nsideSelect.style.borderRadius = '4px';
  nsideSelect.style.fontFamily = 'monospace';
  nsideSelect.style.fontSize = '12px';

  // Add options: named by number of vertices (computed dynamically)
  AVAILABLE_NSIDES.forEach(nside => {
    const optionEl = document.createElement('option');
    optionEl.value = nside;
    optionEl.textContent = `${getNpix(nside).toLocaleString()} vertices`;
    if (nside === currentNside) {
      optionEl.selected = true;
    }
    nsideSelect.appendChild(optionEl);
  });

  nsideSelect.addEventListener('change', async (e) => {
    const newNside = parseInt(e.target.value);
    await switchToNside(newNside);
  });

  nsideGroup.appendChild(nsideSelect);
  panel.appendChild(nsideGroup);

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
