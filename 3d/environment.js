/**
 * 3D scene environment — lights and dark background for specimen viewer.
 */

import * as THREE from 'three';

export function createEnvironment(scene) {
  scene.background = new THREE.Color(0x0a0e14);

  // Hemisphere light (sky + ground fill)
  const hemi = new THREE.HemisphereLight(0x6688aa, 0x334422, 1.0);
  scene.add(hemi);

  // Ambient fill
  const ambient = new THREE.AmbientLight(0x606080, 0.6);
  scene.add(ambient);

  // Directional sun with shadows
  const sun = new THREE.DirectionalLight(0xffeedd, 2.5);
  sun.position.set(10, 20, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 60;
  sun.shadow.camera.left = -10;
  sun.shadow.camera.right = 10;
  sun.shadow.camera.top = 10;
  sun.shadow.camera.bottom = -10;
  sun.shadow.bias = -0.001;
  scene.add(sun);

  return { sun, ambient, hemi };
}
