import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Player } from './player';
import { ConfigurableCamera } from './camera';
import { LookState } from './input';
import { NetworkManager } from './network';
import { PauseMenu } from './pauseMenu';
import { EnvironmentObject } from './environmentObject';
import { LightSource } from './lighting';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ConfigurableRenderer } from './renderer';

async function init() {
    // 1. Physics Engine Setup
    await RAPIER.init();
    const world = new RAPIER.World({ x: 0.0, y: -9.81, z: 0.0 });

    // 2. Three.js Scene Setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const lightSource = new LightSource(0xffffff, 1);
    scene.add(lightSource)
    lightSource.setPos(0, 5, 0);

    // 3. Environment
    const floorSize = 20;
    world.createCollider(
        RAPIER.ColliderDesc.cuboid(floorSize, 0.5, floorSize),
        world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0))
    );
    const floor = new THREE.Mesh(
        new THREE.BoxGeometry(floorSize * 2, 1, floorSize * 2), 
        new THREE.MeshStandardMaterial({ color: 0xffffff })
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

    // Add a snowman
    const loader = new GLTFLoader();
    loader.load('./snowman_amanda_losneck.glb', (gltf) => {
        const snowman = gltf.scene;
        snowman.position.set(20, 0.5, 15);
        snowman.rotation.set(0, Math.PI / 5, 0);
        snowman.castShadow = true;
        scene.add(snowman);
    });
    

    // 4. Multiplayer & UI Setup
    let networking = false;
    let network = networking? new NetworkManager() : null;
    network?.setScene(scene); // Let the network manager manage remote meshes

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



    const mouseLook = new LookState();
    let isPointerLocked = false;
    window.addEventListener('mousedown', () => {
        if (!isPointerLocked) document.body.requestPointerLock();
    });

    document.addEventListener('pointerlockchange', () => {
        isPointerLocked = document.pointerLockElement === document.body;
    });

    window.addEventListener('mousemove', (e) => {
        if (!isPointerLocked) return;

        const sensitivity = 0.002;
        
        mouseLook.state.theta -= e.movementX * sensitivity; // Yaw
        mouseLook.state.phi += e.movementY * sensitivity; // Pitch

        mouseLook.state.phi = Math.max(0.1, Math.min(Math.PI - 0.1, mouseLook.state.phi));
    });

    // 5. Local Player & Input
    const initialPlayerPosition = new THREE.Vector3(0, 5, 0);
    const playerVelocity = new THREE.Vector3();

    const player = new Player(1, initialPlayerPosition, playerVelocity, mouseLook);
    const { playerBody, playerCollider, playerController } = player.attachToWorld(world);
    player.attachToScene(scene);

    const topDownCamera = new ConfigurableCamera(
        new THREE.OrthographicCamera(-10, 10, 10, -10, 1, 1000),
        new THREE.Vector3(0, 20, 0),
        new THREE.Vector3(0, 0, 0)
    );


    const topDownCameraFollow = new ConfigurableCamera(
        new THREE.OrthographicCamera(-10, 10, 10, -10, 1, 1000),
        new THREE.Vector3(0, 20, 0).add(player.position),
        new THREE.Vector3(0, 0, 0),
        (prev) => { prev.setX(player.position.x); prev.setZ(player.position.z); return prev; },
        (prev) => { prev.setX(player.position.x); prev.setZ(player.position.z); return prev; }
    )

    const firstPersonCamera = new ConfigurableCamera(
        new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000),
        player.position,
        player.lookDirection,
    );
    
    const thirdPersonCamera = new ConfigurableCamera(
        new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000),
        player.position.clone().addScaledVector(player.worldToLocal(player.lookDirection), -10),
        player.position,
        (prev) => prev.copy(player.position).addScaledVector(player.worldToLocal(player.lookDirection), -10),
    );
    
    const mainCamera = thirdPersonCamera;
    const miniMapCamera = topDownCameraFollow;

    const mainRenderer = new ConfigurableRenderer(scene, mainCamera.camera);
    const miniMapRenderer = new ConfigurableRenderer(scene, miniMapCamera.camera);
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



    // Controls
    const keys = { w: false, a: false, s: false, d: false, space: false };
    window.addEventListener('keydown', (e) => {
        if (e.code === 'KeyW') keys.w = true;
        if (e.code === 'KeyA') keys.a = true;
        if (e.code === 'KeyS') keys.s = true;
        if (e.code === 'KeyD') keys.d = true;
        if (e.code === 'Space') keys.space = true;

        // if (e.code === 'Key1') 
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

    function animate() {
        requestAnimationFrame(animate);

        // UI & FPS Counter
        const time = performance.now();
        frames++;
        if (time > lastTime + 1000) {
            uiContainer.innerHTML = `FPS: ${Math.round((frames * 1000) / (time - lastTime))}<br>ID: ${network?.getLocalId()}`;
            lastTime = time;
            frames = 0;
        }

        if (pauseMenu.getPaused()) return;

        // Physics & Movement
        player.updateLookFromState(mouseLook.state);
        
        player.velocity.set(0, 0, 0);
        if (keys.w) player.velocity.addScaledVector(player.forwardDirection, moveSpeed);
        if (keys.s) player.velocity.addScaledVector(player.forwardDirection, -moveSpeed);
        if (keys.a) player.velocity.addScaledVector(player.rightDirection, -moveSpeed);
        if (keys.d) player.velocity.addScaledVector(player.rightDirection, moveSpeed);

        const isGrounded = playerController.computedGrounded();
        verticalVelocity = isGrounded && verticalVelocity < 0 ? -0.01 : verticalVelocity - 0.015;
        if (isGrounded && keys.space) verticalVelocity = jumpVelocity;
        player.velocity.y = verticalVelocity;

        playerController.computeColliderMovement(playerCollider, player.velocity);
        const correctedVelocity = playerController.computedMovement();
        
        player.velocity.copy(correctedVelocity)
        player.position.add(correctedVelocity);
        playerBody.setNextKinematicTranslation(player.position);

        world.step();

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
    }

    animate();
}

init();