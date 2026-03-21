import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Player } from './player';
import * as Cameras from './camera';
import { MouseState, KeyboardState } from './input';
import { NetworkManager } from './network';
import { PauseMenu } from './pauseMenu';
import { EnvironmentObject } from './environmentObject';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ConfigurableRenderer } from './renderer';
import { Level } from './level';


async function init() {
    // 1. Physics Engine Setup
    await RAPIER.init();
    const clock = new THREE.Clock();

    // 3. Environment
    const floorSize = 20;
    const floor = new EnvironmentObject(
        new THREE.BoxGeometry(floorSize * 2, 1, floorSize * 2),
        RAPIER.ColliderDesc.cuboid(floorSize, 0.5, floorSize),
        new THREE.Vector3(0, 0, 0),
        new THREE.MeshStandardMaterial({ color: 0xffffff })
    );
    floor.mesh.receiveShadow = true;

    // 4. Glass Objects / Platforms
    // const platforms: EnvironmentObject[] = [];

    // Low platform
    const platform1 = new EnvironmentObject(
        new THREE.BoxGeometry(4, 0.2, 4),
        RAPIER.ColliderDesc.cuboid(2, 0.1, 2),
        new THREE.Vector3(5, 1, 5)
    )

    const platform2 = new EnvironmentObject(
        new THREE.BoxGeometry(4, 0.2, 4),
        RAPIER.ColliderDesc.cuboid(2, 0.1, 2),
        new THREE.Vector3(0, 3, 8)
    )
    
    const platform3 = new EnvironmentObject(
        new THREE.BoxGeometry(4, 0.2, 4),
        RAPIER.ColliderDesc.cuboid(2, 0.1, 2),
        new THREE.Vector3(-4, 5, 4)
    )
    
    // A large glass wall to walk through/around

    const wall = new EnvironmentObject(
        new THREE.BoxGeometry(10, 8, 0.5),
        RAPIER.ColliderDesc.cuboid(5, 4, 0.25),
        new THREE.Vector3(0, 4, -10)
    );

    const level = new Level(
        new THREE.Color(0x87ceeb),
        [floor, platform1, platform2, platform3, wall]
    );

    // Add a snowman
    const loader = new GLTFLoader();
    loader.load('./snowman_amanda_losneck.glb', (gltf) => {
        const snowman = gltf.scene;
        snowman.position.set(20, 0.5, 15);
        snowman.rotation.set(0, Math.PI / 5, 0);
        snowman.castShadow = true;
        level.add(snowman);
    });
    

    // 4. Multiplayer & UI Setup
    let networking = false;
    let network = networking? new NetworkManager() : null;
    network?.setScene(level); // Let the network manager manage remote meshes

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


    const mouseLook = new MouseState();

    // 5. Local Player & Input
    const initialPlayerPosition = new THREE.Vector3(0, 50, 0);
    const playerVelocity = new THREE.Vector3();

    const player = new Player(1, initialPlayerPosition, playerVelocity, mouseLook);
    const { playerBody, playerCollider, playerController } = level.addPlayer(player);
    
    const mainCamera = Cameras.thirdPersonCamera(player);
    const miniMapCamera = Cameras.topDownCameraFollow(player);

    const mainRenderer = new ConfigurableRenderer(level, mainCamera.camera, true);
    const miniMapRenderer = new ConfigurableRenderer(level, miniMapCamera.camera, false, 200, 200);

    // Configure the mini-map renderer DOM element to be fixed in the top right corner
    Object.assign(miniMapRenderer.renderer.domElement.style, {
        position: 'fixed',
        top: '10px',
        right: '10px',
        width: '200px',
        height: '200px',
        zIndex: '1001',
        border: '2px solid #fff',
        background: 'rgba(0,0,0,0.2)',
        pointerEvents: 'none',
    });
    
    const keys = new KeyboardState(["KeyW", "KeyA", "KeyS", "KeyD", "Space"]);
    
    // 6. Game Loop
    let lastTime = performance.now();
    let frames = 0;
    
    const moveSpeed = 0.15;
    const jumpVelocity = 0.3;
    let verticalVelocity = 0;

    function animate() {
        requestAnimationFrame(animate);

        if (pauseMenu.getPaused()) return;

        // const delta = clock.getDelta();

        // Physics & Movement
        player.updateLookFromState(mouseLook.lookState);
        
        player.velocity.set(0, 0, 0);
        if (keys.state.KeyW) player.velocity.addScaledVector(player.forwardDirection, 1);
        if (keys.state.KeyS) player.velocity.addScaledVector(player.forwardDirection, -1);
        if (keys.state.KeyA) player.velocity.addScaledVector(player.rightDirection, -1);
        if (keys.state.KeyD) player.velocity.addScaledVector(player.rightDirection, 1);

        player.velocity.normalize().multiplyScalar(moveSpeed)

        const isGrounded = playerController.computedGrounded();
        verticalVelocity = isGrounded && verticalVelocity < 0 ? -0.01 : verticalVelocity - 0.015;
        if (isGrounded && keys.state['Space']) verticalVelocity = jumpVelocity;
        player.velocity.y = verticalVelocity;

        playerController.computeColliderMovement(playerCollider, player.velocity);
        const correctedVelocity = playerController.computedMovement();
        
        if (correctedVelocity.x === 0 && correctedVelocity.y === 0 && correctedVelocity.z === 0) {
            if (player.velocity.x !== 0 && player.velocity.y !== 0 && player.velocity.z !== 0)
                console.log("0 velocity: " + player.position.z, player.velocity.x);
        }

        player.velocity.copy(correctedVelocity)
        player.position.add(correctedVelocity);
        playerBody.setNextKinematicTranslation(player.position);


        level.stepPhysics();

        // Sync Visuals
        player.updateVisuals();

        // --- Network Updates ---
        // Send our local state to others
        network?.sendState(player.position, player.rotation.y);
        
        // Update all remote player visuals (handles scene adding/removing internally)
        network?.updateRemotePlayers();

        // Camera & Render
        mainCamera.update();
        miniMapCamera.update();
        miniMapRenderer.render();
        mainRenderer.render();

        // UI & FPS Counter
        const time = performance.now();
        frames++;
        if (time > lastTime + 1000) {
            uiContainer.innerHTML = `FPS: ${Math.round((frames * 1000) / (time - lastTime))}<br>ID: ${network?.getLocalId()}`;
            lastTime = time;
            frames = 0;
        }
    }

    animate();
}

init();