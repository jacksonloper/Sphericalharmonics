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
// Starting with a simple pattern (modify these to create different patterns)
const coefficients = new Float32Array(25);

// Example: Set some interesting coefficients
coefficients[0] = 0.0;   // Y_0^0 - set to zero for balanced colors
coefficients[3] = 0.5;   // Y_1^0
coefficients[8] = 0.3;   // Y_2^0
coefficients[6] = 0.4;   // Y_2^-2
coefficients[10] = 0.2;  // Y_2^2

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

// Coefficient indices we'll evolve
const activeIndices = [3, 6, 8, 10];

// Initialize position x (coefficients on n-sphere) and velocity v
const n = activeIndices.length;
const x = new Float32Array(n);
const v = new Float32Array(n);

// Initialize x on the sphere with the current coefficient values
x[0] = 0.5;  // coeff[3]
x[1] = 0.4;  // coeff[6]
x[2] = 0.3;  // coeff[8]
x[3] = 0.2;  // coeff[10]

// Normalize to sphere
let norm = Math.sqrt(x[0]*x[0] + x[1]*x[1] + x[2]*x[2] + x[3]*x[3]);
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
