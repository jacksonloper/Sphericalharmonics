/**
 * Earth Topography Demo
 * Demonstrates loading and rendering spherical mesh data from BSHC spherical harmonics
 * 
 * Supports two rendering modes:
 * 1. Flat shading (subdivision 9, 10 MB) - uses fragment derivatives for normals
 * 2. Smooth shading (subdivision 8 + gradients, 7.5 MB) - uses analytical vertex normals
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { loadCompactMesh, loadGradientMesh } from './compactMeshLoader.js';
import { createElevationMaterial, createSmoothElevationMaterial } from './elevationMaterial.js';

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
let earthMesh;
let currentMode = 'flat'; // 'flat' or 'smooth'
let geometries = {}; // Cache loaded geometries
let materials = {}; // Cache materials

// Check URL params for initial mode
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('mode') === 'smooth') {
  currentMode = 'smooth';
}

async function init() {
  try {
    const onProgress = (progress) => {
      if (progress.type === 'status') {
        loadStatus.textContent = progress.message;
      } else if (progress.type === 'subdivision') {
        loadStatus.textContent = `Subdivision ${progress.current}/${progress.total} (${progress.vertices.toLocaleString()} vertices)`;
      }
    };

    // Load both modes in parallel (or just the selected one)
    if (currentMode === 'smooth') {
      loadStatus.textContent = 'Loading smooth shading mesh (subdivision 8 + gradients)...';
      geometries.smooth = await loadGradientMesh('./earthtoposources/sur_gradient8.bin', {
        onProgress,
        useWorker: true
      });
      materials.smooth = createSmoothElevationMaterial(
        geometries.smooth.userData.elevationMin,
        geometries.smooth.userData.elevationMax
      );
    } else {
      loadStatus.textContent = 'Loading flat shading mesh (subdivision 9)...';
      geometries.flat = await loadCompactMesh('./earthtoposources/sur_compact9.bin', {
        onProgress,
        useWorker: true
      });
      materials.flat = createElevationMaterial(
        geometries.flat.userData.elevationMin,
        geometries.flat.userData.elevationMax
      );
    }

    // Create initial mesh
    const geometry = geometries[currentMode];
    const material = materials[currentMode];
    
    earthMesh = new THREE.Mesh(geometry, material);
    earthMesh.rotation.x = -Math.PI / 2;
    scene.add(earthMesh);

    loadingDiv.remove();

    addInfoPanel(geometry);
    addWireframeToggle(material);
    addAlphaSlider(material);
    addModeToggle();

    console.log('Earth mesh loaded successfully!');
  } catch (error) {
    console.error('Failed to load Earth mesh:', error);
    loadingDiv.innerHTML = 'Failed to load mesh: ' + error.message;
    loadingDiv.style.color = '#ff4444';
  }
}

async function switchMode(newMode) {
  if (newMode === currentMode) return;
  
  // Show loading overlay
  const overlay = document.createElement('div');
  overlay.id = 'switchOverlay';
  overlay.style.cssText = `
    position: absolute; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.7);
    display: flex; align-items: center; justify-content: center;
    color: white; font-family: monospace; font-size: 16px;
    z-index: 1000;
  `;
  overlay.textContent = 'Loading...';
  document.body.appendChild(overlay);

  try {
    // Load geometry if not cached
    if (!geometries[newMode]) {
      const onProgress = (progress) => {
        if (progress.type === 'status') {
          overlay.textContent = progress.message;
        }
      };

      if (newMode === 'smooth') {
        geometries.smooth = await loadGradientMesh('./earthtoposources/sur_gradient8.bin', {
          onProgress,
          useWorker: true
        });
        materials.smooth = createSmoothElevationMaterial(
          geometries.smooth.userData.elevationMin,
          geometries.smooth.userData.elevationMax
        );
      } else {
        geometries.flat = await loadCompactMesh('./earthtoposources/sur_compact9.bin', {
          onProgress,
          useWorker: true
        });
        materials.flat = createElevationMaterial(
          geometries.flat.userData.elevationMin,
          geometries.flat.userData.elevationMax
        );
      }
    }

    // Copy alpha value from current material
    const currentAlpha = materials[currentMode].uniforms.alpha.value;
    materials[newMode].uniforms.alpha.value = currentAlpha;

    // Update mesh
    earthMesh.geometry = geometries[newMode];
    earthMesh.material = materials[newMode];
    
    currentMode = newMode;

    // Update UI
    updateInfoPanel();
    updateModeToggleUI();

    overlay.remove();
  } catch (error) {
    console.error('Failed to switch mode:', error);
    overlay.textContent = 'Error: ' + error.message;
    setTimeout(() => overlay.remove(), 3000);
  }
}

let infoPanel;
function addInfoPanel(geometry) {
  infoPanel = document.createElement('div');
  infoPanel.style.position = 'absolute';
  infoPanel.style.top = '10px';
  infoPanel.style.left = '10px';
  infoPanel.style.color = 'white';
  infoPanel.style.fontFamily = 'monospace';
  infoPanel.style.fontSize = '12px';
  infoPanel.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  infoPanel.style.padding = '10px';
  infoPanel.style.borderRadius = '5px';
  infoPanel.style.lineHeight = '1.5';

  document.body.appendChild(infoPanel);
  updateInfoPanel();
}

function updateInfoPanel() {
  const geometry = geometries[currentMode];
  const vertices = geometry.attributes.position.count;
  const triangles = geometry.index.count / 3;
  const subdivisions = geometry.userData.subdivisions;
  const hasGradients = geometry.userData.hasGradients;
  
  const fileSize = currentMode === 'flat' ? '~10 MB' : '~7.5 MB';
  const shadingType = currentMode === 'flat' ? 'Flat (fragment)' : 'Smooth (vertex)';

  infoPanel.innerHTML = `
    <strong>Earth Surface Topography</strong><br>
    <br>
    Mode: <span style="color: #4ecdc4;">${shadingType}</span><br>
    Icosahedral mesh (${subdivisions} subdivisions)<br>
    Vertices: ${vertices.toLocaleString()}<br>
    Triangles: ${triangles.toLocaleString()}<br>
    File: ${fileSize}${hasGradients ? ' (elev + gradients)' : ''}<br>
    <br>
    Elevation Range:<br>
    ${geometry.userData.elevationMin.toFixed(1)} to ${geometry.userData.elevationMax.toFixed(1)} m<br>
    <br>
    <em>Drag to rotate • Scroll to zoom</em>
  `;
}

function addWireframeToggle(material) {
  const toggle = document.createElement('div');
  toggle.id = 'wireframeToggle';
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
    wireframeEnabled = !wireframeEnabled;
    // Update both materials if they exist
    Object.values(materials).forEach(mat => {
      if (mat) mat.wireframe = wireframeEnabled;
    });
    toggle.textContent = `Wireframe: ${wireframeEnabled ? 'ON' : 'OFF'}`;
    toggle.style.backgroundColor = wireframeEnabled ? 'rgba(78, 205, 196, 0.3)' : 'rgba(0, 0, 0, 0.7)';
  });

  document.body.appendChild(toggle);
}

function addAlphaSlider(material) {
  const container = document.createElement('div');
  container.id = 'alphaSlider';
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
    const alpha = parseFloat(e.target.value);
    // Update all materials
    Object.values(materials).forEach(mat => {
      if (mat) mat.uniforms.alpha.value = alpha;
    });
    valueDisplay.textContent = alpha.toFixed(3);
  });

  container.appendChild(label);
  container.appendChild(valueDisplay);
  container.appendChild(slider);
  document.body.appendChild(container);
}

let modeToggle;
function addModeToggle() {
  modeToggle = document.createElement('div');
  modeToggle.style.position = 'absolute';
  modeToggle.style.bottom = '130px';
  modeToggle.style.right = '20px';
  modeToggle.style.color = 'white';
  modeToggle.style.fontFamily = 'monospace';
  modeToggle.style.fontSize = '12px';
  modeToggle.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  modeToggle.style.padding = '10px 15px';
  modeToggle.style.borderRadius = '5px';
  modeToggle.style.border = '1px solid rgba(255, 255, 255, 0.2)';
  modeToggle.style.minWidth = '200px';

  modeToggle.innerHTML = `
    <div style="margin-bottom: 8px;">Shading Mode</div>
    <div style="display: flex; gap: 8px;">
      <button id="flatBtn" style="flex: 1; padding: 8px; cursor: pointer; border-radius: 4px; font-family: monospace; font-size: 11px;">
        Flat (9 sub)<br>10 MB
      </button>
      <button id="smoothBtn" style="flex: 1; padding: 8px; cursor: pointer; border-radius: 4px; font-family: monospace; font-size: 11px;">
        Smooth (8 sub)<br>7.5 MB
      </button>
    </div>
  `;

  document.body.appendChild(modeToggle);
  
  document.getElementById('flatBtn').addEventListener('click', () => switchMode('flat'));
  document.getElementById('smoothBtn').addEventListener('click', () => switchMode('smooth'));
  
  updateModeToggleUI();
}

function updateModeToggleUI() {
  const flatBtn = document.getElementById('flatBtn');
  const smoothBtn = document.getElementById('smoothBtn');
  
  const activeStyle = 'background: #4ecdc4; color: black; border: none;';
  const inactiveStyle = 'background: transparent; color: white; border: 1px solid rgba(255,255,255,0.3);';
  
  flatBtn.style.cssText = `flex: 1; padding: 8px; cursor: pointer; border-radius: 4px; font-family: monospace; font-size: 11px; ${currentMode === 'flat' ? activeStyle : inactiveStyle}`;
  smoothBtn.style.cssText = `flex: 1; padding: 8px; cursor: pointer; border-radius: 4px; font-family: monospace; font-size: 11px; ${currentMode === 'smooth' ? activeStyle : inactiveStyle}`;
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

// Start
init();
animate();
