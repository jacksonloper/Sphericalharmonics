/**
 * Test Three.js IcosahedronGeometry vertex ordering stability
 */

import * as THREE from 'three';

// Test if Three.js generates vertices in consistent order
function testVertexOrdering() {
  const detail = 5;

  // Generate geometry multiple times
  const geo1 = new THREE.IcosahedronGeometry(1, detail);
  const geo2 = new THREE.IcosahedronGeometry(1, detail);

  const pos1 = geo1.attributes.position.array;
  const pos2 = geo2.attributes.position.array;

  console.log(`IcosahedronGeometry(1, ${detail}):`);
  console.log(`  Vertices: ${pos1.length / 3}`);
  console.log(`  Triangles: ${pos1.length / 9}`); // Non-indexed, 3 verts per tri

  // Check if ordering is identical
  let identical = true;
  for (let i = 0; i < pos1.length; i++) {
    if (Math.abs(pos1[i] - pos2[i]) > 0.0001) {
      identical = false;
      break;
    }
  }

  console.log(`  Ordering stable: ${identical ? 'YES ✓' : 'NO ✗'}`);

  // Show first few vertices
  console.log('\n  First 3 vertices:');
  for (let i = 0; i < 9; i += 3) {
    console.log(`    [${pos1[i].toFixed(6)}, ${pos1[i+1].toFixed(6)}, ${pos1[i+2].toFixed(6)}]`);
  }

  return identical;
}

testVertexOrdering();
