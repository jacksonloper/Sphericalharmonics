/**
 * Earth Contour Demo
 * Renders Earth topography as extruded contour polygons with flat shading
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { loadContourData, createContourGeometry } from './contourLoader.js';
import { createContourMaterial } from './contourMaterial.js';

// Constants

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
loadingDiv.style.fontSize = '16px';
loadingDiv.style.textAlign = 'center';
loadingDiv.style.lineHeight = '1.8';
loadingDiv.innerHTML = 'Loading contour data...<br><span id="loadStatus" style="color: #4ecdc4;"></span>';
document.body.appendChild(loadingDiv);

const loadStatus = loadingDiv.querySelector('#loadStatus');

// Global state
let earthMesh;
let material;

async function init() {
  try {
    const onProgress = (progress) => {
      if (progress.type === 'status') {
        loadStatus.textContent = progress.message;
      } else if (progress.type === 'progress') {
        loadStatus.textContent = progress.message;
      } else if (progress.type === 'geometry') {
        loadStatus.textContent = `Building geometry: ${progress.polygons.toLocaleString()} polygons`;
      }
    };

    // Load contour data
    loadStatus.textContent = 'Loading contour data...';
    const levels = await loadContourData('./earthtoposources/sur_contours_30.bin', onProgress);

    // Find min/max elevation
    let minElev = Infinity, maxElev = -Infinity;
    for (const level of levels) {
      if (level.elevation < minElev) minElev = level.elevation;
      if (level.elevation > maxElev) maxElev = level.elevation;
    }

    // Create geometry with extrusion
    loadStatus.textContent = 'Creating geometry...';
    const geometry = createContourGeometry(levels, {
      baseRadius: 1.0,
      reliefScale: 1.0,
      minElevation: minElev,
      maxElevation: maxElev,
      onProgress
    });

    // Create material for contours (with relief exaggeration support)
    material = createContourMaterial(minElev, maxElev);

    // Create mesh - no rotation, keep Earth right side up
    earthMesh = new THREE.Mesh(geometry, material);
    scene.add(earthMesh);

    loadingDiv.remove();

    addInfoPanel(geometry, levels);
    addWireframeToggle(material);
    addAlphaSlider(material);

    console.log('Contour mesh loaded successfully!');
  } catch (error) {
    console.error('Failed to load contour mesh:', error);
    loadingDiv.innerHTML = 'Failed to load: ' + error.message;
    loadingDiv.style.color = '#ff4444';
  }
}

function addInfoPanel(geometry, levels) {
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
  const polygonCount = geometry.userData.polygonCount;
  const levelCount = levels.length;

  panel.innerHTML = `
    <strong>Earth Surface Contours</strong><br>
    <br>
    Extruded contour polygons<br>
    Levels: ${levelCount}<br>
    Polygons: ${polygonCount.toLocaleString()}<br>
    Vertices: ${vertices.toLocaleString()}<br>
    Triangles: ${triangles.toLocaleString()}<br>
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
