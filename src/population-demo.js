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

// Add lat/lon grid lines at r=1 for reference
function createLatLonGrid() {
  const gridGroup = new THREE.Group();
  const radius = 1.0;
  const segments = 64;
  
  // Material for grid lines
  const lineMaterial = new THREE.LineBasicMaterial({
    color: 0x333333,
    transparent: true,
    opacity: 0.15
  });
  
  // Create latitude lines (parallels)
  for (let lat = -80; lat <= 80; lat += 20) {
    const theta = (90 - lat) * Math.PI / 180; // Convert latitude to colatitude in radians
    const r = radius * Math.sin(theta);
    const y = radius * Math.cos(theta);
    
    const points = [];
    for (let i = 0; i <= segments; i++) {
      const phi = (i / segments) * 2 * Math.PI;
      const x = r * Math.cos(phi);
      const z = -r * Math.sin(phi);
      points.push(new THREE.Vector3(x, y, z));
    }
    
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geometry, lineMaterial);
    gridGroup.add(line);
  }
  
  // Create longitude lines (meridians)
  for (let lon = 0; lon < 180; lon += 20) {
    const points = [];
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI; // 0 to PI (north to south pole)
      const phi = lon * Math.PI / 180;
      
      const x = radius * Math.sin(theta) * Math.cos(phi);
      const y = radius * Math.cos(theta);
      const z = -radius * Math.sin(theta) * Math.sin(phi);
      points.push(new THREE.Vector3(x, y, z));
    }
    
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geometry, lineMaterial);
    gridGroup.add(line);
  }
  
  return gridGroup;
}

const referenceGrid = createLatLonGrid();
scene.add(referenceGrid);

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
    // Show relief slider when entering
    const reliefControl = document.getElementById('reliefControl');
    if (reliefControl) {
      reliefControl.style.display = 'flex';
    }
  });
  
  return btn;
}

// Create relief slider control
function createReliefSlider() {
  const reliefControl = document.createElement('div');
  reliefControl.id = 'reliefControl';
  reliefControl.style.position = 'absolute';
  reliefControl.style.top = '70px';
  reliefControl.style.left = '15px';
  reliefControl.style.display = 'none';  // Hidden initially
  reliefControl.style.flexDirection = 'row';
  reliefControl.style.alignItems = 'center';
  reliefControl.style.gap = '10px';
  reliefControl.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  reliefControl.style.color = 'white';
  reliefControl.style.padding = '10px 15px';
  reliefControl.style.borderRadius = '6px';
  reliefControl.style.fontFamily = 'system-ui, -apple-system, sans-serif';
  reliefControl.style.fontSize = '14px';
  reliefControl.style.zIndex = '1000';
  
  const label = document.createElement('span');
  label.textContent = 'Relief:';
  label.style.minWidth = '50px';
  
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '100';
  slider.value = '100';
  slider.style.width = '150px';
  slider.style.cursor = 'pointer';
  
  const valueDisplay = document.createElement('span');
  valueDisplay.textContent = '1.00';
  valueDisplay.style.minWidth = '40px';
  valueDisplay.style.textAlign = 'right';
  
  slider.addEventListener('input', (e) => {
    const value = parseFloat(e.target.value) / 100;
    valueDisplay.textContent = value.toFixed(2);
    
    if (window.populationMaterial) {
      window.populationMaterial.uniforms.relief.value = value;
    }
  });
  
  reliefControl.appendChild(label);
  reliefControl.appendChild(slider);
  reliefControl.appendChild(valueDisplay);
  document.body.appendChild(reliefControl);
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
    const { positions, radiusTargets, colors, indices, numPyramids, totalPopulation } = e.data;
    
    console.log(`Received geometry: ${positions.length / 3} vertices, ${indices.length / 3} triangles, ${numPyramids} pyramids`);
    
    // Create geometry
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('radiusTarget', new THREE.BufferAttribute(radiusTargets, 1));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeVertexNormals();
    
    // Create custom shader material with relief control
    const material = new THREE.ShaderMaterial({
      uniforms: {
        relief: { value: 1.0 }  // 0.0 = flat (all at r=1), 1.0 = full height
      },
      vertexShader: `
        attribute float radiusTarget;
        attribute vec3 color;
        uniform float relief;
        varying vec3 vColor;
        varying vec3 vNormal;
        
        void main() {
          vColor = color;
          
          // Compute actual radius based on relief slider
          // relief=0: radius=1 (flat), relief=1: radius=radiusTarget (full height)
          float radius = 1.0 + relief * (radiusTarget - 1.0);
          
          // Displace vertex radially (positions are normalized to unit sphere)
          vec3 displacedPosition = normalize(position) * radius;
          
          // Transform normal (keep it fixed, don't adjust with relief)
          vNormal = normalize(normalMatrix * normal);
          
          gl_Position = projectionMatrix * modelViewMatrix * vec4(displacedPosition, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying vec3 vNormal;
        
        void main() {
          // Simple lighting
          vec3 light1 = normalize(vec3(1.0, 1.0, 1.0));
          vec3 light2 = normalize(vec3(-1.0, -0.5, -0.5));
          float diffuse1 = max(dot(vNormal, light1), 0.0) * 0.6;
          float diffuse2 = max(dot(vNormal, light2), 0.0) * 0.3;
          float ambient = 0.4;
          
          float lighting = diffuse1 + diffuse2 + ambient;
          vec3 finalColor = vColor * lighting;
          
          gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
      side: THREE.DoubleSide
    });
    
    // Create mesh and add to scene
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    
    // Store material reference for relief slider
    window.populationMaterial = material;
    
    // Update info card
    loadingStatus.textContent = `Loaded! ${numPyramids.toLocaleString()} populated regions`;
    populationInfo.textContent = `Total population: ${(totalPopulation / 1e9).toFixed(2)} billion`;
    
    // Add enter button
    const enterBtn = createEnterButton();
    infoCard.appendChild(enterBtn);
    
    // Create relief slider (hidden initially, shown after Enter)
    createReliefSlider();
    
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
