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
import EtopoRangeWorker from './etopoRangeWorker.js?worker';

// HEALPix parameters
const INITIAL_NSIDE = 64; // Initial resolution
let currentNside = INITIAL_NSIDE; // Track current resolution
const HEALPIX_BASE_FACES = 12; // HEALPix tessellation has 12 base faces

// Available nside resolutions
const AVAILABLE_NSIDES = [64, 128, 256];

// Start the worker immediately - it will autonomously process all resolutions
const worker = new EtopoRangeWorker();

// Track the displayed nside (what's actually shown) vs selected nside (what user wants)
let displayedNside = INITIAL_NSIDE;

// UI constants
const DEBOUNCE_DELAY_MS = 100; // Delay for slider debouncing
const HEALPIX_DOT_BASE_SIZE = 0.01; // Base dot size for reference resolution (INITIAL_NSIDE)

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

// Info card for introduction and loading (already in HTML)
const infoCard = document.getElementById('infoCard');

// Get existing About button from HTML
const aboutButton = document.getElementById('aboutButton');

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

// Global state
let healpixMesh = null; // MIN elevation mesh (solid)
let meanHealpixMesh = null; // MEAN elevation mesh (solid)
let maxHealpixMesh = null; // MAX elevation mesh (solid)
let quadMesh = null;
let innerSphere = null;
let material = null; // Material for MIN mesh
let meanMaterial = null; // Material for MEAN mesh
let maxMaterial = null; // Material for MAX mesh
let quadMaterial = null;
let geometryData = null; // Store data for regeneration
let alphaValue = 0.1; // Default alpha value
let regenerateTimeout = null; // For debouncing slider updates
let currentMeshType = 'max'; // Toggle for which mesh to show: 'min', 'mean', or 'max'
let flipSign = false; // Toggle for flipping elevation sign
let loadingOverlay = null; // Loading overlay for resolution switching
let healpixDotsPoints = null; // Points mesh for HEALPix location dots
let showHealpixDots = false; // Toggle for showing HEALPix location dots
let circleTexture = null; // Cached circular texture for point sprites

// Cache for pre-triangulated meshes
const meshCache = {};
AVAILABLE_NSIDES.forEach(nside => meshCache[nside] = null);

// Track which nside we're waiting for first (to show initial visualization)
let waitingForInitialNside = INITIAL_NSIDE;
let isInitialized = false;

/**
 * Handle messages from the worker
 */
worker.onmessage = (e) => {
  const { type, nside } = e.data;
  
  if (type === 'status') {
    console.log(`[nside=${nside}] ${e.data.message}`);
    if (nside === waitingForInitialNside && !isInitialized) {
      const loadingStatus = document.getElementById('loadingStatus');
      if (loadingStatus) {
        loadingStatus.textContent = e.data.message;
      }
    } else if (nside === 128 || nside === 256) {
      showLoading(nside);
    }
  } else if (type === 'progress') {
    console.log(`[nside=${nside}] ${e.data.message}`);
  } else if (type === 'complete') {
    console.log(`[nside=${nside}] Triangulation completed in ${e.data.triangulationTime.toFixed(2)}ms`);
    
    // Convert transferred ArrayBuffers back to typed arrays
    const meshGeometry = {
      positions: new Float32Array(e.data.positions),
      minNormals: new Float32Array(e.data.minNormals),
      meanNormals: new Float32Array(e.data.meanNormals),
      maxNormals: new Float32Array(e.data.maxNormals),
      minElevations: new Float32Array(e.data.minElevations),
      meanElevations: new Float32Array(e.data.meanElevations),
      maxElevations: new Float32Array(e.data.maxElevations),
      waterOccurrence: new Float32Array(e.data.waterOccurrence),
      triangles: new Uint32Array(e.data.triangles),
      numPixels: e.data.numPixels
    };
    
    const data = {
      numPixels: e.data.numPixels,
      minVals: meshGeometry.minElevations,
      meanVals: meshGeometry.meanElevations,
      maxVals: meshGeometry.maxElevations,
      globalMin: e.data.globalMin,
      globalMax: e.data.globalMax,
      maxAbsElevation: e.data.maxAbsElevation
    };
    
    // Cache the result
    meshCache[nside] = { geometry: meshGeometry, data: data };
    
    // If this is the initial nside, initialize the scene
    if (nside === waitingForInitialNside && !isInitialized) {
      initializeScene(nside, meshGeometry, data);
      isInitialized = true;
    }
    
    // If user selected this nside and it's not currently displayed, switch to it automatically
    if (nside === currentNside && isInitialized && nside !== displayedNside) {
      console.log(`Auto-switching to nside=${nside} now that it's loaded`);
      performNsideSwitch(nside);
    } else if (nside !== waitingForInitialNside) {
      // Hide loading indicator for background loads (non-initial resolutions)
      hideLoading();
    }
  } else if (type === 'error') {
    console.error(`[nside=${nside}] Worker error:`, e.data.message);
    hideLoading();
  }
};

