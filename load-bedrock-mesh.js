/**
 * Load pre-computed bedrock mesh in binary or JSON format
 * Mesh format includes positions, colors, and face indices
 */

/**
 * Load binary mesh format (.bin)
 *
 * Binary format:
 * - Header: 2 uint32 (vertex count, face count)
 * - Positions: vertex_count * 3 * float32 (x, y, z)
 * - Colors: vertex_count * 3 * float32 (r, g, b)
 * - Indices: face_count * 3 * uint32 (triangle indices)
 * - Values: vertex_count * float32 (original SH values)
 */
async function loadBinaryMesh(url) {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();

  const view = new DataView(arrayBuffer);
  let offset = 0;

  // Read header
  const vertexCount = view.getUint32(offset, true);
  offset += 4;
  const faceCount = view.getUint32(offset, true);
  offset += 4;

  // Read positions
  const positions = new Float32Array(arrayBuffer, offset, vertexCount * 3);
  offset += vertexCount * 3 * 4;

  // Read colors
  const colors = new Float32Array(arrayBuffer, offset, vertexCount * 3);
  offset += vertexCount * 3 * 4;

  // Read indices
  const indices = new Uint32Array(arrayBuffer, offset, faceCount * 3);
  offset += faceCount * 3 * 4;

  // Read values
  const values = new Float32Array(arrayBuffer, offset, vertexCount);

  console.log(`Loaded binary mesh:`);
  console.log(`  Vertices: ${vertexCount}`);
  console.log(`  Faces: ${faceCount}`);
  console.log(`  Size: ${(arrayBuffer.byteLength / 1024 / 1024).toFixed(2)} MB`);

  return {
    positions,
    colors,
    indices,
    values,
    vertexCount,
    faceCount
  };
}

/**
 * Load JSON mesh format (.json)
 */
async function loadJSONMesh(url) {
  const response = await fetch(url);
  const data = await response.json();

  const mesh = {
    positions: new Float32Array(data.positions),
    colors: new Float32Array(data.colors),
    indices: new Uint32Array(data.indices),
    values: new Float32Array(data.values),
    vertexCount: data.vertexCount,
    faceCount: data.faceCount
  };

  console.log(`Loaded JSON mesh:`);
  console.log(`  Vertices: ${mesh.vertexCount}`);
  console.log(`  Faces: ${mesh.faceCount}`);

  return mesh;
}

/**
 * Create Three.js BufferGeometry from mesh data
 *
 * @param {Object} mesh - Mesh data from loadBinaryMesh or loadJSONMesh
 * @returns {THREE.BufferGeometry}
 */
function createThreeGeometry(mesh) {
  const geometry = new THREE.BufferGeometry();

  // Set attributes
  geometry.setAttribute('position',
    new THREE.BufferAttribute(mesh.positions, 3));
  geometry.setAttribute('color',
    new THREE.BufferAttribute(mesh.colors, 3));

  // Set index
  geometry.setIndex(
    new THREE.BufferAttribute(mesh.indices, 1));

  // Compute normals for lighting
  geometry.computeVertexNormals();

  return geometry;
}

// Example usage with Three.js:
/*
import * as THREE from 'three';

// Load binary mesh (recommended, smaller size)
const mesh = await loadBinaryMesh('sources/bedrock_mesh_sub5.bin');

// Or load JSON mesh
// const mesh = await loadJSONMesh('sources/bedrock_mesh_sub5.json');

// Create Three.js geometry
const geometry = createThreeGeometry(mesh);

// Create material (vertex colors already baked in)
const material = new THREE.MeshPhongMaterial({
  vertexColors: true,  // Use baked colors
  flatShading: false,  // Smooth shading
  side: THREE.DoubleSide
});

// Create mesh
const bedrockMesh = new THREE.Mesh(geometry, material);
scene.add(bedrockMesh);

// Access original spherical harmonic values if needed
console.log('Value range:', Math.min(...mesh.values), Math.max(...mesh.values));
*/
