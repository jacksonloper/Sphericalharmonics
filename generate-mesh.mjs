#!/usr/bin/env node
/**
 * Generate mesh from HEALPix data
 * Usage: node generate-mesh.mjs [subdivisions]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Import mesh generation functions (simplified for Node.js)
function createIcosahedron() {
  const t = (1 + Math.sqrt(5)) / 2;

  const positions = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]
  ];

  const vertices = positions.map(([x, y, z]) => {
    const len = Math.sqrt(x * x + y * y + z * z);
    return [x / len, y / len, z / len];
  });

  const indices = [
    0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11,
    1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
    3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9,
    4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1
  ];

  return { vertices, indices };
}

function subdivideMesh(vertices, indices) {
  const midpointCache = new Map();

  function getMidpoint(i1, i2) {
    const key = i1 < i2 ? `${i1},${i2}` : `${i2},${i1}`;
    if (midpointCache.has(key)) return midpointCache.get(key);

    const [x1, y1, z1] = vertices[i1];
    const [x2, y2, z2] = vertices[i2];

    let x = (x1 + x2) / 2;
    let y = (y1 + y2) / 2;
    let z = (z1 + z2) / 2;

    const len = Math.sqrt(x * x + y * y + z * z);
    x /= len; y /= len; z /= len;

    const index = vertices.length;
    vertices.push([x, y, z]);
    midpointCache.set(key, index);
    return index;
  }

  const newIndices = [];
  for (let i = 0; i < indices.length; i += 3) {
    const v1 = indices[i], v2 = indices[i + 1], v3 = indices[i + 2];
    const a = getMidpoint(v1, v2);
    const b = getMidpoint(v2, v3);
    const c = getMidpoint(v3, v1);

    newIndices.push(v1, a, c, v2, b, a, v3, c, b, a, b, c);
  }

  return { vertices, indices: newIndices };
}

function ang2pix(nside, theta, phi) {
  const z = Math.cos(theta);
  const npix = 12 * nside * nside;

  if (z >= 2.0 / 3.0) {
    const temp = nside * Math.sqrt(3 * (1 - z));
    const iring = Math.floor(temp);
    const iphi = Math.floor(phi / (2 * Math.PI) * 4 * iring);
    return Math.min(2 * iring * (iring - 1) + iphi, npix - 1);
  } else if (z <= -2.0 / 3.0) {
    const temp = nside * Math.sqrt(3 * (1 + z));
    const iring = Math.floor(temp);
    const iphi = Math.floor(phi / (2 * Math.PI) * 4 * iring);
    return Math.max(0, Math.min(npix - 2 * iring * (iring + 1) + iphi, npix - 1));
  } else {
    const temp = nside * (2 - 1.5 * z);
    const iring = Math.floor(temp);
    const iphi = Math.floor(phi / (2 * Math.PI) * 4 * nside);
    const ncap = 2 * nside * (nside - 1);
    return Math.max(0, Math.min(ncap + (iring - nside) * 4 * nside + iphi, npix - 1));
  }
}

function sampleHealpix(healpixData, nside, x, y, z) {
  const theta = Math.acos(Math.max(-1, Math.min(1, z)));
  const phi = Math.atan2(y, x);
  const phiPos = phi < 0 ? phi + 2 * Math.PI : phi;
  const ipix = ang2pix(nside, theta, phiPos);
  return healpixData[ipix] || 0;
}

function createMesh(healpixData, nside, subdivisions) {
  console.log(`Creating icosahedral mesh with ${subdivisions} subdivisions`);

  let { vertices, indices } = createIcosahedron();

  for (let i = 0; i < subdivisions; i++) {
    const result = subdivideMesh(vertices, indices);
    vertices = result.vertices;
    indices = result.indices;
    console.log(`  Subdivision ${i + 1}: ${vertices.length} vertices, ${indices.length / 3} triangles`);
  }

  const positions = new Float32Array(vertices.length * 3);
  const elevation = new Float32Array(vertices.length);

  for (let i = 0; i < vertices.length; i++) {
    const [x, y, z] = vertices[i];
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    elevation[i] = sampleHealpix(healpixData, nside, x, y, z);
  }

  return { positions, indices: new Uint32Array(indices), elevation };
}

function exportMesh(meshData) {
  const { positions, indices, elevation } = meshData;
  const useShort = positions.length / 3 < 65536;
  const indexSize = useShort ? 2 : 4;

  const size = 15 + positions.length * 4 + indices.length * indexSize + elevation.length * 4;
  const buffer = Buffer.alloc(size);
  let offset = 0;

  buffer.write('HPMESH', offset); offset += 6;
  buffer.writeUInt32LE(positions.length / 3, offset); offset += 4;
  buffer.writeUInt32LE(indices.length, offset); offset += 4;
  buffer.writeUInt8(indexSize, offset); offset += 1;

  for (let i = 0; i < positions.length; i++) {
    buffer.writeFloatLE(positions[i], offset); offset += 4;
  }

  if (useShort) {
    for (let i = 0; i < indices.length; i++) {
      buffer.writeUInt16LE(indices[i], offset); offset += 2;
    }
  } else {
    for (let i = 0; i < indices.length; i++) {
      buffer.writeUInt32LE(indices[i], offset); offset += 4;
    }
  }

  for (let i = 0; i < elevation.length; i++) {
    buffer.writeFloatLE(elevation[i], offset); offset += 4;
  }

  return buffer;
}

// Main
const subdivisions = parseInt(process.argv[2]) || 4;

console.log('Loading HEALPix data...');
const healpixPath = path.join(__dirname, 'public/earthtoposources/sur_healpix_nside128.bin');
const healpixBuffer = fs.readFileSync(healpixPath);
const healpixData = new Float32Array(healpixBuffer.buffer, healpixBuffer.byteOffset, healpixBuffer.length / 4);

const nside = Math.sqrt(healpixData.length / 12);
console.log(`Loaded ${healpixData.length.toLocaleString()} pixels (nside=${nside})`);
console.log(`Elevation range: ${Math.min(...healpixData).toFixed(1)} to ${Math.max(...healpixData).toFixed(1)} m\n`);

const meshData = createMesh(healpixData, nside, subdivisions);
console.log(`\nMesh created: ${meshData.positions.length / 3} vertices, ${meshData.indices.length / 3} triangles`);

const meshBuffer = exportMesh(meshData);
const outputPath = path.join(__dirname, `public/earthtoposources/sur_mesh_ico${subdivisions}.bin`);

fs.writeFileSync(outputPath, meshBuffer);

const sizeKB = (meshBuffer.length / 1024).toFixed(1);
console.log(`\nSaved to: ${outputPath}`);
console.log(`File size: ${sizeKB} KB`);
