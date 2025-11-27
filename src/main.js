import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import vertexShader from './shaders/vertex.glsl?raw';
import fragmentShader from './shaders/fragment.glsl?raw';

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

camera.position.z = 3;

// Add orbit controls for interactive camera movement
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 1;
controls.maxDistance = 10;

// Create sphere geometry with high detail for smooth deformation
const geometry = new THREE.IcosahedronGeometry(1, 64);

// Initialize spherical harmonic coefficients
// Up to l=4 (25 total), but only evolving through l=3
const coefficients = new Float32Array(25);

// Y_0^0 set to zero for balanced colors (not evolved)
coefficients[0] = 0.0;

// Shader material
const material = new THREE.ShaderMaterial({
  uniforms: {
    coefficients: { value: coefficients },
    time: { value: 0 },
    displacementScale: { value: 1.5 },
    positiveColor: { value: new THREE.Color(0xff6b35) }, // Orange/red for positive
    negativeColor: { value: new THREE.Color(0x4ecdc4) }, // Teal for negative
    lightDirection: { value: new THREE.Vector3(1, 1, 1).normalize() },     // Key light from top-right
    lightDirection2: { value: new THREE.Vector3(-1, -0.5, 0.5).normalize() } // Fill light from left-bottom
  },
  vertexShader,
  fragmentShader,
  side: THREE.DoubleSide
});

const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

// OU process parameters
const ouParams = {
  theta: 0.5,  // Mean reversion rate
  sigma: 0.3   // Volatility/noise level
};

const ouParamLabels = {
  theta: 'Mean Reversion (θ)',
  sigma: 'Volatility (σ)'
};

// Coefficient indices we'll evolve: all through l=3 (excluding l=0)
// l=1: 1,2,3 | l=2: 4,5,6,7,8 | l=3: 9,10,11,12,13,14,15
const activeIndices = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

// Initialize position x (coefficients on n-sphere) and velocity v
const n = activeIndices.length; // 15 dimensions
const x = new Float32Array(n);
const v = new Float32Array(n);

// Initialize x with random values on the sphere
for (let i = 0; i < n; i++) {
  x[i] = (Math.random() - 0.5) * 2;
}

// Normalize to sphere
let norm = 0;
for (let i = 0; i < n; i++) {
  norm += x[i] * x[i];
}
norm = Math.sqrt(norm);
for (let i = 0; i < n; i++) {
  x[i] /= norm;
}

// Initialize velocity to zero
for (let i = 0; i < n; i++) {
  v[i] = 0;
}

// Box-Muller transform for Gaussian noise
function gaussianRandom() {
  let u1 = Math.random();
  let u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// OU process update function
function updateOU(dt) {
  const theta = ouParams.theta;
  const sigma = ouParams.sigma;
  const sqrtDt = Math.sqrt(dt);

  // Update velocity using OU process: dv = -theta*v*dt + sigma*sqrt(dt)*N(0,1)
  for (let i = 0; i < n; i++) {
    const noise = gaussianRandom();
    v[i] = v[i] * (1 - theta * dt) + sigma * sqrtDt * noise;
  }

  // Update position: x += v*dt
  for (let i = 0; i < n; i++) {
    x[i] += v[i] * dt;
  }

  // Project back onto sphere: normalize x
  let norm = 0;
  for (let i = 0; i < n; i++) {
    norm += x[i] * x[i];
  }
  norm = Math.sqrt(norm);
  for (let i = 0; i < n; i++) {
    x[i] /= norm;
  }

  // Update coefficients from x
  for (let i = 0; i < n; i++) {
    coefficients[activeIndices[i]] = x[i];
  }
}

let currentParam = null;

// UI elements
const hamburger = document.getElementById('hamburger');
const frequencyList = document.getElementById('frequency-list');
const sliderPanel = document.getElementById('slider-panel');
const slider = document.getElementById('slider');
const sliderTitle = document.getElementById('slider-title');
const sliderValueDisplay = document.getElementById('slider-value-display');
const backBtn = document.querySelector('.back-btn');

// Initialize coefficient display
const coeffList = document.getElementById('coeff-list');
const coeffDisplayElements = [];

// Create display elements for all active coefficients
for (let i = 0; i < activeIndices.length; i++) {
  const row = document.createElement('div');
  row.className = 'coeff-row';

  const index = document.createElement('span');
  index.className = 'coeff-index';
  index.textContent = `[${activeIndices[i]}]`;

  const value = document.createElement('span');
  value.className = 'coeff-value';
  value.textContent = '0.00';

  row.appendChild(index);
  row.appendChild(value);
  coeffList.appendChild(row);

  coeffDisplayElements.push(value);
}

// Function to update coefficient display
function updateCoeffDisplay() {
  for (let i = 0; i < activeIndices.length; i++) {
    const val = coefficients[activeIndices[i]];
    coeffDisplayElements[i].textContent = val.toFixed(2);
  }
}

// Toggle hamburger menu
hamburger.addEventListener('click', () => {
  const isOpen = frequencyList.classList.contains('show');
  if (isOpen) {
    frequencyList.classList.remove('show');
    sliderPanel.classList.remove('show');
    hamburger.classList.remove('open');
  } else {
    frequencyList.classList.add('show');
    hamburger.classList.add('open');
  }
});

// Open slider for specific parameter
document.querySelectorAll('.freq-item').forEach(item => {
  item.addEventListener('click', () => {
    const paramId = item.dataset.freq;

    // Skip if no data-freq attribute (wireframe toggle)
    if (!paramId) return;

    currentParam = paramId;

    sliderTitle.textContent = ouParamLabels[paramId];
    slider.value = ouParams[paramId];
    sliderValueDisplay.textContent = ouParams[paramId].toFixed(2);

    // Update slider range based on parameter
    if (paramId === 'theta') {
      slider.min = 0;
      slider.max = 2;
      slider.step = 0.05;
    } else if (paramId === 'sigma') {
      slider.min = 0;
      slider.max = 1;
      slider.step = 0.05;
    }

    frequencyList.classList.remove('show');
    sliderPanel.classList.add('show');
  });
});

// Update parameter from slider
slider.addEventListener('input', (e) => {
  const value = parseFloat(e.target.value);
  sliderValueDisplay.textContent = value.toFixed(2);
  ouParams[currentParam] = value;
  document.getElementById(`${currentParam}-display`).textContent = value.toFixed(2);
});

// Back button
backBtn.addEventListener('click', () => {
  sliderPanel.classList.remove('show');
  frequencyList.classList.add('show');
});

// Wireframe toggle
const wireframeToggle = document.getElementById('wireframe-toggle');
const wireframeStatus = document.getElementById('wireframe-status');
let wireframeEnabled = false;

wireframeToggle.addEventListener('click', (e) => {
  // Prevent opening slider for wireframe toggle
  e.stopPropagation();

  wireframeEnabled = !wireframeEnabled;
  material.wireframe = wireframeEnabled;
  wireframeStatus.textContent = wireframeEnabled ? 'ON' : 'OFF';
});

// Animation loop
let time = 0;
let lastTime = performance.now();

function animate() {
  requestAnimationFrame(animate);

  const currentTime = performance.now();
  const dt = Math.min((currentTime - lastTime) / 1000, 0.1); // Cap dt to avoid instability
  lastTime = currentTime;

  time += dt;
  material.uniforms.time.value = time;

  // Update coefficients using OU process
  updateOU(dt);

  // Update coefficient display
  updateCoeffDisplay();

  // Update orbit controls
  controls.update();

  renderer.render(scene, camera);
}

animate();

// Handle window resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
