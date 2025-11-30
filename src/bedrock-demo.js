/**
 * Bedrock Topography Demo
 * Demonstrates loading and rendering spherical mesh data from BSHC spherical harmonics
 * Uses bed.bshc data instead of sur.bshc
 * Allows selection of different harmonic truncation levels (lmax) to show approximations
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { loadCompactMesh } from './compactMeshLoader.js';
import { createBedrockMaterial } from './bedrockMaterial.js';

// Use Web Worker for subdivision levels >= this threshold (for better performance)
const WORKER_SUBDIVISION_THRESHOLD = 7;

// Available truncation levels with metadata
// Subdivisions are chosen based on Nyquist frequency: sqrt(vertices)/2 >= lmax
// Note: The highest resolution file uses 'compact9' naming to match the sur.bshc convention
const TRUNCATION_LEVELS = [
  { lmax: 4, file: './earthtoposources/bed_lmax4.bin', subdivisions: 2 },
  { lmax: 8, file: './earthtoposources/bed_lmax8.bin', subdivisions: 3 },
  { lmax: 16, file: './earthtoposources/bed_lmax16.bin', subdivisions: 4 },
  { lmax: 32, file: './earthtoposources/bed_lmax32.bin', subdivisions: 5 },
  { lmax: 64, file: './earthtoposources/bed_lmax64.bin', subdivisions: 6 },
  { lmax: 128, file: './earthtoposources/bed_lmax128.bin', subdivisions: 7 },
  { lmax: 360, file: './earthtoposources/bed_lmax360.bin', subdivisions: 8 },
  { lmax: 2160, file: './earthtoposources/bed_compact9.bin', subdivisions: 9 }
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
loadingDiv.innerHTML = 'Loading...<br><span id="loadStatus" style="color: #4ecdc4;"></span>';
document.body.appendChild(loadingDiv);

const loadStatus = loadingDiv.querySelector('#loadStatus');

// Global state
let bedrockMesh = null;
let material = null;
let currentLevelIndex = DEFAULT_LEVEL_INDEX;
let isLoading = false;
let wireframeToggle = null;
let axisLines = null;
let showAxisLines = false;

// Create axis visualization lines
// After mesh rotation: Y axis = poles, XZ plane = equator
function createAxisLines() {
  const group = new THREE.Group();
  
  // Pole axis (Y axis after mesh rotation) - red
  const poleGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, -1.5, 0),
    new THREE.Vector3(0, 1.5, 0)
  ]);
  const poleMaterial = new THREE.LineBasicMaterial({ color: 0xff4444 });
  const poleLine = new THREE.Line(poleGeometry, poleMaterial);
  group.add(poleLine);
  
  // Equator ring in XZ plane after mesh rotation - yellow
  const equatorPoints = [];
  for (let i = 0; i <= 64; i++) {
    const angle = (i / 64) * Math.PI * 2;
    equatorPoints.push(new THREE.Vector3(
      Math.cos(angle) * 1.2,
      0,
      Math.sin(angle) * 1.2
    ));
  }
  const equatorGeometry = new THREE.BufferGeometry().setFromPoints(equatorPoints);
  const equatorMaterial = new THREE.LineBasicMaterial({ color: 0xffff44 });
  const equatorLine = new THREE.Line(equatorGeometry, equatorMaterial);
  group.add(equatorLine);
  
  group.visible = false;
  return group;
}

async function loadLevel(levelIndex) {
  if (isLoading) return;
  isLoading = true;
  
  const level = TRUNCATION_LEVELS[levelIndex];
  
  // Show loading indicator
  loadingDiv.style.display = 'block';
  loadStatus.textContent = `lmax=${level.lmax}`;
  
  try {
    const onProgress = (progress) => {
      if (progress.type === 'status') {
        loadStatus.textContent = progress.message;
      }
    };

    // Load mesh - use Web Worker for larger meshes to avoid blocking UI
    const geometry = await loadCompactMesh(level.file, {
      onProgress,
      useWorker: level.subdivisions >= WORKER_SUBDIVISION_THRESHOLD
    });

    // Remove old mesh if exists
    if (bedrockMesh) {
      scene.remove(bedrockMesh);
      bedrockMesh.geometry.dispose();
    }

    // Create or update material
    if (!material) {
      material = createBedrockMaterial(
        geometry.userData.elevationMin,
        geometry.userData.elevationMax
      );
    } else {
      material.uniforms.minElevation.value = geometry.userData.elevationMin;
      material.uniforms.maxElevation.value = geometry.userData.elevationMax;
    }

    // Create new mesh
    bedrockMesh = new THREE.Mesh(geometry, material);
    bedrockMesh.rotation.x = -Math.PI / 2;
    scene.add(bedrockMesh);

    currentLevelIndex = levelIndex;
    loadingDiv.style.display = 'none';

    console.log(`Loaded: lmax=${level.lmax}, ${geometry.attributes.position.count.toLocaleString()} vertices`);
  } catch (error) {
    console.error('Failed to load:', error);
    loadingDiv.innerHTML = 'Failed: ' + error.message;
    loadingDiv.style.color = '#ff4444';
  }
  
  isLoading = false;
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
  panel.style.maxWidth = '95vw';

  // Level selector
  const levelGroup = document.createElement('div');
  levelGroup.style.display = 'flex';
  levelGroup.style.alignItems = 'center';
  levelGroup.style.gap = '8px';

  const levelLabel = document.createElement('span');
  levelLabel.textContent = 'lmax:';
  levelGroup.appendChild(levelLabel);

  const select = document.createElement('select');
  select.style.padding = '5px 8px';
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
    option.textContent = level.lmax;
    if (index === DEFAULT_LEVEL_INDEX) option.selected = true;
    select.appendChild(option);
  });

  select.addEventListener('change', (e) => {
    const newIndex = parseInt(e.target.value, 10);
    if (newIndex !== currentLevelIndex) loadLevel(newIndex);
  });

  levelGroup.appendChild(select);
  panel.appendChild(levelGroup);

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
  slider.min = '0.001';
  slider.max = '1';
  slider.step = '0.001';
  slider.value = '0.001';
  slider.style.width = '80px';
  slider.style.cursor = 'pointer';

  slider.addEventListener('input', (e) => {
    if (!material) return;
    material.uniforms.alpha.value = parseFloat(e.target.value);
  });

  reliefGroup.appendChild(slider);
  panel.appendChild(reliefGroup);

  // Wireframe toggle
  wireframeToggle = document.createElement('button');
  wireframeToggle.textContent = 'Wireframe';
  wireframeToggle.style.padding = '5px 10px';
  wireframeToggle.style.fontFamily = 'monospace';
  wireframeToggle.style.fontSize = '12px';
  wireframeToggle.style.backgroundColor = 'transparent';
  wireframeToggle.style.color = 'white';
  wireframeToggle.style.border = '1px solid rgba(255, 255, 255, 0.3)';
  wireframeToggle.style.borderRadius = '4px';
  wireframeToggle.style.cursor = 'pointer';

  let wireframeEnabled = false;
  wireframeToggle.addEventListener('click', () => {
    if (!material) return;
    wireframeEnabled = !wireframeEnabled;
    material.wireframe = wireframeEnabled;
    wireframeToggle.style.backgroundColor = wireframeEnabled ? 'rgba(78, 205, 196, 0.3)' : 'transparent';
  });

  panel.appendChild(wireframeToggle);

  // Axis lines toggle
  const axisToggle = document.createElement('button');
  axisToggle.textContent = 'Axes';
  axisToggle.style.padding = '5px 10px';
  axisToggle.style.fontFamily = 'monospace';
  axisToggle.style.fontSize = '12px';
  axisToggle.style.backgroundColor = 'transparent';
  axisToggle.style.color = 'white';
  axisToggle.style.border = '1px solid rgba(255, 255, 255, 0.3)';
  axisToggle.style.borderRadius = '4px';
  axisToggle.style.cursor = 'pointer';

  axisToggle.addEventListener('click', () => {
    showAxisLines = !showAxisLines;
    if (axisLines) {
      axisLines.visible = showAxisLines;
    }
    axisToggle.style.backgroundColor = showAxisLines ? 'rgba(78, 205, 196, 0.3)' : 'transparent';
  });

  panel.appendChild(axisToggle);

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

// Initialize axis lines
axisLines = createAxisLines();
scene.add(axisLines);

// Initialize UI and load default level
addControlPanel();
loadLevel(DEFAULT_LEVEL_INDEX);
animate();
