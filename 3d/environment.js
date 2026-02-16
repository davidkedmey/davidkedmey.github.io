/**
 * 3D scene environment — ground, sun, sky, shadows.
 */

import * as THREE from 'three';

export function createEnvironment(scene) {
  // Sky background — dark to match theme (updated dynamically by day/night cycle)
  scene.background = new THREE.Color(0x0a0e14);
  scene.fog = new THREE.FogExp2(0x0a0e14, 0.003);

  // Hemisphere light (sky + ground fill)
  const hemi = new THREE.HemisphereLight(0x6688aa, 0x334422, 0.8);
  scene.add(hemi);

  // Ambient fill
  const ambient = new THREE.AmbientLight(0x606080, 0.5);
  scene.add(ambient);

  // Directional sun with shadows
  const sun = new THREE.DirectionalLight(0xffeedd, 2.0);
  sun.position.set(15, 30, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 200;
  sun.shadow.camera.left = -60;
  sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 60;
  sun.shadow.camera.bottom = -60;
  sun.shadow.bias = -0.001;
  scene.add(sun);
  scene.add(sun.target);

  // Ground plane — extended for path
  const groundGeo = new THREE.PlaneGeometry(200, 400);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a12,
    roughness: 0.95,
    metalness: 0.0,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Path strip — slightly lighter ground down the center
  const pathGeo = new THREE.PlaneGeometry(6, 380);
  const pathMat = new THREE.MeshStandardMaterial({
    color: 0x252518,
    roughness: 0.9,
    metalness: 0.0,
  });
  const path = new THREE.Mesh(pathGeo, pathMat);
  path.rotation.x = -Math.PI / 2;
  path.position.y = 0.01;
  path.receiveShadow = true;
  scene.add(path);

  return { ground, sun, ambient, hemi };
}
