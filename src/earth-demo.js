/**
 * Earth Topography Demo
 * Demonstrates loading and rendering spherical mesh data from BSHC spherical harmonics
 * Allows selection of different harmonic truncation levels (lmax) to show approximations
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { loadCompactMesh } from './compactMeshLoader.js';
import { createElevationMaterial } from './elevationMaterial.js';

// File format constants
const HEADER_SIZE = 7; // 'HPELEV' (6 bytes) + subdivision level (1 byte)

// Use Web Worker for subdivision levels >= this threshold (for better performance)
const WORKER_SUBDIVISION_THRESHOLD = 7;

// Icosahedral mesh vertices: 10 * 4^subdivisions + 2
function icosahedralVertices(subdivisions) {
  return 10 * Math.pow(4, subdivisions) + 2;
}

// Available truncation levels with metadata
// Vertices are calculated from the icosahedral formula: 10 * 4^subdivisions + 2
// Subdivisions are chosen based on Nyquist frequency: sqrt(vertices)/2 >= lmax
const TRUNCATION_LEVELS = [
  { lmax: 4, file: './earthtoposources/sur_lmax4.bin', description: 'Very low - basic shape', subdivisions: 2 },
  { lmax: 8, file: './earthtoposources/sur_lmax8.bin', description: 'Low - major features', subdivisions: 3 },
  { lmax: 16, file: './earthtoposources/sur_lmax16.bin', description: 'Medium-low - continental shapes', subdivisions: 4 },
  { lmax: 32, file: './earthtoposources/sur_lmax32.bin', description: 'Medium - mountain ranges visible', subdivisions: 5 },
  { lmax: 64, file: './earthtoposources/sur_lmax64.bin', description: 'Higher - regional detail', subdivisions: 6 },
  { lmax: 128, file: './earthtoposources/sur_lmax128.bin', description: 'High - significant detail', subdivisions: 7 },
  { lmax: 360, file: './earthtoposources/sur_lmax360.bin', description: 'Very high - fine detail', subdivisions: 8 },
  { lmax: 2160, file: './earthtoposources/sur_compact9.bin', description: 'Full resolution (~9km)', subdivisions: 9 }
];

// Default to medium detail for faster initial load
const DEFAULT_LEVEL_INDEX = 3; // lmax=32

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 0, 2.5);

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
controls.autoRotate = true;
controls.autoRotateSpeed = 0.5;

// Loading indicator with progress support
const loadingDiv = document.createElement('div');
loadingDiv.style.position = 'absolute';
loadingDiv.style.top = '50%';
loadingDiv.style.left = '50%';
loadingDiv.style.transform = 'translate(-50%, -50%)';
loadingDiv.style.color = 'white';
loadingDiv.style.fontFamily = 'monospace';
loadingDiv.style.fontSize = '16px';
loadingDiv.style.textAlign = 'center';
loadingDiv.style.lineHeight = '1.8';
loadingDiv.innerHTML = 'Loading Earth mesh...<br><span id="loadStatus" style="color: #4ecdc4;"></span>';
document.body.appendChild(loadingDiv);

const loadStatus = loadingDiv.querySelector('#loadStatus');

// Global state
let earthMesh = null;
let material = null;
let infoPanel = null;
let currentLevelIndex = DEFAULT_LEVEL_INDEX;
let isLoading = false;

async function loadLevel(levelIndex) {
  if (isLoading) return;
  isLoading = true;
  
  const level = TRUNCATION_LEVELS[levelIndex];
  
  // Show loading indicator
  loadingDiv.style.display = 'block';
  loadStatus.textContent = `Loading lmax=${level.lmax}...`;
  
  try {
    const onProgress = (progress) => {
      if (progress.type === 'status') {
        loadStatus.textContent = progress.message;
      } else if (progress.type === 'subdivision') {
        loadStatus.textContent = `Subdivision ${progress.current}/${progress.total} (${progress.vertices.toLocaleString()} vertices)`;
      }
    };

    // Load mesh - use Web Worker for larger meshes to avoid blocking UI
    const geometry = await loadCompactMesh(level.file, {
      onProgress,
      useWorker: level.subdivisions >= WORKER_SUBDIVISION_THRESHOLD
    });

    // Remove old mesh if exists
    if (earthMesh) {
      scene.remove(earthMesh);
      earthMesh.geometry.dispose();
    }

    // Create or update material
    if (!material) {
      material = createElevationMaterial(
        geometry.userData.elevationMin,
        geometry.userData.elevationMax
      );
    } else {
      // Update elevation range
      material.uniforms.minElevation.value = geometry.userData.elevationMin;
      material.uniforms.maxElevation.value = geometry.userData.elevationMax;
    }

    // Create new mesh
    earthMesh = new THREE.Mesh(geometry, material);
    earthMesh.rotation.x = -Math.PI / 2;
    scene.add(earthMesh);

    currentLevelIndex = levelIndex;

    // Hide loading indicator
    loadingDiv.style.display = 'none';

    // Update info panel
    updateInfoPanel(geometry, level);

    console.log(`Earth mesh loaded: lmax=${level.lmax}, ${geometry.attributes.position.count.toLocaleString()} vertices`);
  } catch (error) {
    console.error('Failed to load Earth mesh:', error);
    loadingDiv.innerHTML = 'Failed to load mesh: ' + error.message;
    loadingDiv.style.color = '#ff4444';
  }
  
  isLoading = false;
}

function updateInfoPanel(geometry, level) {
  if (!infoPanel) return;
  
  const vertices = geometry.attributes.position.count;
  const triangles = geometry.index.count / 3;
  const subdivisions = geometry.userData.subdivisions;
  const fileSize = getApproxFileSize(vertices);

  const content = infoPanel.querySelector('#infoPanelContent');
  content.innerHTML = `
    <strong>Earth Surface Topography</strong><br>
    <br>
    Spherical Harmonic Cutoff: <span style="color: #4ecdc4;">lmax = ${level.lmax}</span><br>
    ${level.description}<br>
    <br>
    Icosahedral mesh (${subdivisions} subdivisions)<br>
    Vertices: ${vertices.toLocaleString()}<br>
    Triangles: ${triangles.toLocaleString()}<br>
    File size: ~${fileSize}<br>
    <br>
    Elevation Range:<br>
    ${geometry.userData.elevationMin.toFixed(1)} to ${geometry.userData.elevationMax.toFixed(1)} m<br>
    <br>
    <em>Drag to rotate • Scroll to zoom</em>
  `;
}

function getApproxFileSize(vertices) {
  // File format: HEADER_SIZE bytes header + float32 (4 bytes) per vertex
  const bytes = HEADER_SIZE + vertices * 4;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function addInfoPanel() {
  const panel = document.createElement('div');
  panel.style.position = 'absolute';
  panel.style.top = '10px';
  panel.style.left = '10px';
  panel.style.color = 'white';
  panel.style.fontFamily = 'monospace';
  panel.style.fontSize = '12px';
  panel.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  panel.style.padding = '10px';
  panel.style.borderRadius = '5px';
  panel.style.lineHeight = '1.5';
  panel.style.maxWidth = '300px';

  panel.innerHTML = '<div id="infoPanelContent">Loading...</div>';

  document.body.appendChild(panel);
  infoPanel = panel;
}

function addLevelSelector() {
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.top = '10px';
  container.style.right = '20px';
  container.style.color = 'white';
  container.style.fontFamily = 'monospace';
  container.style.fontSize = '12px';
  container.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  container.style.padding = '15px';
  container.style.borderRadius = '5px';
  container.style.border = '1px solid rgba(255, 255, 255, 0.2)';
  container.style.minWidth = '280px';

  const title = document.createElement('div');
  title.style.marginBottom = '10px';
  title.style.fontWeight = 'bold';
  title.style.color = '#4ecdc4';
  title.textContent = 'Harmonic Truncation Level';
  container.appendChild(title);

  const description = document.createElement('div');
  description.style.marginBottom = '12px';
  description.style.fontSize = '11px';
  description.style.color = '#aaa';
  description.style.lineHeight = '1.4';
  description.innerHTML = 'Select <strong>lmax</strong> to see how spherical harmonic approximations improve with more coefficients. Lower values = smoother/blobby. Higher values = more detail.';
  container.appendChild(description);

  const select = document.createElement('select');
  select.style.width = '100%';
  select.style.padding = '8px';
  select.style.fontFamily = 'monospace';
  select.style.fontSize = '12px';
  select.style.backgroundColor = 'rgba(30, 30, 50, 0.9)';
  select.style.color = 'white';
  select.style.border = '1px solid rgba(78, 205, 196, 0.5)';
  select.style.borderRadius = '4px';
  select.style.cursor = 'pointer';

  TRUNCATION_LEVELS.forEach((level, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.textContent = `lmax = ${level.lmax} — ${level.description}`;
    if (index === DEFAULT_LEVEL_INDEX) {
      option.selected = true;
    }
    select.appendChild(option);
  });

  select.addEventListener('change', (e) => {
    const newIndex = parseInt(e.target.value, 10);
    if (newIndex !== currentLevelIndex) {
      loadLevel(newIndex);
    }
  });

  container.appendChild(select);

  // Add Nyquist hint
  const nyquistHint = document.createElement('div');
  nyquistHint.style.marginTop = '10px';
  nyquistHint.style.fontSize = '10px';
  nyquistHint.style.color = '#888';
  nyquistHint.style.lineHeight = '1.4';
  nyquistHint.innerHTML = '<strong>Note:</strong> Mesh subdivision is chosen based on Nyquist frequency to properly sample each lmax without aliasing.';
  container.appendChild(nyquistHint);

  document.body.appendChild(container);
}

function addWireframeToggle() {
  const toggle = document.createElement('div');
  toggle.style.position = 'absolute';
  toggle.style.bottom = '20px';
  toggle.style.right = '20px';
  toggle.style.color = 'white';
  toggle.style.fontFamily = 'monospace';
  toggle.style.fontSize = '14px';
  toggle.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  toggle.style.padding = '10px 15px';
  toggle.style.borderRadius = '5px';
  toggle.style.cursor = 'pointer';
  toggle.style.userSelect = 'none';
  toggle.style.border = '1px solid rgba(255, 255, 255, 0.2)';
  toggle.style.transition = 'background-color 0.2s';

  let wireframeEnabled = false;
  toggle.textContent = 'Wireframe: OFF';

  toggle.addEventListener('click', () => {
    if (!material) return;
    wireframeEnabled = !wireframeEnabled;
    material.wireframe = wireframeEnabled;
    toggle.textContent = `Wireframe: ${wireframeEnabled ? 'ON' : 'OFF'}`;
    toggle.style.backgroundColor = wireframeEnabled ? 'rgba(78, 205, 196, 0.3)' : 'rgba(0, 0, 0, 0.7)';
  });

  document.body.appendChild(toggle);
}

function addAlphaSlider() {
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.bottom = '60px';
  container.style.right = '20px';
  container.style.color = 'white';
  container.style.fontFamily = 'monospace';
  container.style.fontSize = '12px';
  container.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  container.style.padding = '10px 15px';
  container.style.borderRadius = '5px';
  container.style.border = '1px solid rgba(255, 255, 255, 0.2)';
  container.style.minWidth = '200px';

  const label = document.createElement('div');
  label.style.marginBottom = '8px';
  label.textContent = 'Relief Exponent (α)';

  const valueDisplay = document.createElement('div');
  valueDisplay.style.color = '#4ecdc4';
  valueDisplay.style.fontSize = '14px';
  valueDisplay.style.marginBottom = '8px';
  valueDisplay.textContent = '0.001';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0.001';
  slider.max = '1';
  slider.step = '0.001';
  slider.value = '0.001';
  slider.style.width = '100%';

  slider.addEventListener('input', (e) => {
    if (!material) return;
    const alpha = parseFloat(e.target.value);
    material.uniforms.alpha.value = alpha;
    valueDisplay.textContent = alpha.toFixed(3);
  });

  container.appendChild(label);
  container.appendChild(valueDisplay);
  container.appendChild(slider);
  document.body.appendChild(container);
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

// Initialize UI and load default level
addInfoPanel();
addLevelSelector();
addWireframeToggle();
addAlphaSlider();
loadLevel(DEFAULT_LEVEL_INDEX);
animate();