worker.onerror = (error) => {
  console.error('Worker error:', error);
  hideLoading();
};

/**
 * Initialize the scene with the first loaded geometry
 */
function initializeScene(nside, meshGeometry, data) {
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
  
  // Create material for mean elevation mesh
  meanMaterial = createEtopoRangeMaterial(data.globalMin, data.globalMax, data.maxAbsElevation);
  
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
  
  // Create and add meshes to scene
  createMeshesFromGeometry(meshGeometry, data.maxAbsElevation);
  
  // Set the initial displayed nside
  displayedNside = nside;
  
  // Update loading status and add Enter button
  const loadingStatus = document.getElementById('loadingStatus');
  if (loadingStatus) {
    loadingStatus.style.display = 'none';
  }
  
  // Add Enter Visualization button
  const enterButton = createEnterButton();
  infoCard.appendChild(enterButton);
}

/**
 * Get estimated time message for triangulation
 */
function getEstimatedTimeMessage(nside) {
  if (nside === 256) {
    return 'This can take up to 1 minute...';
  } else if (nside === 128) {
    return 'This can take up to 10 seconds...';
  }
  return '';
}

/**
 * Setup loading overlay for resolution switching
 */
function setupLoadingOverlay() {
  const overlay = document.getElementById('loadingOverlay');
  return overlay;
}

/**
 * Show loading overlay with estimated time and current viewing resolution
 */
function showLoading(targetNside) {
  if (!loadingOverlay) {
    loadingOverlay = setupLoadingOverlay();
  }
  
  const loadingText = loadingOverlay.querySelector('.loading-text');
  if (loadingText) {
    loadingText.textContent = `Loading ${getNpix(targetNside).toLocaleString()} vertex resolution...`;
  }
  
  const currentViewText = document.getElementById('currentViewText');
  if (currentViewText && displayedNside !== undefined && displayedNside !== targetNside) {
    currentViewText.textContent = `Currently viewing: ${getNpix(displayedNside).toLocaleString()} vertices`;
    currentViewText.style.display = 'block';
  } else if (currentViewText) {
    currentViewText.style.display = 'none';
  }
  
  const estimateText = document.getElementById('estimateText');
  if (estimateText) {
    estimateText.textContent = getEstimatedTimeMessage(targetNside);
  }
  
  loadingOverlay.style.display = 'block';
}

/**
 * Hide loading overlay
 */
function hideLoading() {
  if (loadingOverlay) {
    loadingOverlay.style.display = 'none';
  }
}

/**
 * Create the "Enter Visualization" button
 */
