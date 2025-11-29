import * as THREE from 'three';

console.log('Three.js IcosahedronGeometry vs Our Subdivision:\n');
console.log('Detail | Three.js Verts | Our Sub | Our Verts');
console.log('-------|----------------|---------|----------');

// Three.js detail levels
for (let detail = 0; detail <= 8; detail++) {
  const geo = new THREE.IcosahedronGeometry(1, detail);
  const threeVerts = geo.attributes.position.count;

  // Our subdivision formula: 12 base verts, each subdivision ~4x
  const ourVerts = detail === 0 ? 12 :
    [12, 42, 162, 642, 2562, 10242, 40962, 163842, 655362][detail];

  const marker = threeVerts === ourVerts ? ' ← MATCH' : '';
  console.log(`  ${detail}    |     ${threeVerts.toLocaleString().padStart(6)}     |    ${detail}    |  ${ourVerts.toLocaleString().padStart(7)}${marker}`);
}
