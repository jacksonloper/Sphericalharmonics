/**
 * Earth Topography Demo
 * Demonstrates loading and rendering HEALPix mesh data
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { loadCompactMesh } from './compactMeshLoader.js';
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

// Load and render the mesh
let earthMesh;

async function init() {
  try {
    // Progress callback for loading indicator
    const onProgress = (progress) => {
      if (progress.type === 'status') {
        loadStatus.textContent = progress.message;
      } else if (progress.type === 'subdivision') {
        loadStatus.textContent = `Subdivision ${progress.current}/${progress.total} (${progress.vertices.toLocaleString()} vertices)`;
      }
    };

    // Load compact mesh (subdivision 9: ~2.6M vertices, ~10 MB)
    // Use Web Worker for smoother loading experience
    const geometry = await loadCompactMesh('./earthtoposources/sur_compact9.bin', {
      onProgress,
      useWorker: true
    });

    // Create material
    const material = createElevationMaterial(
      geometry.userData.elevationMin,
      geometry.userData.elevationMax
    );

    // Create mesh
    earthMesh = new THREE.Mesh(geometry, material);

    // Rotate to align poles vertically (HEALPix uses z-up, Three.js uses y-up)
    earthMesh.rotation.x = -Math.PI / 2;

    scene.add(earthMesh);

    // Remove loading indicator
    loadingDiv.remove();

    // Add info panel
    addInfoPanel(geometry);

    // Add wireframe toggle
    addWireframeToggle(material);

    // Add alpha slider
    addAlphaSlider(material);

    console.log('Earth mesh loaded successfully!');
  } catch (error) {
    console.error('Failed to load Earth mesh:', error);
    loadingDiv.innerHTML = 'Failed to load mesh: ' + error.message;
    loadingDiv.style.color = '#ff4444';
  }
}

function addInfoPanel(geometry) {
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

  const vertices = geometry.attributes.position.count;
  const triangles = geometry.index.count / 3;
  const subdivisions = geometry.userData.subdivisions || 9;

  panel.innerHTML = `
    <strong>Earth Surface Topography</strong><br>
    <br>
    Icosahedral mesh (${subdivisions} subdivisions)<br>
    Vertices: ${vertices.toLocaleString()}<br>
    Triangles: ${triangles.toLocaleString()}<br>
    File: ~10 MB (geometry generated procedurally)<br>
    <br>
    Elevation Range:<br>
    ${geometry.userData.elevationMin.toFixed(1)} to ${geometry.userData.elevationMax.toFixed(1)} m<br>
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