function createEnterButton() {
  const enterButton = document.createElement('button');
  enterButton.id = 'enterButton';
  enterButton.textContent = 'Enter Visualization';
  
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
    vertexCountElement.textContent = getNpix(currentNside).toLocaleString();
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
  minGeometry.setAttribute('waterOccurrence', new THREE.BufferAttribute(meshGeometry.waterOccurrence, 1));
  minGeometry.setIndex(new THREE.BufferAttribute(new Uint32Array(meshGeometry.triangles), 1));
  
  const meshMaterial = material;
  meshMaterial.side = THREE.DoubleSide;
  
  healpixMesh = new THREE.Mesh(minGeometry, meshMaterial);
  if (currentMeshType === 'min') {
    scene.add(healpixMesh);
  }
  
  console.log(`Min HEALPix mesh added: ${meshGeometry.numPixels} vertices, ${meshGeometry.triangles.length / 3} triangles`);
  
  // Create mean mesh
  const meanGeometry = new THREE.BufferGeometry();
  meanGeometry.setAttribute('position', new THREE.BufferAttribute(meshGeometry.positions, 3));
  meanGeometry.setAttribute('normal', new THREE.BufferAttribute(meshGeometry.meanNormals, 3));
  meanGeometry.setAttribute('elevation', new THREE.BufferAttribute(meshGeometry.meanElevations, 1));
  meanGeometry.setAttribute('waterOccurrence', new THREE.BufferAttribute(meshGeometry.waterOccurrence, 1));
  meanGeometry.setIndex(new THREE.BufferAttribute(new Uint32Array(meshGeometry.triangles), 1));
  
  meanHealpixMesh = new THREE.Mesh(meanGeometry, meanMaterial);
  if (currentMeshType === 'mean') {
    scene.add(meanHealpixMesh);
  }
  
  console.log(`Mean HEALPix mesh added: ${meshGeometry.numPixels} vertices, ${meshGeometry.triangles.length / 3} triangles`);
  
  // Create max mesh
  const maxGeometry = new THREE.BufferGeometry();
  maxGeometry.setAttribute('position', new THREE.BufferAttribute(meshGeometry.positions, 3));
  maxGeometry.setAttribute('normal', new THREE.BufferAttribute(meshGeometry.maxNormals, 3));
  maxGeometry.setAttribute('elevation', new THREE.BufferAttribute(meshGeometry.maxElevations, 1));
  maxGeometry.setAttribute('waterOccurrence', new THREE.BufferAttribute(meshGeometry.waterOccurrence, 1));
  maxGeometry.setIndex(new THREE.BufferAttribute(new Uint32Array(meshGeometry.triangles), 1));
  
  maxHealpixMesh = new THREE.Mesh(maxGeometry, maxMaterial);
  if (currentMeshType === 'max') {
    scene.add(maxHealpixMesh);
  }
  
  console.log(`Max HEALPix mesh added: ${meshGeometry.numPixels} vertices, ${meshGeometry.triangles.length / 3} triangles`);
  
  // Create HEALPix location dots
  createHealpixDots(meshGeometry);
}

/**
 * Get or create a circular texture for point sprites (cached)
 */
function getCircleTexture() {
  if (!circleTexture) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    
    const ctx = canvas.getContext('2d');
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = canvas.width / 2 - 1; // Slightly smaller to prevent edge clipping
    
    // Draw a circle
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.fillStyle = 'white';
    ctx.fill();
    
    circleTexture = new THREE.CanvasTexture(canvas);
    circleTexture.needsUpdate = true;
  }
  return circleTexture;
}

/**
 * Clean up HEALPix dots
 */
function cleanupHealpixDots() {
  if (healpixDotsPoints) {
    scene.remove(healpixDotsPoints);
    healpixDotsPoints.geometry.dispose();
    // Note: circleTexture is cached globally and reused across resolution switches.
    // It will be automatically garbage collected when the page is closed/refreshed.
    healpixDotsPoints.material.dispose();
    healpixDotsPoints = null;
  }
}

/**
 * Create points at each HEALPix pixel location (at elevation 0)
 * Note: meshGeometry.positions contains unit sphere coordinates (r=1.0)
 * before displacement, so dots are correctly placed at elevation 0
 */
