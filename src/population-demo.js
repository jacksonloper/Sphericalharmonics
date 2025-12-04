/**
 * Population Demo
 * Visualizes world population data as 3D truncated pyramids (frustums)
 * Each pyramid's height represents the population density of a HEALPix region
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import PopulationWorker from './populationWorker.js?worker';

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a1a);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 1, 3);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

// Orbit controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 1.5;
controls.maxDistance = 10;
controls.autoRotate = false;

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.6);
directionalLight1.position.set(5, 5, 5);
scene.add(directionalLight1);

const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
directionalLight2.position.set(-5, -5, -5);
scene.add(directionalLight2);

// Add a wireframe sphere at r=1 for reference
const sphereGeometry = new THREE.SphereGeometry(1, 64, 32);
const sphereMaterial = new THREE.MeshBasicMaterial({
  color: 0x333333,
  wireframe: true,
  transparent: true,
  opacity: 0.15
});
const referenceSphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
scene.add(referenceSphere);

// Info card
const infoCard = document.getElementById('infoCard');
const loadingStatus = document.getElementById('loadingStatus');
const populationInfo = document.getElementById('populationInfo');

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
  infoCard.style.display = 'block';
  aboutButton.style.display = 'none';
  // Hide loading status when reopening
  loadingStatus.style.display = 'none';
});

document.body.appendChild(aboutButton);

// Create Enter button
function createEnterButton() {
  const btn = document.createElement('button');
  btn.id = 'enterButton';
  btn.textContent = 'Enter';
  btn.style.marginTop = '20px';
  btn.style.padding = '12px 30px';
  btn.style.backgroundColor = '#4ecdc4';
  btn.style.color = '#000';
  btn.style.border = 'none';
  btn.style.borderRadius = '6px';
  btn.style.fontSize = '16px';
  btn.style.fontWeight = 'bold';
  btn.style.cursor = 'pointer';
  btn.style.transition = 'background-color 0.2s';
  
  btn.addEventListener('mouseenter', () => {
    btn.style.backgroundColor = '#3db9b0';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.backgroundColor = '#4ecdc4';
  });
  btn.addEventListener('click', () => {
    infoCard.style.display = 'none';
    aboutButton.style.display = 'block';
  });
  
  return btn;
}

// Start the worker
const worker = new PopulationWorker();

worker.onmessage = (e) => {
  const { type, message } = e.data;
  
  if (type === 'progress') {
    loadingStatus.textContent = message;
  } else if (type === 'info') {
    console.log('Worker info:', message);
    // Update population info if available
    if (message.includes('population:')) {
      populationInfo.textContent = message;
    }
  } else if (type === 'complete') {
    const { positions, indices, numPyramids, totalPopulation } = e.data;
    
    console.log(`Received geometry: ${positions.length / 3} vertices, ${indices.length / 3} triangles, ${numPyramids} pyramids`);
    
    // Create geometry
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeVertexNormals();
    
    // Create material with nice coloring
    const material = new THREE.MeshPhongMaterial({
      color: 0x4ecdc4,
      emissive: 0x0a2a28,
      shininess: 30,
      flatShading: false,
      side: THREE.DoubleSide
    });
    
    // Create mesh and add to scene
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    
    // Update info card
    loadingStatus.textContent = `Loaded! ${numPyramids.toLocaleString()} populated regions`;
    populationInfo.textContent = `Total population: ${(totalPopulation / 1e9).toFixed(2)} billion`;
    
    // Add enter button
    const enterBtn = createEnterButton();
    infoCard.appendChild(enterBtn);
    
    console.log('Population visualization loaded successfully!');
  } else if (type === 'error') {
    loadingStatus.textContent = `Error: ${message}`;
    loadingStatus.style.color = '#ff4444';
  }
};

// Handle window resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

animate();
