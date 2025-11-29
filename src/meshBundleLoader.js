/**
 * Adaptive mesh bundle loader with automatic quality selection
 */

import { loadAdaptiveMesh } from './adaptiveMeshLoader.js';

/**
 * Detect device capabilities and recommend mesh quality
 * @returns {string} Quality level: 'low', 'medium', 'high', or 'ultra'
 */
export function detectOptimalQuality() {
  // Check device memory (if available)
  const deviceMemoryGB = navigator.deviceMemory || 4; // Default to 4GB if not available

  // Check if mobile
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  // Check WebGL capabilities
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

  let maxTextureSize = 2048;
  if (gl) {
    maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  }

  // Decision logic
  if (isMobile) {
    if (deviceMemoryGB < 2) {
      return 'low';
    } else if (deviceMemoryGB < 4) {
      return 'medium';
    } else {
      return 'high';
    }
  } else {
    // Desktop
    if (deviceMemoryGB < 4) {
      return 'medium';
    } else if (deviceMemoryGB < 8) {
      return 'high';
    } else {
      return 'ultra';
    }
  }
}

/**
 * Load mesh bundle manifest
 * @returns {Promise<Object>} Bundle manifest
 */
export async function loadBundleManifest() {
  try {
    const response = await fetch('earthtoposources/mesh_bundles.json');
    return await response.json();
  } catch (error) {
    console.warn('Failed to load bundle manifest, using fallback', error);
    // Fallback manifest
    return {
      bundles: {
        low: { file: 'earthtoposources/sur_adaptive_low.mesh' },
        medium: { file: 'earthtoposources/sur_adaptive_medium.mesh' },
        high: { file: 'earthtoposources/sur_adaptive_high.mesh' },
        ultra: { file: 'earthtoposources/sur_adaptive_ultra.mesh' }
      }
    };
  }
}

/**
 * Load adaptive mesh bundle with automatic quality selection
 * @param {Object} options - Options
 * @param {string} options.quality - Force specific quality ('low', 'medium', 'high', 'ultra', or 'auto')
 * @param {Function} options.onProgress - Progress callback (quality, bytesLoaded, bytesTotal)
 * @returns {Promise<Object>} Mesh data
 */
export async function loadMeshBundle(options = {}) {
  const {
    quality = 'auto',
    onProgress = null
  } = options;

  // Load manifest
  const manifest = await loadBundleManifest();

  // Determine quality level
  let selectedQuality = quality;
  if (quality === 'auto') {
    selectedQuality = detectOptimalQuality();
    console.log(`Auto-detected quality: ${selectedQuality}`);
  }

  // Validate quality
  if (!manifest.bundles[selectedQuality]) {
    console.warn(`Quality "${selectedQuality}" not available, falling back to medium`);
    selectedQuality = 'medium';
  }

  const bundle = manifest.bundles[selectedQuality];
  console.log(`Loading ${selectedQuality} quality mesh:`, bundle);

  // Load mesh with progress tracking
  const meshUrl = bundle.file;

  // Fetch with progress
  const response = await fetch(meshUrl);
  const contentLength = response.headers.get('content-length');
  const total = parseInt(contentLength, 10);

  const reader = response.body.getReader();
  const chunks = [];
  let loaded = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) break;

    chunks.push(value);
    loaded += value.length;

    if (onProgress && total) {
      onProgress(selectedQuality, loaded, total);
    }
  }

  // Combine chunks into single buffer
  const buffer = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }

  // Parse mesh from buffer
  const meshData = parseMeshFromBuffer(buffer.buffer);

  return {
    ...meshData,
    quality: selectedQuality,
    bundleInfo: bundle
  };
}

/**
 * Parse adaptive mesh from ArrayBuffer
 * (Extracted from loadAdaptiveMesh for use with custom loading)
 */
function parseMeshFromBuffer(buffer) {
  const dataView = new DataView(buffer);
  let offset = 0;

  // Read header
  const header = new TextDecoder().decode(buffer.slice(offset, offset + 7));
  offset += 7;

  if (header !== 'ADAMESH') {
    throw new Error(`Invalid adaptive mesh header: ${header}`);
  }

  // Read version
  const version = dataView.getUint8(offset);
  offset += 1;

  if (version !== 1) {
    throw new Error(`Unsupported mesh version: ${version}`);
  }

  // Read counts
  const numVertices = dataView.getUint32(offset, true);
  offset += 4;

  const numTriangles = dataView.getUint32(offset, true);
  offset += 4;

  // Read vertices
  const positions = new Float32Array(numVertices * 3);
  for (let i = 0; i < numVertices * 3; i++) {
    positions[i] = dataView.getFloat32(offset, true);
    offset += 4;
  }

  // Read elevations
  const elevations = new Float32Array(numVertices);
  let minElev = Infinity;
  let maxElev = -Infinity;

  for (let i = 0; i < numVertices; i++) {
    elevations[i] = dataView.getFloat32(offset, true);
    minElev = Math.min(minElev, elevations[i]);
    maxElev = Math.max(maxElev, elevations[i]);
    offset += 4;
  }

  // Read triangles
  const indices = new Uint32Array(numTriangles * 3);
  for (let i = 0; i < numTriangles * 3; i++) {
    indices[i] = dataView.getUint32(offset, true);
    offset += 4;
  }

  // Create Three.js geometry
  const THREE = window.THREE;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.setAttribute('elevation', new THREE.BufferAttribute(elevations, 1));

  const stats = {
    numVertices,
    numTriangles,
    minElevation: minElev,
    maxElevation: maxElev,
    fileSize: buffer.byteLength
  };

  return { geometry, elevations, stats };
}

/**
 * Preload multiple quality levels for instant switching
 * @param {Array<string>} qualities - Quality levels to preload
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Object>} Map of quality -> mesh data
 */
export async function preloadMeshBundles(qualities = ['low', 'medium', 'high'], onProgress = null) {
  const meshCache = {};
  const manifest = await loadBundleManifest();

  for (let i = 0; i < qualities.length; i++) {
    const quality = qualities[i];

    if (onProgress) {
      onProgress(quality, i, qualities.length);
    }

    try {
      meshCache[quality] = await loadMeshBundle({ quality });
      console.log(`✓ Preloaded ${quality} quality mesh`);
    } catch (error) {
      console.error(`Failed to preload ${quality} quality:`, error);
    }
  }

  return meshCache;
}

/**
 * Get bundle recommendations based on connection speed
 * @returns {Promise<string>} Recommended quality level
 */
export async function getRecommendedQuality() {
  // Use Network Information API if available
  if ('connection' in navigator) {
    const connection = navigator.connection;
    const effectiveType = connection.effectiveType;

    // Map connection types to quality
    const qualityMap = {
      'slow-2g': 'low',
      '2g': 'low',
      '3g': 'medium',
      '4g': 'high'
    };

    if (effectiveType in qualityMap) {
      return qualityMap[effectiveType];
    }
  }

  // Fallback to device detection
  return detectOptimalQuality();
}