function createHealpixDots(meshGeometry) {
  // Clean up old dots if they exist
  cleanupHealpixDots();
  
  // Create geometry for points at elevation 0 (unit sphere)
  const dotsGeometry = new THREE.BufferGeometry();
  dotsGeometry.setAttribute('position', new THREE.BufferAttribute(meshGeometry.positions, 3));
  
  // Calculate dot size: scale inversely with nside so dots remain proportional to grid spacing
  // Reference: INITIAL_NSIDE uses HEALPIX_DOT_BASE_SIZE, size scales as (INITIAL_NSIDE / currentNside)
  const dotSize = HEALPIX_DOT_BASE_SIZE * (INITIAL_NSIDE / currentNside);
  
  // Create material for the points with circular shape
  const dotsMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: dotSize,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.6,
    map: getCircleTexture(),
    alphaTest: 0.5
  });
  
  healpixDotsPoints = new THREE.Points(dotsGeometry, dotsMaterial);
  if (showHealpixDots) {
    scene.add(healpixDotsPoints);
  }
  
  console.log(`HEALPix dots created: ${meshGeometry.numPixels} points, size: ${dotSize.toFixed(4)}`);
}

/**
 * Perform the actual switch to a new nside resolution (internal helper)
 * Assumes the geometry is already cached in meshCache[nside]
 */
function performNsideSwitch(nside) {
  // Validate cached data exists
  if (!meshCache[nside]) {
    console.error(`Cannot switch to nside=${nside}: geometry not cached`);
    return;
  }
  
  console.log(`Using cached geometry for nside=${nside}`);
  const cached = meshCache[nside];
  
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
  if (meanMaterial && meanMaterial.uniforms) {
    if (meanMaterial.uniforms.globalMin) meanMaterial.uniforms.globalMin.value = cached.data.globalMin;
    if (meanMaterial.uniforms.globalMax) meanMaterial.uniforms.globalMax.value = cached.data.globalMax;
    if (meanMaterial.uniforms.maxAbsElevation) meanMaterial.uniforms.maxAbsElevation.value = cached.data.maxAbsElevation;
  }
  if (maxMaterial && maxMaterial.uniforms) {
    if (maxMaterial.uniforms.globalMin) maxMaterial.uniforms.globalMin.value = cached.data.globalMin;
    if (maxMaterial.uniforms.globalMax) maxMaterial.uniforms.globalMax.value = cached.data.globalMax;
    if (maxMaterial.uniforms.maxAbsElevation) maxMaterial.uniforms.maxAbsElevation.value = cached.data.maxAbsElevation;
  }
  
  // Create new meshes from cached geometry
  createMeshesFromGeometry(cached.geometry, cached.data.maxAbsElevation);
  
  // Update displayed nside to reflect what's actually shown
  displayedNside = nside;
  
  hideLoading();
}

/**
 * Switch to a different nside resolution
 */
function switchToNside(newNside) {
  if (newNside === currentNside) return; // Already at this resolution
  
  console.log(`Switching from nside=${currentNside} to nside=${newNside}`);
  
  // Update current nside (what user wants)
  currentNside = newNside;
  
  // Update vertex count display
  updateVertexCount();
  
  // Check if we have cached geometry
  if (meshCache[newNside]) {
    performNsideSwitch(newNside);
  } else {
    // Not yet cached, show loading indicator with current viewing resolution
    console.log(`[nside=${newNside}] Waiting for triangulation to complete...`);
    showLoading(newNside);
    // Note: displayedNside stays at the old value since we haven't actually switched yet
  }
}

/**
 * Clean up old geometry and dispose of resources
 */
