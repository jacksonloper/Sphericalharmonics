/**
 * Convert HEALPix data to icosahedral mesh
 * Uses icosahedron subdivision for uniform spherical triangulation
 */

/**
 * Create icosahedron base mesh
 */
function createIcosahedron() {
  const t = (1 + Math.sqrt(5)) / 2; // Golden ratio

  const positions = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]
  ];

  // Normalize to unit sphere
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

/**
 * Subdivide mesh by adding midpoint of each edge
 */
function subdivideMesh(vertices, indices) {
  const midpointCache = new Map();

  function getMidpoint(i1, i2) {
    const key = i1 < i2 ? `${i1},${i2}` : `${i2},${i1}`;

    if (midpointCache.has(key)) {
      return midpointCache.get(key);
    }

    const [x1, y1, z1] = vertices[i1];
    const [x2, y2, z2] = vertices[i2];

    // Midpoint
    let x = (x1 + x2) / 2;
    let y = (y1 + y2) / 2;
    let z = (z1 + z2) / 2;

    // Project to unit sphere
    const len = Math.sqrt(x * x + y * y + z * z);
    x /= len;
    y /= len;
    z /= len;

    const index = vertices.length;
    vertices.push([x, y, z]);
    midpointCache.set(key, index);

    return index;
  }

  const newIndices = [];

  for (let i = 0; i < indices.length; i += 3) {
    const v1 = indices[i];
    const v2 = indices[i + 1];
    const v3 = indices[i + 2];

    const a = getMidpoint(v1, v2);
    const b = getMidpoint(v2, v3);
    const c = getMidpoint(v3, v1);

    newIndices.push(v1, a, c);
    newIndices.push(v2, b, a);
    newIndices.push(v3, c, b);
    newIndices.push(a, b, c);
  }

  return { vertices, indices: newIndices };
}

/**
 * Sample HEALPix data at a given direction (x, y, z)
 */
function sampleHealpixAtDirection(healpixData, nside, x, y, z) {
  const theta = Math.acos(Math.max(-1, Math.min(1, z)));
  const phi = Math.atan2(y, x);
  const phiPos = phi < 0 ? phi + 2 * Math.PI : phi;

  const ipix = ang2pix(nside, theta, phiPos);

  if (ipix >= 0 && ipix < healpixData.length) {
    return healpixData[ipix];
  }

  return 0;
}

/**
 * Convert angle (theta, phi) to HEALPix pixel index (RING ordering)
 */
function ang2pix(nside, theta, phi) {
  const z = Math.cos(theta);
  const npix = 12 * nside * nside;

  // North polar cap
  if (z >= 2.0 / 3.0) {
    const temp = nside * Math.sqrt(3 * (1 - z));
    const iring = Math.floor(temp);
    const iphi = Math.floor(phi / (2 * Math.PI) * 4 * iring);
    const ipix = 2 * iring * (iring - 1) + iphi;
    return Math.min(ipix, npix - 1);
  }
  // South polar cap
  else if (z <= -2.0 / 3.0) {
    const temp = nside * Math.sqrt(3 * (1 + z));
    const iring = Math.floor(temp);
    const iphi = Math.floor(phi / (2 * Math.PI) * 4 * iring);
    const ipix = npix - 2 * iring * (iring + 1) + iphi;
    return Math.max(0, Math.min(ipix, npix - 1));
  }
  // Equatorial belt
  else {
    const temp = nside * (2 - 1.5 * z);
    const iring = Math.floor(temp);
    const iphi = Math.floor(phi / (2 * Math.PI) * 4 * nside);
    const ncap = 2 * nside * (nside - 1);
    const ipix = ncap + (iring - nside) * 4 * nside + iphi;
    return Math.max(0, Math.min(ipix, npix - 1));
  }
}

/**
 * Create mesh from HEALPix data using icosahedral subdivision
 * @param {Float32Array} healpixData - HEALPix elevation data
 * @param {number} nside - HEALPix nside parameter
 * @param {number} subdivisions - Number of subdivision levels (0-5)
 * @returns {Object} Mesh data with positions, indices, and elevation
 */
export function createMeshFromHealpix(healpixData, nside, subdivisions = 4) {
  console.log(`Creating icosahedral mesh with ${subdivisions} subdivisions`);

  // Start with icosahedron
  let { vertices, indices } = createIcosahedron();

  // Subdivide
  for (let i = 0; i < subdivisions; i++) {
    const result = subdivideMesh(vertices, indices);
    vertices = result.vertices;
    indices = result.indices;
    console.log(`  Subdivision ${i + 1}: ${vertices.length} vertices, ${indices.length / 3} triangles`);
  }

  // Flatten positions and sample elevation
  const positions = new Float32Array(vertices.length * 3);
  const elevation = new Float32Array(vertices.length);

  for (let i = 0; i < vertices.length; i++) {
    const [x, y, z] = vertices[i];
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    elevation[i] = sampleHealpixAtDirection(healpixData, nside, x, y, z);
  }

  const indicesArray = new Uint32Array(indices);

  return {
    positions,
    indices: indicesArray,
    elevation,
    numVertices: vertices.length,
    numTriangles: indices.length / 3
  };
}

/**
 * Export mesh to binary format
 */
export function exportMeshBinary(meshData) {
  const { positions, indices, elevation } = meshData;

  const headerSize = 15;
  const positionsSize = positions.length * 4;
  const useShortIndices = positions.length / 3 < 65536;
  const indicesSize = indices.length * (useShortIndices ? 2 : 4);
  const elevationSize = elevation.length * 4;

  const totalSize = headerSize + positionsSize + indicesSize + elevationSize;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  let offset = 0;

  // Header
  const headerBytes = new TextEncoder().encode('HPMESH');
  for (let i = 0; i < 6; i++) {
    view.setUint8(offset++, headerBytes[i]);
  }

  // Metadata
  view.setUint32(offset, positions.length / 3, true);
  offset += 4;

  view.setUint32(offset, indices.length, true);
  offset += 4;

  const indexType = useShortIndices ? 2 : 4;
  view.setUint8(offset, indexType);
  offset += 1;

  // Positions
  for (let i = 0; i < positions.length; i++) {
    view.setFloat32(offset, positions[i], true);
    offset += 4;
  }

  // Indices
  if (useShortIndices) {
    for (let i = 0; i < indices.length; i++) {
      view.setUint16(offset, indices[i], true);
      offset += 2;
    }
  } else {
    for (let i = 0; i < indices.length; i++) {
      view.setUint32(offset, indices[i], true);
      offset += 4;
    }
  }

  // Elevation
  for (let i = 0; i < elevation.length; i++) {
    view.setFloat32(offset, elevation[i], true);
    offset += 4;
  }

  return buffer;
}
