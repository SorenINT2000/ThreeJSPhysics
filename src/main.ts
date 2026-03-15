import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Player } from './player';
import { CameraManager, CameraFactory } from './camera';
import { MouseLook } from './camera';

async function init() {
    await RAPIER.init();
    const world = new RAPIER.World({ x: 0.0, y: -9.81, z: 0.0 });

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const sunLight = new THREE.DirectionalLight(0xffffff, 1);
    sunLight.position.set(10, 20, 10);
    sunLight.castShadow = true;
    scene.add(sunLight);

    // FPS Counter UI
    const fpsDisplay = document.createElement('div');
    Object.assign(fpsDisplay.style, {
        position: 'fixed',
        top: '10px',
        left: '10px',
        color: 'white',
        backgroundColor: 'rgba(0,0,0,0.5)',
        padding: '5px 10px',
        fontFamily: 'monospace',
        fontSize: '14px',
        borderRadius: '4px',
        pointerEvents: 'none',
        zIndex: '1000'
    });
    fpsDisplay.textContent = 'FPS: 0';
    document.body.appendChild(fpsDisplay);

    let lastTime = performance.now();
    let frames = 0;
    let fpsInterval = 0;

    // Floor
    world.createCollider(
        RAPIER.ColliderDesc.cuboid(20, 0.5, 20),
        world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0))
    );
    const floor = new THREE.Mesh(new THREE.BoxGeometry(40, 1, 40), new THREE.MeshStandardMaterial({ color: 0x40a040 }));
    floor.receiveShadow = true;
    scene.add(floor);

    // Player
    const player = new Player(1);
    const { playerBody, playerCollider, playerController } = player.attachToWorld(world);
    player.attachToScene(scene);

    // Look Direction Visualizer
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffff00 });
    const lineGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -3)
    ]);
    const lookLine = new THREE.Line(lineGeometry, lineMaterial);
    scene.add(lookLine);

    // --- DECOUPLED PROVIDERS ---

    const mouseLook = new MouseLook();
    const lookAngleProvider = mouseLook.getProvider();

    // Persistant vector for the provider to avoid GC pressure
    const playerPosResult = new THREE.Vector3();
    const playerPosProvider = () => {
        const t = playerBody.translation();
        return playerPosResult.set(t.x, t.y, t.z);
    };

    // Initialize Camera
    const orbitalConfig = CameraFactory.createOrbital(
        playerPosProvider,
        lookAngleProvider, 
        12,
        2,
        new THREE.Vector3(0, 1.5, 0)
    );

    const cameraManager = new CameraManager(window.innerWidth / window.innerHeight, orbitalConfig);

    // Input Handling
    const keys = { w: false, a: false, s: false, d: false, space: false };
    window.addEventListener('keydown', (e) => {
        if (e.code === 'KeyW') keys.w = true;
        if (e.code === 'KeyA') keys.a = true;
        if (e.code === 'KeyS') keys.s = true;
        if (e.code === 'KeyD') keys.d = true;
        if (e.code === 'Space') keys.space = true;
        if (e.code === 'Digit1') cameraManager.setConfig(orbitalConfig);
        if (e.code === 'Digit2') cameraManager.setConfig(CameraFactory.createTopDown(playerPosProvider, 20));
    });
    window.addEventListener('keyup', (e) => {
        if (e.code === 'KeyW') keys.w = false;
        if (e.code === 'KeyA') keys.a = false;
        if (e.code === 'KeyS') keys.s = false;
        if (e.code === 'KeyD') keys.d = false;
        if (e.code === 'Space') keys.space = false;
    });

    const moveSpeed = 0.15;
    const jumpVelocity = 0.3;
    let verticalVelocity = 0;

    // Pre-allocated vectors for math operations inside the loop
    const movement = new THREE.Vector3();
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();

    function animate() {
        requestAnimationFrame(animate);

        // Calculate FPS
        const time = performance.now();
        frames++;
        if (time > lastTime + 1000) {
            fpsDisplay.textContent = `FPS: ${Math.round((frames * 1000) / (time - lastTime))}`;
            lastTime = time;
            frames = 0;
        }

        const { theta, phi } = lookAngleProvider();
        
        // Update direction vectors without "new"
        forward.set(-Math.sin(theta), 0, -Math.cos(theta));
        right.set(-forward.z, 0, forward.x); // Perpendicular to forward

        // Reset and accumulate movement
        movement.set(0, 0, 0);
        if (keys.w) movement.addScaledVector(forward, moveSpeed);
        if (keys.s) movement.addScaledVector(forward, -moveSpeed);
        if (keys.a) movement.addScaledVector(right, -moveSpeed);
        if (keys.d) movement.addScaledVector(right, moveSpeed);

        // Gravity/Physics logic
        const isGrounded = playerController.computedGrounded();
        verticalVelocity = isGrounded && verticalVelocity < 0 ? -0.01 : verticalVelocity - 0.015;
        if (isGrounded && keys.space) verticalVelocity = jumpVelocity;
        movement.y = verticalVelocity;

        // Rapier physics interaction
        playerController.computeColliderMovement(playerCollider, movement);
        const corrected = playerController.computedMovement();
        const p = playerBody.translation();
        
        playerBody.setNextKinematicTranslation({ 
            x: p.x + corrected.x, 
            y: p.y + corrected.y, 
            z: p.z + corrected.z 
        });

        world.step();
        
        // Sync Visuals
        const t = playerBody.translation();
        player.playerMesh.position.set(t.x, t.y, t.z);
        
        // Update Look Line Visualizer
        lookLine.position.set(t.x, t.y, t.z);
        lookLine.rotation.set(0, 0, 0);
        lookLine.rotateY(theta);
        lookLine.rotateX(-phi);

        // Update player rotation based on movement direction
        if (Math.abs(movement.x) > 0.001 || Math.abs(movement.z) > 0.001) {
            player.playerMesh.rotation.y = Math.atan2(movement.x, movement.z);
        }

        cameraManager.update();
        renderer.render(scene, cameraManager.camera);
    }

    animate();
    window.addEventListener('resize', () => {
        cameraManager.onResize(window.innerWidth, window.innerHeight);
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

init();