function cleanupOldGeometry() {
  if (quadMesh) {
    scene.remove(quadMesh);
    quadMesh.geometry.dispose();
  }
  if (healpixMesh) {
    scene.remove(healpixMesh);
    healpixMesh.geometry.dispose();
  }
  if (meanHealpixMesh) {
    scene.remove(meanHealpixMesh);
    meanHealpixMesh.geometry.dispose();
  }
  if (maxHealpixMesh) {
    scene.remove(maxHealpixMesh);
    maxHealpixMesh.geometry.dispose();
  }
  // Note: Materials are reused across resolution switches, so we don't dispose them
  cleanupHealpixDots();
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

  // Radio buttons for min/mean/max mesh selection
  const meshTypeGroup = document.createElement('div');
  meshTypeGroup.style.display = 'flex';
  meshTypeGroup.style.alignItems = 'center';
  meshTypeGroup.style.gap = '12px';

  // Min mesh radio button (min elevation)
  const minRadio = document.createElement('input');
  minRadio.type = 'radio';
  minRadio.name = 'meshType';
  minRadio.id = 'minMeshRadio';
  minRadio.checked = (currentMeshType === 'min');
  minRadio.style.cursor = 'pointer';

  const minLabel = document.createElement('label');
  minLabel.htmlFor = 'minMeshRadio';
  minLabel.textContent = 'Min';
  minLabel.style.cursor = 'pointer';

  // Mean mesh radio button (mean elevation)
  const meanRadio = document.createElement('input');
  meanRadio.type = 'radio';
  meanRadio.name = 'meshType';
  meanRadio.id = 'meanMeshRadio';
  meanRadio.checked = (currentMeshType === 'mean');
  meanRadio.style.cursor = 'pointer';

  const meanLabel = document.createElement('label');
  meanLabel.htmlFor = 'meanMeshRadio';
  meanLabel.textContent = 'Mean';
  meanLabel.style.cursor = 'pointer';

  // Max mesh radio button (max elevation)
  const maxRadio = document.createElement('input');
  maxRadio.type = 'radio';
  maxRadio.name = 'meshType';
  maxRadio.id = 'maxMeshRadio';
  maxRadio.checked = (currentMeshType === 'max');
  maxRadio.style.cursor = 'pointer';

  const maxLabel = document.createElement('label');
  maxLabel.htmlFor = 'maxMeshRadio';
  maxLabel.textContent = 'Max';
  maxLabel.style.cursor = 'pointer';

  // Radio button change handlers
  const handleMeshTypeChange = () => {
    if (minRadio.checked) {
      currentMeshType = 'min';
    } else if (meanRadio.checked) {
      currentMeshType = 'mean';
    } else {
      currentMeshType = 'max';
    }
    
    // Hide all meshes first
    if (healpixMesh && healpixMesh.parent) scene.remove(healpixMesh);
    if (meanHealpixMesh && meanHealpixMesh.parent) scene.remove(meanHealpixMesh);
    if (maxHealpixMesh && maxHealpixMesh.parent) scene.remove(maxHealpixMesh);
    
    // Show the selected mesh
    if (currentMeshType === 'min' && healpixMesh && !healpixMesh.parent) {
      scene.add(healpixMesh);
    } else if (currentMeshType === 'mean' && meanHealpixMesh && !meanHealpixMesh.parent) {
      scene.add(meanHealpixMesh);
    } else if (currentMeshType === 'max' && maxHealpixMesh && !maxHealpixMesh.parent) {
      scene.add(maxHealpixMesh);
    }
  };

  minRadio.addEventListener('change', handleMeshTypeChange);
  meanRadio.addEventListener('change', handleMeshTypeChange);
  maxRadio.addEventListener('change', handleMeshTypeChange);

  meshTypeGroup.appendChild(minRadio);
  meshTypeGroup.appendChild(minLabel);
  meshTypeGroup.appendChild(meanRadio);
  meshTypeGroup.appendChild(meanLabel);
  meshTypeGroup.appendChild(maxRadio);
  meshTypeGroup.appendChild(maxLabel);
  panel.appendChild(meshTypeGroup);

  // Flip oceans checkbox
  const flipOceansGroup = document.createElement('div');
  flipOceansGroup.style.display = 'flex';
  flipOceansGroup.style.alignItems = 'center';
  flipOceansGroup.style.gap = '8px';

  const flipCheckbox = document.createElement('input');
  flipCheckbox.type = 'checkbox';
  flipCheckbox.id = 'flipOceansCheckbox';
  flipCheckbox.checked = flipSign;
  flipCheckbox.style.cursor = 'pointer';

  const flipLabel = document.createElement('label');
  flipLabel.htmlFor = 'flipOceansCheckbox';
  flipLabel.textContent = 'Flip oceans';
  flipLabel.style.cursor = 'pointer';

  flipCheckbox.addEventListener('change', (e) => {
    flipSign = e.target.checked;
    // Update uniforms in materials to use absolute elevation
    if (material) {
      material.uniforms.flipOceans.value = flipSign ? 1.0 : 0.0;
    }
    if (meanMaterial) {
      meanMaterial.uniforms.flipOceans.value = flipSign ? 1.0 : 0.0;
    }
    if (maxMaterial) {
      maxMaterial.uniforms.flipOceans.value = flipSign ? 1.0 : 0.0;
    }
  });

  flipOceansGroup.appendChild(flipCheckbox);
  flipOceansGroup.appendChild(flipLabel);
  panel.appendChild(flipOceansGroup);

  // Show HEALPix dots checkbox
  const dotsGroup = document.createElement('div');
  dotsGroup.style.display = 'flex';
  dotsGroup.style.alignItems = 'center';
  dotsGroup.style.gap = '8px';

  const dotsCheckbox = document.createElement('input');
  dotsCheckbox.type = 'checkbox';
  dotsCheckbox.id = 'dotsCheckbox';
  dotsCheckbox.checked = showHealpixDots;
  dotsCheckbox.style.cursor = 'pointer';

  const dotsLabel = document.createElement('label');
  dotsLabel.htmlFor = 'dotsCheckbox';
  dotsLabel.textContent = 'Show HEALPix dots';
  dotsLabel.style.cursor = 'pointer';

  dotsCheckbox.addEventListener('change', (e) => {
    showHealpixDots = e.target.checked;
    if (healpixDotsPoints) {
      if (showHealpixDots) {
        scene.add(healpixDotsPoints);
      } else {
        scene.remove(healpixDotsPoints);
      }
    }
  });

  dotsGroup.appendChild(dotsCheckbox);
  dotsGroup.appendChild(dotsLabel);
  panel.appendChild(dotsGroup);

  // Water colormap checkbox
  const waterColormapGroup = document.createElement('div');
  waterColormapGroup.style.display = 'flex';
  waterColormapGroup.style.alignItems = 'center';
  waterColormapGroup.style.gap = '8px';

  const waterColormapCheckbox = document.createElement('input');
  waterColormapCheckbox.type = 'checkbox';
  waterColormapCheckbox.id = 'waterColormapCheckbox';
  waterColormapCheckbox.checked = true; // Default to water colormap
  waterColormapCheckbox.style.cursor = 'pointer';

  const waterColormapLabel = document.createElement('label');
  waterColormapLabel.htmlFor = 'waterColormapCheckbox';
  waterColormapLabel.textContent = 'Water colormap';
  waterColormapLabel.style.cursor = 'pointer';

  waterColormapCheckbox.addEventListener('change', (e) => {
    const useWaterColormap = e.target.checked;
    // Update uniforms in materials to toggle colormap
    if (material) {
      material.uniforms.useWaterColormap.value = useWaterColormap;
    }
    if (meanMaterial) {
      meanMaterial.uniforms.useWaterColormap.value = useWaterColormap;
    }
    if (maxMaterial) {
      maxMaterial.uniforms.useWaterColormap.value = useWaterColormap;
    }
  });

  waterColormapGroup.appendChild(waterColormapCheckbox);
  waterColormapGroup.appendChild(waterColormapLabel);
  panel.appendChild(waterColormapGroup);

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
    if (meanMaterial) {
      meanMaterial.uniforms.alpha.value = newAlpha;
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
// Worker starts autonomously and will call initializeScene when first data is ready
animate();
