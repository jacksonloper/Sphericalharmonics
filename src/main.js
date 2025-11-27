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
coefficients[0] = 1.0;   // Y_0^0
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
    lightDirection: { value: new THREE.Vector3(1, 1, 1).normalize() }
  },
  vertexShader,
  fragmentShader,
  side: THREE.DoubleSide
});

const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

// Animation loop
let time = 0;
function animate() {
  requestAnimationFrame(animate);

  time += 0.01;
  material.uniforms.time.value = time;

  // Animate coefficients for lava lamp effect
  // These sinusoidal changes to coefficients create smooth morphing
  coefficients[3] = 0.5 + Math.sin(time * 0.5) * 0.3;
  coefficients[6] = 0.4 + Math.cos(time * 0.7) * 0.2;
  coefficients[8] = 0.3 + Math.sin(time * 0.3) * 0.2;
  coefficients[10] = 0.2 + Math.cos(time * 0.9) * 0.15;

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
