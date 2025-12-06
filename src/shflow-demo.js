import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import vertexShader from './shflow-shaders/vertex.glsl?raw';
import fragmentShader from './shflow-shaders/fragment.glsl?raw';

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
  maxOrder: 3, // Maximum harmonic order (l)
  theta: 0.5,  // Mean reversion rate
  sigma: 0.3   // Volatility/noise level
};

const ouParamLabels = {
  maxOrder: 'Max Harmonic Order (l)',
  theta: 'Mean Reversion (θ)',
  sigma: 'Volatility (σ)'
};

// Function to generate active indices for a given max order
// Spherical harmonic indexing: l=0: [0], l=1: [1,2,3], l=2: [4,5,6,7,8], etc.
// We exclude l=0 (index 0) from evolution
function getActiveIndices(maxOrder) {
  const indices = [];
  for (let l = 1; l <= maxOrder; l++) {
    const startIndex = l * l; // Start index for order l
    const count = 2 * l + 1;  // Number of coefficients for order l
    for (let m = 0; m < count; m++) {
      indices.push(startIndex + m);
    }
  }
  return indices;
}

// Coefficient indices we'll evolve
let activeIndices = getActiveIndices(ouParams.maxOrder);

// Initialize position x (coefficients on n-sphere) and velocity v
let n = activeIndices.length;
let x = new Float32Array(n);
let v = new Float32Array(n);

// Function to initialize the system
function initializeSystem() {
  n = activeIndices.length;
  x = new Float32Array(n);
  v = new Float32Array(n);

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
}

// Initialize the system
initializeSystem();

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
const infoCard = document.getElementById('infoCard');
const aboutButton = document.getElementById('aboutButton');
const enterButton = document.getElementById('enterButton');
const hamburger = document.getElementById('hamburger');
const frequencyList = document.getElementById('frequency-list');
const sliderPanel = document.getElementById('slider-panel');
const slider = document.getElementById('slider');
const sliderTitle = document.getElementById('slider-title');
const sliderValueDisplay = document.getElementById('slider-value-display');
const backBtn = document.querySelector('.back-btn');

// Setup About button
aboutButton.addEventListener('click', () => {
  infoCard.style.display = 'block';
  aboutButton.style.display = 'none';
});

// Setup Enter button
enterButton.addEventListener('click', () => {
  infoCard.style.display = 'none';
  aboutButton.style.display = 'block';
});

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

    // Update slider range based on parameter
    if (paramId === 'maxOrder') {
      slider.min = 1;
      slider.max = 4;
      slider.step = 1;
      sliderValueDisplay.textContent = Math.round(ouParams[paramId]).toString();
    } else if (paramId === 'theta') {
      slider.min = 0;
      slider.max = 2;
      slider.step = 0.05;
      sliderValueDisplay.textContent = ouParams[paramId].toFixed(2);
    } else if (paramId === 'sigma') {
      slider.min = 0;
      slider.max = 1;
      slider.step = 0.05;
      sliderValueDisplay.textContent = ouParams[paramId].toFixed(2);
    }

    frequencyList.classList.remove('show');
    sliderPanel.classList.add('show');
  });
});

// Update parameter from slider
slider.addEventListener('input', (e) => {
  const value = parseFloat(e.target.value);

  if (currentParam === 'maxOrder') {
    const intValue = Math.round(value);
    sliderValueDisplay.textContent = intValue.toString();

    // Only update if value actually changed
    if (ouParams.maxOrder !== intValue) {
      ouParams.maxOrder = intValue;
      document.getElementById(`${currentParam}-display`).textContent = intValue.toString();

      // Reinitialize system with new order
      activeIndices = getActiveIndices(ouParams.maxOrder);
      initializeSystem();

      // Reset all coefficients to zero first
      for (let i = 0; i < coefficients.length; i++) {
        coefficients[i] = 0;
      }
      // Update active coefficients
      for (let i = 0; i < n; i++) {
        coefficients[activeIndices[i]] = x[i];
      }
    }
  } else {
    sliderValueDisplay.textContent = value.toFixed(2);
    ouParams[currentParam] = value;
    document.getElementById(`${currentParam}-display`).textContent = value.toFixed(2);
  }
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
