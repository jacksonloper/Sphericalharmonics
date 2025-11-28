/**
 * Convert HEALPix data to a proper quad/triangle mesh
 * Uses HEALPix's native quad structure for correct topology
 */

/**
 * Convert HEALPix pixel index to Cartesian coordinates (RING ordering)
 */
function pix2vec(nside, ipix) {
  const npix = 12 * nside * nside;
  const ncap = 2 * nside * (nside - 1);

  let z, phi;

  // North polar cap
  if (ipix < ncap) {
    const iring = Math.floor((Math.sqrt(1 + 2 * ipix) + 1) / 2);
    const iphi = ipix - 2 * iring * (iring - 1);

    z = 1 - (iring * iring) / (3 * nside * nside);
    phi = (iphi + 0.5) * Math.PI / (2 * iring);
  }
  // Equatorial belt
  else if (ipix < npix - ncap) {
    const ip = ipix - ncap;
    const iring = Math.floor(ip / (4 * nside)) + nside;
    const iphi = ip % (4 * nside);

    const fodd = ((iring + nside) & 1) ? 1 : 0.5;
    z = (2 * nside - iring) * 2 / (3 * nside);
    phi = (iphi + fodd) * Math.PI / (2 * nside);
  }
  // South polar cap
  else {
    const ip = npix - ipix;
    const iring = Math.floor((Math.sqrt(2 * ip - 1) + 1) / 2);
    const iphi = 2 * iring * (iring + 1) - ip;

    z = -1 + (iring * iring) / (3 * nside * nside);
    phi = (iphi + 0.5) * Math.PI / (2 * iring);
  }

  // Convert to Cartesian
  const stheta = Math.sqrt((1 - z) * (1 + z));
  const x = stheta * Math.cos(phi);
  const y = stheta * Math.sin(phi);

  return [x, y, z];
}

/**
 * Get the 4 corner pixels of a HEALPix base pixel quad
 * HEALPix nside=128 has 12*128*128 pixels organized as quads
 */
function getQuadIndices(nside, basePixel, subI, subJ) {
  // For simplicity, create mesh by treating each pixel as a point
  // and connecting to neighbors in a regular grid pattern
  const npix = 12 * nside * nside;

  // Simple approach: connect pixels in a regular latitude-longitude-like grid
  // This is approximate but avoids the complex HEALPix neighbor logic
  return null; // Will use different strategy
}

/**
 * Create a triangulated sphere mesh from HEALPix data
 * Uses icosphere-based approach with HEALPix data mapped to vertices
 */
export function createMeshFromHealpix(healpixData, nside, subdivisions = 32) {
  console.log(`Creating mesh from HEALPix nside=${nside} with ${healpixData.length} pixels`);

  // Strategy: Create a regular icosphere and interpolate HEALPix data onto it
  // This gives us a proper quad/triangle mesh without HEALPix topology issues

  const positions = [];
  const indices = [];
  const elevation = [];

  // Create latitude-longitude grid (simpler and more reliable)
  const latDivs = subdivisions;
  const lonDivs = subdivisions * 2;

  // Generate vertices
  for (let lat = 0; lat <= latDivs; lat++) {
    const theta = (lat / latDivs) * Math.PI; // 0 to PI
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);

    for (let lon = 0; lon <= lonDivs; lon++) {
      const phi = (lon / lonDivs) * 2 * Math.PI; // 0 to 2PI

      // Cartesian coordinates on unit sphere
      const x = sinTheta * Math.cos(phi);
      const y = sinTheta * Math.sin(phi);
      const z = cosTheta;

      positions.push(x, y, z);

      // Find nearest HEALPix pixel and get its elevation
      const elev = sampleHealpixAtDirection(healpixData, nside, x, y, z);
      elevation.push(elev);
    }
  }

  // Generate indices (quads -> 2 triangles each)
  for (let lat = 0; lat < latDivs; lat++) {
    for (let lon = 0; lon < lonDivs; lon++) {
      const i0 = lat * (lonDivs + 1) + lon;
      const i1 = i0 + 1;
      const i2 = (lat + 1) * (lonDivs + 1) + lon;
      const i3 = i2 + 1;

      // First triangle
      indices.push(i0, i2, i1);
      // Second triangle
      indices.push(i1, i2, i3);
    }
  }

  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
    elevation: new Float32Array(elevation),
    numVertices: positions.length / 3,
    numTriangles: indices.length / 3
  };
}

/**
 * Sample HEALPix data at a given direction (x, y, z)
 * Finds nearest HEALPix pixel
 */
function sampleHealpixAtDirection(healpixData, nside, x, y, z) {
  // Convert direction to HEALPix pixel index
  const theta = Math.acos(Math.max(-1, Math.min(1, z)));
  const phi = Math.atan2(y, x);
  const phiPos = phi < 0 ? phi + 2 * Math.PI : phi;

  // Approximate pixel index (inverse of pix2vec)
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
 * Export mesh to binary format
 */
export function exportMeshBinary(meshData) {
  const { positions, indices, elevation } = meshData;

  // Calculate sizes
  const headerSize = 15; // 6 + 4 + 4 + 1
  const positionsSize = positions.length * 4;
  const indicesSize = indices.length * (indices.length < 65536 ? 2 : 4);
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

  const indexType = indices.length < 65536 ? 2 : 4;
  view.setUint8(offset, indexType);
  offset += 1;

  // Positions
  for (let i = 0; i < positions.length; i++) {
    view.setFloat32(offset, positions[i], true);
    offset += 4;
  }

  // Indices
  if (indexType === 2) {
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
