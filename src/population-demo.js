/**
 * Population Demo
 * Visualizes world population data as 3D truncated pyramids (frustums)
 * Each pyramid's height represents the population density of a HEALPix region
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import PopulationWorker from './populationWorker.js?worker';
import { pix2ang_nest } from '@hscmap/healpix';

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

// Visualization mode state
let visualizationMode = 'pyramids'; // 'pyramids' or 'dust'

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.6);
directionalLight1.position.set(5, 5, 5);
scene.add(directionalLight1);

const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
directionalLight2.position.set(-5, -5, -5);
scene.add(directionalLight2);

const directionalLight3 = new THREE.DirectionalLight(0xffffff, 0.4);
directionalLight3.position.set(-5, 3, 5);
scene.add(directionalLight3);

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
    // Show relief slider and mode control when entering
    const reliefControl = document.getElementById('reliefControl');
    if (reliefControl) {
      reliefControl.style.display = 'flex';
    }
    const modeControl = document.getElementById('modeControl');
    if (modeControl) {
      modeControl.style.display = 'flex';
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

// Create mode toggle control
function createModeToggle() {
  const modeControl = document.createElement('div');
  modeControl.id = 'modeControl';
  modeControl.style.position = 'absolute';
  modeControl.style.bottom = '15px';
  modeControl.style.left = '15px';
  modeControl.style.display = 'none';  // Hidden initially
  modeControl.style.flexDirection = 'row';
  modeControl.style.alignItems = 'center';
  modeControl.style.gap = '15px';
  modeControl.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  modeControl.style.color = 'white';
  modeControl.style.padding = '10px 15px';
  modeControl.style.borderRadius = '6px';
  modeControl.style.fontFamily = 'system-ui, -apple-system, sans-serif';
  modeControl.style.fontSize = '14px';
  modeControl.style.zIndex = '1000';
  
  const label = document.createElement('span');
  label.textContent = 'Mode:';
  
  const pyramidsOption = document.createElement('label');
  pyramidsOption.style.display = 'flex';
  pyramidsOption.style.alignItems = 'center';
  pyramidsOption.style.gap = '5px';
  pyramidsOption.style.cursor = 'pointer';
  
  const pyramidsRadio = document.createElement('input');
  pyramidsRadio.type = 'radio';
  pyramidsRadio.name = 'vizMode';
  pyramidsRadio.value = 'pyramids';
  pyramidsRadio.checked = true;
  pyramidsRadio.style.cursor = 'pointer';
  
  const pyramidsLabel = document.createElement('span');
  pyramidsLabel.textContent = 'Pyramids';
  
  pyramidsOption.appendChild(pyramidsRadio);
  pyramidsOption.appendChild(pyramidsLabel);
  
  const dustOption = document.createElement('label');
  dustOption.style.display = 'flex';
  dustOption.style.alignItems = 'center';
  dustOption.style.gap = '5px';
  dustOption.style.cursor = 'pointer';
  
  const dustRadio = document.createElement('input');
  dustRadio.type = 'radio';
  dustRadio.name = 'vizMode';
  dustRadio.value = 'dust';
  dustRadio.style.cursor = 'pointer';
  
  const dustLabel = document.createElement('span');
  dustLabel.textContent = 'Dust';
  
  dustOption.appendChild(dustRadio);
  dustOption.appendChild(dustLabel);
  
  // Handle mode change
  const handleModeChange = (e) => {
    visualizationMode = e.target.value;
    if (visualizationMode === 'pyramids') {
      if (window.populationMesh) window.populationMesh.visible = true;
      if (window.dustParticles) window.dustParticles.visible = false;
      if (window.earthSphere) window.earthSphere.visible = false;
      referenceGrid.visible = true;
    } else {
      if (window.populationMesh) window.populationMesh.visible = false;
      if (window.dustParticles) window.dustParticles.visible = true;
      if (window.earthSphere) window.earthSphere.visible = true;
      referenceGrid.visible = false;
    }
  };
  
  pyramidsRadio.addEventListener('change', handleModeChange);
  dustRadio.addEventListener('change', handleModeChange);
  
  modeControl.appendChild(label);
  modeControl.appendChild(pyramidsOption);
  modeControl.appendChild(dustOption);
  document.body.appendChild(modeControl);
}

// Create dark Earth sphere
function createEarthSphere() {
  const geometry = new THREE.SphereGeometry(0.825, 64, 64);
  const material = new THREE.MeshPhongMaterial({
    color: 0x1a1a2e,
    shininess: 5,
    side: THREE.FrontSide
  });
  const sphere = new THREE.Mesh(geometry, material);
  sphere.visible = false;
  scene.add(sphere);
  window.earthSphere = sphere;
  return sphere;
}

// Dust particle system
class DustParticleSystem {
  constructor(populationData, nside) {
    this.populationData = populationData;
    this.nside = nside;
    this.maxParticles = 600;
    this.particles = [];
    this.spawnTimer = 0;
    this.spawnInterval = 100; // Spawn every 100ms (1/10th second)
    
    // Create particle geometry and material with max capacity
    this.geometry = new THREE.BufferGeometry();
    this.positions = new Float32Array(this.maxParticles * 3);
    this.colors = new Float32Array(this.maxParticles * 3);
    this.sizes = new Float32Array(this.maxParticles);
    this.brightness = new Float32Array(this.maxParticles); // New: brightness per particle
    
    // Particle material with glow effect
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 }
      },
      vertexShader: `
        attribute float size;
        attribute vec3 color;
        attribute float brightness;
        varying vec3 vColor;
        varying float vBrightness;
        
        void main() {
          vColor = color;
          vBrightness = brightness;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vBrightness;
        
        void main() {
          // Create circular particle with glow
          vec2 center = gl_PointCoord - vec2(0.5);
          float dist = length(center);
          
          // Soft glow with falloff
          float alpha = smoothstep(0.5, 0.0, dist);
          alpha = pow(alpha, 2.0) * 0.6 * vBrightness;
          
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false
    });
    
    // Initialize cumulative distribution for sampling
    this.initializeCumulativeDist();
    
    // Initialize all particles immediately with full brightness
    for (let i = 0; i < this.maxParticles; i++) {
      // Sample pixel index weighted by population for center location
      const rand = Math.random() * this.totalPopulation;
      let pixelIndex = 0;
      for (let j = 0; j < this.cumulativeDist.length; j++) {
        if (rand < this.cumulativeDist[j]) {
          pixelIndex = j;
          break;
        }
      }
      
      // Get pixel position using HEALPix
      const angResult = pix2ang_nest(this.nside, pixelIndex);
      const theta = angResult.theta;
      const phi = angResult.phi;
      
      // Convert to Cartesian (center at radius ~1.05)
      const r = 1.05 + Math.random() * 0.1;
      const x = r * Math.sin(theta) * Math.cos(phi);
      const z = r * Math.sin(theta) * Math.sin(phi);
      const y = r * Math.cos(theta); // HEALPix z -> THREE y
      
      this.particles.push({
        center: new THREE.Vector3(x, y, -z), // Center position that OU wanders around
        position: new THREE.Vector3(x, y, -z), // Current position
        velocity: new THREE.Vector3(0, 0, 0)
      });
      
      // Set initial position in buffer
      const idx = i * 3;
      this.positions[idx] = x;
      this.positions[idx + 1] = y;
      this.positions[idx + 2] = -z;
      
      // Set random color
      this.colors[idx] = Math.random();
      this.colors[idx + 1] = Math.random();
      this.colors[idx + 2] = Math.random();
      
      this.sizes[i] = 0.208 + Math.random() * 0.104; // 1/3 of previous size
      this.brightness[i] = 1.0; // Start visible
    }
    
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));
    this.geometry.setAttribute('brightness', new THREE.BufferAttribute(this.brightness, 1));
    
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.visible = false;
    scene.add(this.points);
    window.dustParticles = this.points;
  }
  
  initializeCumulativeDist() {
    // Create cumulative distribution for sampling
    this.totalPopulation = this.populationData.reduce((sum, p) => sum + p, 0);
    this.cumulativeDist = [];
    let cumSum = 0;
    for (let i = 0; i < this.populationData.length; i++) {
      cumSum += this.populationData[i];
      this.cumulativeDist.push(cumSum);
    }
  }
  
  updateParticleCenter() {
    // Pick a random particle
    const slotIndex = Math.floor(Math.random() * this.maxParticles);
    
    // Sample new pixel index weighted by population
    const rand = Math.random() * this.totalPopulation;
    let pixelIndex = 0;
    for (let j = 0; j < this.cumulativeDist.length; j++) {
      if (rand < this.cumulativeDist[j]) {
        pixelIndex = j;
        break;
      }
    }
    
    // Get pixel position using HEALPix
    const angResult = pix2ang_nest(this.nside, pixelIndex);
    const theta = angResult.theta;
    const phi = angResult.phi;
    
    // Convert to Cartesian (center at radius ~1.05)
    const r = 1.05 + Math.random() * 0.1;
    const x = r * Math.sin(theta) * Math.cos(phi);
    const z = r * Math.sin(theta) * Math.sin(phi);
    const y = r * Math.cos(theta); // HEALPix z -> THREE y
    
    // Update particle's center location
    this.particles[slotIndex].center.set(x, y, -z);
    
    // Also set new random color
    const idx = slotIndex * 3;
    this.colors[idx] = Math.random();
    this.colors[idx + 1] = Math.random();
    this.colors[idx + 2] = Math.random();
  }
  
  update(deltaTime) {
    const dt = deltaTime / 1000; // Convert to seconds
    const theta = 3.0; // Mean reversion strength (doubled to make particles wander half as far)
    const sigma = 0.15; // Noise intensity (halved to make particles wander half as far)
    const minRadius = 1.01; // Keep outside Earth sphere
    
    // Handle center updates
    this.spawnTimer += deltaTime;
    if (this.spawnTimer >= this.spawnInterval) {
      this.updateParticleCenter();
      this.spawnTimer -= this.spawnInterval;
    }
    
    // Update all particles
    for (let i = 0; i < this.maxParticles; i++) {
      const particle = this.particles[i];
      
      // OU process: velocity drifts toward zero, but position drifts toward center
      const noise = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2
      );
      
      // Calculate displacement from center
      const displacement = new THREE.Vector3().subVectors(particle.position, particle.center);
      
      // OU dynamics: pull toward center and add noise
      particle.velocity.x += (-theta * displacement.x * dt + sigma * noise.x * Math.sqrt(dt));
      particle.velocity.y += (-theta * displacement.y * dt + sigma * noise.y * Math.sqrt(dt));
      particle.velocity.z += (-theta * displacement.z * dt + sigma * noise.z * Math.sqrt(dt));
      
      // Update position
      particle.position.x += particle.velocity.x * dt;
      particle.position.y += particle.velocity.y * dt;
      particle.position.z += particle.velocity.z * dt;
      
      // Reflecting dynamics to keep outside sphere
      const radius = particle.position.length();
      if (radius < minRadius) {
        // Reflect position - normal is unit vector pointing outward
        const normal = particle.position.clone().normalize();
        particle.position.copy(normal.clone().multiplyScalar(minRadius));
        
        // Reflect velocity - need fresh normal since multiplyScalar modifies it
        const velocityDotNormal = particle.velocity.dot(normal);
        if (velocityDotNormal < 0) {
          particle.velocity.sub(normal.multiplyScalar(2 * velocityDotNormal));
        }
      }
      
      // Update buffer
      const idx = i * 3;
      this.positions[idx] = particle.position.x;
      this.positions[idx + 1] = particle.position.y;
      this.positions[idx + 2] = particle.position.z;
    }
    
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.material.uniforms.time.value += deltaTime;
  }
}

let dustSystem = null;

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
    
    // Store mesh reference for mode toggle
    window.populationMesh = mesh;
    
    // Store material reference for relief slider
    window.populationMaterial = material;
    
    // Store population data for dust system (need to request it from worker)
    // We'll use the data that was sent
    window.populationData = e.data.populationData || null;
    window.nside = e.data.nside || 64;
    
    // Create Earth sphere (hidden initially)
    createEarthSphere();
    
    // Create dust particle system if we have population data
    if (window.populationData) {
      dustSystem = new DustParticleSystem(window.populationData, window.nside);
    }
    
    // Update info card
    loadingStatus.textContent = `Loaded! ${numPyramids.toLocaleString()} populated regions`;
    populationInfo.textContent = `Total population: ${(totalPopulation / 1e9).toFixed(2)} billion`;
    
    // Add enter button
    const enterBtn = createEnterButton();
    infoCard.appendChild(enterBtn);
    
    // Create relief slider (hidden initially, shown after Enter)
    createReliefSlider();
    
    // Create mode toggle (hidden initially, shown after Enter)
    createModeToggle();
    
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
let lastTime = Date.now();
function animate() {
  requestAnimationFrame(animate);
  
  const currentTime = Date.now();
  const deltaTime = currentTime - lastTime;
  lastTime = currentTime;
  
  // Update dust system if in dust mode
  if (dustSystem && visualizationMode === 'dust') {
    dustSystem.update(deltaTime);
  }
  
  controls.update();
  renderer.render(scene, camera);
}

animate();
