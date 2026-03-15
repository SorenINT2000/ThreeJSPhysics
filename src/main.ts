import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Player } from './player';
import { CameraManager, CameraFactory } from './camera';
import { MouseLook } from './input';
import { NetworkManager } from './network';

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

    // Multi-user UI with enhanced logging
    const uiContainer = document.createElement('div');
    Object.assign(uiContainer.style, {
        position: 'fixed', top: '10px', left: '10px',
        color: 'white', backgroundColor: 'rgba(0,0,0,0.7)',
        padding: '10px', fontFamily: 'monospace', fontSize: '12px',
        borderRadius: '4px', pointerEvents: 'none', zIndex: '1000',
        lineHeight: '1.4'
    });
    document.body.appendChild(uiContainer);

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

    const lookLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -3)]),
        new THREE.LineBasicMaterial({ color: 0xffff00 })
    );
    scene.add(lookLine);

    // --- NETWORK SETUP ---
    const network = new NetworkManager();
    const remoteVisuals = new Map<string, THREE.Mesh>();
    const remoteMaterial = new THREE.MeshStandardMaterial({ color: 0x4444ff });

    // --- DECOUPLED PROVIDERS ---
    const mouseLook = new MouseLook();
    const lookAngleProvider = mouseLook.getProvider();
    const playerPosResult = new THREE.Vector3();
    const playerPosProvider = () => {
        const t = playerBody.translation();
        return playerPosResult.set(t.x, t.y, t.z);
    };

    const orbitalConfig = CameraFactory.createOrbital(playerPosProvider, lookAngleProvider, 12, 2, new THREE.Vector3(0, 1.5, 0));
    const overheadConfig = CameraFactory.createTopDown(playerPosProvider, 10);
    const cameraManager = new CameraManager(window.innerWidth / window.innerHeight, overheadConfig);

    // Movement Constants
    const moveSpeed = 0.15;
    const jumpVelocity = 0.3;
    let verticalVelocity = 0;
    const keys = { w: false, a: false, s: false, d: false, space: false };

    // Math scrap vectors
    const movement = new THREE.Vector3();
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();

    // Listeners
    window.addEventListener('keydown', (e) => {
        if (e.code === 'KeyW') keys.w = true;
        if (e.code === 'KeyA') keys.a = true;
        if (e.code === 'KeyS') keys.s = true;
        if (e.code === 'KeyD') keys.d = true;
        if (e.code === 'Space') keys.space = true;
        if (e.code === 'Digit1') cameraManager.setConfig(orbitalConfig);
        if (e.code === 'Digit2') cameraManager.setConfig(overheadConfig);
    });
    window.addEventListener('keyup', (e) => {
        if (e.code === 'KeyW') keys.w = false;
        if (e.code === 'KeyA') keys.a = false;
        if (e.code === 'KeyS') keys.s = false;
        if (e.code === 'KeyD') keys.d = false;
        if (e.code === 'Space') keys.space = false;
    });

    let lastTime = performance.now();
    let frames = 0;

    function animate() {
        requestAnimationFrame(animate);

        const time = performance.now();
        frames++;
        if (time > lastTime + 1000) {
            const roomCode = new URLSearchParams(window.location.search).get('r') || 'None';
            uiContainer.innerHTML = [
                `FPS: ${Math.round((frames * 1000) / (time - lastTime))}`,
                `Room: ${roomCode}`,
                `Local ID: ${network.getLocalId() || 'Connecting...'}`,
                `Remote Players: ${remoteVisuals.size}`,
                `Ready: ${network.getIsReady()}`
            ].join('<br>');
            lastTime = time;
            frames = 0;
        }

        const { theta, phi } = lookAngleProvider();
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
        
        const t = playerBody.translation();
        player.playerMesh.position.set(t.x, t.y, t.z);
        
        lookLine.position.set(t.x, t.y, t.z);
        lookLine.rotation.set(0, 0, 0);
        lookLine.rotateY(theta);
        lookLine.rotateX(-phi);

        if (Math.abs(movement.x) > 0.001 || Math.abs(movement.z) > 0.001) {
            player.playerMesh.rotation.y = Math.atan2(movement.x, movement.z);
        }

        // --- Network Update ---
        network.sendState(player.playerMesh.position, player.playerMesh.rotation.y);

        // Render Remote Players
        const remoteStates = network.getRemotePlayers();
        
        // Cleanup visuals for players who left
        remoteVisuals.forEach((mesh, id) => {
            if (!remoteStates.has(id)) {
                scene.remove(mesh);
                remoteVisuals.delete(id);
                console.log(`[UI] Removed visual for ${id}`);
            }
        });

        // Update or create visuals
        remoteStates.forEach((data, id) => {
            let mesh = remoteVisuals.get(id);
            if (!mesh) {
                mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), remoteMaterial);
                scene.add(mesh);
                remoteVisuals.set(id, mesh);
                console.log(`[UI] Created visual for ${id}`);
            }
            mesh.position.set(data.position.x, data.position.y, data.position.z);
            mesh.rotation.y = data.rotation;
        });

        cameraManager.update();
        renderer.render(scene, cameraManager.camera);
    }

    animate();
}

init();