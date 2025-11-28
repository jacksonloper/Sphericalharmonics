/**
 * Earth Topography Demo
 * Demonstrates loading and rendering HEALPix mesh data
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { loadHealpixMesh, createElevationMaterial } from './healpixMeshLoader.js';

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
loadingDiv.textContent = 'Loading Earth mesh...';
document.body.appendChild(loadingDiv);

// Load and render the mesh
let earthMesh;

async function init() {
  try {
    // Load the HEALPix mesh
    const geometry = await loadHealpixMesh('./earthtoposources/sur_mesh32.bin');

    // Create material
    const material = createElevationMaterial(
      geometry.userData.elevationMin,
      geometry.userData.elevationMax
    );

    // Create mesh
    earthMesh = new THREE.Mesh(geometry, material);
    scene.add(earthMesh);

    // Remove loading indicator
    loadingDiv.remove();

    // Add info panel
    addInfoPanel(geometry);

    console.log('Earth mesh loaded successfully!');
  } catch (error) {
    console.error('Failed to load Earth mesh:', error);
    loadingDiv.textContent = 'Failed to load mesh: ' + error.message;
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

  panel.innerHTML = `
    <strong>Earth Surface Topography</strong><br>
    <br>
    Resolution: nside=32<br>
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
