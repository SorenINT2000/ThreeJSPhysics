import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

import { Player } from './player';

// 1. Initialize Rapier
await RAPIER.init();

const g = -9.81
const gravity = { x: 0.0, y: g, z: 0.0 };
const world = new RAPIER.World(gravity);

// 2. Scene Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb); // Sky blue

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 10, 15);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 1);
sunLight.position.set(10, 20, 10);
sunLight.castShadow = true;
sunLight.shadow.camera.left = -20;
sunLight.shadow.camera.right = 20;
sunLight.shadow.camera.top = 20;
sunLight.shadow.camera.bottom = -20;
scene.add(sunLight);

// 3. Environment: Floor
const floorSize = 40;
const floorMesh = new THREE.Mesh(
  new THREE.BoxGeometry(floorSize, 1, floorSize),
  new THREE.MeshStandardMaterial({ color: 0x40a040 })
);
floorMesh.receiveShadow = true;
scene.add(floorMesh);

const floorBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0, 0));
const floorCollider = RAPIER.ColliderDesc.cuboid(floorSize / 2, 0.5, floorSize / 2);
world.createCollider(floorCollider, floorBody);


// 4. Player
const player = new Player(1);
const { playerBody, playerCollider, playerController } = player.attachToWorld(world);
player.attachToScene(scene);


// 6. Input Handling
const keys = {
  w: false,
  a: false,
  s: false,
  d: false,
  space: false
};

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyW') keys.w = true;
  if (e.code === 'KeyA') keys.a = true;
  if (e.code === 'KeyS') keys.s = true;
  if (e.code === 'KeyD') keys.d = true;
  if (e.code === 'Space') keys.space = true;
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'KeyW') keys.w = false;
  if (e.code === 'KeyA') keys.a = false;
  if (e.code === 'KeyS') keys.s = false;
  if (e.code === 'KeyD') keys.d = false;
  if (e.code === 'Space') keys.space = false;
});

// Movement Constants
const moveSpeed = 0.15;
let verticalVelocity = 0;
const jumpVelocity = 0.3;
const gravityTick = -0.015;

// 7. Animation Loop
function animate() {
  requestAnimationFrame(animate);

  // A. Calculate Desired Movement
  const movement = new THREE.Vector3(0, 0, 0);
  if (keys.w) movement.z -= moveSpeed;
  if (keys.s) movement.z += moveSpeed;
  if (keys.a) movement.x -= moveSpeed;
  if (keys.d) movement.x += moveSpeed;

  // B. Handle Manual Gravity/Jumping (Required for Kinematic)
  const isGrounded = playerController.computedGrounded();
  
  if (isGrounded && verticalVelocity < 0) {
      verticalVelocity = -0.01; // Small constant force down
  } else {
      verticalVelocity += gravityTick;
  }

  if (isGrounded && keys.space) {
      verticalVelocity = jumpVelocity;
  }
  
  movement.y = verticalVelocity;

  // C. Compute collisions & apply movement
  playerController.computeColliderMovement(playerCollider, movement);
  const correctedMovement = playerController.computedMovement();

  const currentPos = playerBody.translation();
  playerBody.setNextKinematicTranslation({
      x: currentPos.x + correctedMovement.x,
      y: currentPos.y + correctedMovement.y,
      z: currentPos.z + correctedMovement.z
  });

  // D. Step Physics & Sync Visuals
  world.step();
  const t = playerBody.translation();
  player.playerMesh.position.set(t.x, t.y, t.z);

  // Smooth Camera Follow
  const targetCamPos = new THREE.Vector3(t.x, t.y + 10, t.z + 15);
  camera.position.lerp(targetCamPos, 0.1);
  camera.lookAt(t.x, t.y, t.z);

  renderer.render(scene, camera);
}

animate();

// Resize handler
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});