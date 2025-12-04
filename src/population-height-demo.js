/**
 * Population Height Demo
 * Demonstrates loading and rendering HEALPix population density data as height displacement
 * from population_healpix128_NESTED.npy
 * 
 * Population values are rendered as radial displacement from the Earth's surface
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createPopulationHeightMaterial } from './populationHeightMaterial.js';
import PopulationHeightWorker from './populationHeightWorker.js?worker';

// HEALPix parameters - fixed nside=128 for population data
const NSIDE = 128;
const HEALPIX_BASE_FACES = 12;

// Start the worker immediately
const worker = new PopulationHeightWorker();

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
let populationMesh = null;
let innerSphere = null;
let material = null;

/**
 * Handle messages from the worker
 */
worker.onmessage = (e) => {
  const { type } = e.data;
  
  if (type === 'status') {
    console.log(e.data.message);
    const loadingStatus = document.getElementById('loadingStatus');
    if (loadingStatus) {
      loadingStatus.textContent = e.data.message;
    }
  } else if (type === 'progress') {
    console.log(e.data.message);
  } else if (type === 'complete') {
    console.log(`Triangulation completed in ${e.data.triangulationTime.toFixed(2)}ms`);
    
    // Convert transferred ArrayBuffers back to typed arrays
    const meshGeometry = {
      positions: new Float32Array(e.data.positions),
      normals: new Float32Array(e.data.normals),
      population: new Float32Array(e.data.population),
      triangles: new Uint32Array(e.data.triangles),
      numPixels: e.data.numPixels
    };
    
    const maxPopulation = e.data.maxPopulation;
    
    // Initialize the scene
    initializeScene(meshGeometry, maxPopulation);
  } else if (type === 'error') {
    console.error('Worker error:', e.data.message);
  }
};

worker.onerror = (error) => {
  console.error('Worker error:', error);
};

/**
 * Initialize the scene with the loaded geometry
 */
function initializeScene(meshGeometry, maxPopulation) {
  // Create material for population visualization
  material = createPopulationHeightMaterial(maxPopulation);
  
  // Create inner non-transparent sphere at radius 0.4
  const innerSphereGeometry = new THREE.SphereGeometry(0.4, 64, 64);
  const innerSphereMaterial = new THREE.MeshBasicMaterial({
    color: 0x1a1a1a,
    side: THREE.BackSide
  });
  innerSphere = new THREE.Mesh(innerSphereGeometry, innerSphereMaterial);
  scene.add(innerSphere);
  
  // Create mesh from geometry
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(meshGeometry.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(meshGeometry.normals, 3));
  geometry.setAttribute('population', new THREE.BufferAttribute(meshGeometry.population, 1));
  geometry.setIndex(new THREE.BufferAttribute(meshGeometry.triangles, 1));
  
  populationMesh = new THREE.Mesh(geometry, material);
  populationMesh.material.side = THREE.DoubleSide;
  scene.add(populationMesh);
  
  console.log(`Population mesh added: ${meshGeometry.numPixels} vertices, ${meshGeometry.triangles.length / 3} triangles`);
  console.log(`Max population per cell: ${maxPopulation.toFixed(0)}`);
  
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

// Start animation
animate();
