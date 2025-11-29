/**
 * Earth Topography Demo - Adaptive Mesh
 * Demonstrates loading and rendering adaptive mesh data
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { loadAdaptiveMesh } from './adaptiveMeshLoader.js';
import { createElevationMaterial } from './healpixMeshLoader.js';

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

// Loading indicator
const loadingDiv = document.createElement('div');
loadingDiv.style.position = 'absolute';
loadingDiv.style.top = '50%';
loadingDiv.style.left = '50%';
loadingDiv.style.transform = 'translate(-50%, -50%)';
loadingDiv.style.color = 'white';
loadingDiv.style.fontFamily = 'monospace';
loadingDiv.style.fontSize = '20px';
loadingDiv.textContent = 'Loading adaptive mesh...';
document.body.appendChild(loadingDiv);

// Load and render the mesh
let earthMesh;

async function init() {
  try {
    // Load adaptive mesh (high quality: 100K vertices, 3.1MB)
    const { geometry, stats } = await loadAdaptiveMesh('./earthtoposources/sur_adaptive_high.mesh');

    // Create material
    const material = createElevationMaterial(
      stats.minElevation,
      stats.maxElevation
    );

    // Create mesh
    earthMesh = new THREE.Mesh(geometry, material);

    // Rotate to align poles vertically (HEALPix uses z-up, Three.js uses y-up)
    earthMesh.rotation.x = -Math.PI / 2;

    scene.add(earthMesh);

    // Remove loading indicator
    loadingDiv.remove();

    // Add info panel
    addInfoPanel(stats);

    // Add wireframe toggle
    addWireframeToggle(material);

    // Add alpha slider
    addAlphaSlider(material);

    console.log('Adaptive mesh loaded successfully!');
  } catch (error) {
    console.error('Failed to load adaptive mesh:', error);
    loadingDiv.textContent = 'Failed to load mesh: ' + error.message;
    loadingDiv.style.color = '#ff4444';
  }
}

function addInfoPanel(stats) {
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

  const fileSizeMB = (stats.fileSize / 1024 / 1024).toFixed(1);

  panel.innerHTML = `
    <strong>Earth Surface Topography</strong><br>
    <br>
    Adaptive mesh (error-driven refinement)<br>
    Vertices: ${stats.numVertices.toLocaleString()}<br>
    Triangles: ${stats.numTriangles.toLocaleString()}<br>
    File: ${fileSizeMB} MB<br>
    <br>
    Elevation Range:<br>
    ${stats.minElevation.toFixed(1)} to ${stats.maxElevation.toFixed(1)} m<br>
    <br>
    <em>Drag to rotate • Scroll to zoom</em>
  `;

  document.body.appendChild(panel);
}

function addWireframeToggle(material) {
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
    wireframeEnabled = !wireframeEnabled;
    material.wireframe = wireframeEnabled;
    toggle.textContent = `Wireframe: ${wireframeEnabled ? 'ON' : 'OFF'}`;
    toggle.style.backgroundColor = wireframeEnabled ? 'rgba(78, 205, 196, 0.3)' : 'rgba(0, 0, 0, 0.7)';
  });

  toggle.addEventListener('mouseenter', () => {
    if (!wireframeEnabled) {
      toggle.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';
    }
  });

  toggle.addEventListener('mouseleave', () => {
    toggle.style.backgroundColor = wireframeEnabled ? 'rgba(78, 205, 196, 0.3)' : 'rgba(0, 0, 0, 0.7)';
  });

  document.body.appendChild(toggle);
}

function addAlphaSlider(material) {
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

// Start
init();
animate();
