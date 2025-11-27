import * as THREE from 'three';
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
    displacementScale: { value: 0.3 },
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

  // Slowly rotate the sphere
  mesh.rotation.y = time * 0.2;
  mesh.rotation.x = Math.sin(time * 0.1) * 0.2;

  // Animate coefficients for lava lamp effect
  coefficients[3] = 0.5 + Math.sin(time * 0.5) * 0.3;
  coefficients[6] = 0.4 + Math.cos(time * 0.7) * 0.2;
  coefficients[8] = 0.3 + Math.sin(time * 0.3) * 0.2;
  coefficients[10] = 0.2 + Math.cos(time * 0.9) * 0.15;

  renderer.render(scene, camera);
}

animate();

// Handle window resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Mouse interaction for rotation control
let mouseX = 0;
let mouseY = 0;
let targetRotationX = 0;
let targetRotationY = 0;

document.addEventListener('mousemove', (event) => {
  mouseX = (event.clientX / window.innerWidth) * 2 - 1;
  mouseY = (event.clientY / window.innerHeight) * 2 - 1;
  targetRotationY = mouseX * Math.PI;
  targetRotationX = mouseY * Math.PI;
});

// Smooth rotation following mouse
setInterval(() => {
  mesh.rotation.y += (targetRotationY - mesh.rotation.y) * 0.05;
  mesh.rotation.x += (targetRotationX - mesh.rotation.x) * 0.05;
}, 16);
