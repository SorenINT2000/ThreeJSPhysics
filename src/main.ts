import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Player } from './player';
import { CameraManager, CameraFactory } from './camera';
import { MouseLook } from './input';
import { NetworkManager } from './network';
import { PauseMenu } from './pauseMenu';
import { EnvironmentObject } from './environmentObject';

async function init() {
    // 1. Physics Engine Setup
    await RAPIER.init();
    const world = new RAPIER.World({ x: 0.0, y: -9.81, z: 0.0 });

    // 2. Three.js Scene Setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const sunLight = new THREE.DirectionalLight(0xffffff, 1);
    sunLight.position.set(10, 20, 10);
    sunLight.castShadow = true;
    scene.add(sunLight);

    // 3. Environment
    const floorSize = 20;
    world.createCollider(
        RAPIER.ColliderDesc.cuboid(floorSize, 0.5, floorSize),
        world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0))
    );
    const floor = new THREE.Mesh(
        new THREE.BoxGeometry(floorSize * 2, 1, floorSize * 2), 
        new THREE.MeshStandardMaterial({ color: 0x40a040 })
    );
    floor.receiveShadow = true;
    scene.add(floor);

    // 4. Glass Objects / Platforms
    const platforms: EnvironmentObject[] = [];

    // Low platform
    platforms.push(new EnvironmentObject(world, scene, new THREE.Vector3(5, 1, 5), new THREE.Vector3(4, 0.2, 4)));
    
    // Higher stairs
    platforms.push(new EnvironmentObject(world, scene, new THREE.Vector3(0, 3, 8), new THREE.Vector3(3, 0.2, 3), 0xff88cc));
    platforms.push(new EnvironmentObject(world, scene, new THREE.Vector3(-4, 5, 4), new THREE.Vector3(3, 0.2, 3), 0x88ffcc));
    
    // A large glass wall to walk through/around
    platforms.push(new EnvironmentObject(world, scene, new THREE.Vector3(0, 4, -10), new THREE.Vector3(10, 8, 0.5), 0xffffff));
    

    // 4. Multiplayer & UI Setup
    const network = new NetworkManager();
    network.setScene(scene); // Let the network manager manage remote meshes

    const pauseMenu = new PauseMenu((paused) => {
        // Handle pointer lock logic or pause physics if needed
    });

    const uiContainer = document.createElement('div');
    Object.assign(uiContainer.style, {
        position: 'fixed', top: '10px', left: '10px',
        color: 'white', backgroundColor: 'rgba(0,0,0,0.5)',
        padding: '5px 10px', fontFamily: 'monospace', fontSize: '14px',
        borderRadius: '4px', pointerEvents: 'none', zIndex: '1000'
    });
    document.body.appendChild(uiContainer);

    // 5. Local Player & Input
    const player = new Player(1);
    const { playerBody, playerCollider, playerController } = player.attachToWorld(world);
    player.attachToScene(scene);

    const mouseLook = new MouseLook();
    const lookAngleProvider = mouseLook.getProvider();
    
    const playerPosResult = new THREE.Vector3();
    const playerPosProvider = () => {
        const t = playerBody.translation();
        return playerPosResult.set(t.x, t.y, t.z);
    };

    // Camera Configuration
    const orbitalConfig = CameraFactory.createOrbital(playerPosProvider, lookAngleProvider, 10, 2, new THREE.Vector3(0, 1, 0));
    const cameraManager = new CameraManager(window.innerWidth / window.innerHeight, orbitalConfig);

    // Controls
    const keys = { w: false, a: false, s: false, d: false, space: false };
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

    // 6. Game Loop
    let lastTime = performance.now();
    let frames = 0;
    
    const moveSpeed = 0.15;
    const jumpVelocity = 0.3;
    let verticalVelocity = 0;
    
    const movement = new THREE.Vector3();
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();

    function animate() {
        requestAnimationFrame(animate);

        // UI & FPS Counter
        const time = performance.now();
        frames++;
        if (time > lastTime + 1000) {
            uiContainer.innerHTML = `FPS: ${Math.round((frames * 1000) / (time - lastTime))}<br>ID: ${network.getLocalId()}`;
            lastTime = time;
            frames = 0;
        }

        if (pauseMenu.getPaused()) return;

        // Physics & Movement
        const { theta } = lookAngleProvider();
        forward.set(-Math.sin(theta), 0, -Math.cos(theta));
        right.set(-forward.z, 0, forward.x);

        movement.set(0, 0, 0);
        if (keys.w) movement.addScaledVector(forward, moveSpeed);
        if (keys.s) movement.addScaledVector(forward, -moveSpeed);
        if (keys.a) movement.addScaledVector(right, -moveSpeed);
        if (keys.d) movement.addScaledVector(right, moveSpeed);

        const isGrounded = playerController.computedGrounded();
        verticalVelocity = isGrounded && verticalVelocity < 0 ? -0.01 : verticalVelocity - 0.015;
        if (isGrounded && keys.space) verticalVelocity = jumpVelocity;
        movement.y = verticalVelocity;

        playerController.computeColliderMovement(playerCollider, movement);
        const corrected = playerController.computedMovement();
        const p = playerBody.translation();
        
        playerBody.setNextKinematicTranslation({ 
            x: p.x + corrected.x, 
            y: p.y + corrected.y, 
            z: p.z + corrected.z 
        });

        world.step();
        
        // Sync local visual
        const t = playerBody.translation();
        player.playerMesh.position.set(t.x, t.y, t.z);
        if (Math.abs(movement.x) > 0.001 || Math.abs(movement.z) > 0.001) {
            player.playerMesh.rotation.y = Math.atan2(movement.x, movement.z);
        }

        // --- Network Updates ---
        // Send our local state to others
        network.sendState(player.playerMesh.position, player.playerMesh.rotation.y);
        
        // Update all remote player visuals (handles scene adding/removing internally)
        network.updateRemotePlayers();

        // Camera & Render
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