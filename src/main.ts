import * as THREE from 'three';
import { Player } from './player';
import * as Cameras from './camera';
import { MouseState, KeyboardState } from './input';
import { NetworkManager } from './network';
import { PauseMenu } from './pauseMenu';
import { EnvironmentObject } from './environmentObject';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ConfigurableRenderer } from './renderer';
import { Level } from './level';
import { DebugRenderer } from './debugRenderer';

async function init() {
    const clock = new THREE.Clock();

    // 2. Environment objects: (geometry, halfExtents, position, material?)
    const floorSize = 20;
    const floor = new EnvironmentObject(
        new THREE.BoxGeometry(floorSize * 2, 1, floorSize * 2),
        new THREE.Vector3(floorSize, 0.5, floorSize),
        new THREE.Vector3(0, 0, 0),
        new THREE.MeshStandardMaterial({ color: 0xffffff })
    );
    floor.mesh.receiveShadow = true;

    const platform1 = new EnvironmentObject(
        new THREE.BoxGeometry(4, 0.2, 4),
        new THREE.Vector3(2, 0.1, 2),
        new THREE.Vector3(5, 1, 5)
    );

    const platform2 = new EnvironmentObject(
        new THREE.BoxGeometry(4, 0.2, 4),
        new THREE.Vector3(2, 0.1, 2),
        new THREE.Vector3(0, 3, 8)
    );

    const platform3 = new EnvironmentObject(
        new THREE.BoxGeometry(4, 0.2, 4),
        new THREE.Vector3(2, 0.1, 2),
        new THREE.Vector3(-4, 5, 4)
    );

    const wall = new EnvironmentObject(
        new THREE.BoxGeometry(10, 8, 0.5),
        new THREE.Vector3(5, 4, 0.25),
        new THREE.Vector3(0, 4, -10)
    );

    // 3. Physics world (Jolt) and scene (Level)
    const level = new Level(
        new THREE.Color(0x87ceeb),
        [floor, platform1, platform2, platform3, wall]
    );

    // Snowman decoration (visual only, no physics)
    const loader = new GLTFLoader();
    loader.load('./snowman_amanda_losneck.glb', (gltf) => {
        const snowman = gltf.scene;
        snowman.position.set(20, 0.5, 15);
        snowman.rotation.set(0, Math.PI / 5, 0);
        snowman.castShadow = true;
        level.add(snowman);
    });

    let networking = true;
    const network = networking ? new NetworkManager() : null;
    network?.setScene(level);

    const pauseMenu = new PauseMenu((_paused) => {});

    const uiContainer = document.createElement('div');
    Object.assign(uiContainer.style, {
        position: 'fixed', top: '10px', left: '10px',
        color: 'white', backgroundColor: 'rgba(0,0,0,0.5)',
        padding: '5px 10px', fontFamily: 'monospace', fontSize: '14px',
        borderRadius: '4px', pointerEvents: 'none', zIndex: '1000'
    });
    document.body.appendChild(uiContainer);

    const mouseLook = new MouseState();

    const initialPlayerPosition = new THREE.Vector3(0, 5, 0);
    const playerVelocity = new THREE.Vector3();

    const player = new Player(1, initialPlayerPosition, playerVelocity, mouseLook);
    const { kinematicCharacter } = level.addPlayer(player);

    const physicsSyncs: Array<() => void> = [];
    physicsSyncs.push(() => kinematicCharacter.syncPositionTo(player.position));

    const mainCamera = Cameras.thirdPersonCamera(player);
    const miniMapCamera = Cameras.topDownCameraFollow(player);

    const mainRenderer = new ConfigurableRenderer(level, mainCamera.camera, true);
    const miniMapRenderer = new ConfigurableRenderer(level, miniMapCamera.camera, false, 200, 200);

    const debugRenderer = new DebugRenderer(
        level,
        mainCamera.camera,
        mainRenderer.renderer,
        level.physics.system
    );
    let debugEnabled = false;
    debugRenderer.setVisible(false);
    window.addEventListener('keydown', (e) => {
        if (e.code === 'F3') {
            e.preventDefault();
            debugEnabled = !debugEnabled;
            debugRenderer.setVisible(debugEnabled);
        }
    });

    Object.assign(miniMapRenderer.renderer.domElement.style, {
        position: 'fixed', top: '10px', right: '10px',
        width: '200px', height: '200px', zIndex: '1001',
        border: '2px solid #fff', background: 'rgba(0,0,0,0.2)',
        pointerEvents: 'none',
    });

    const keys = new KeyboardState(["KeyW", "KeyA", "KeyS", "KeyD", "Space"]);

    let lastTime = performance.now();
    let frames = 0;

    function animate() {
        requestAnimationFrame(animate);
        if (pauseMenu.getPaused()) return;

        const deltaTime = Math.min(clock.getDelta(), 1 / 30);

        player.updateLookFromState(mouseLook.lookState);

        const moveDir = new THREE.Vector3();
        if (keys.state.KeyW) moveDir.addScaledVector(player.forwardDirection, 1);
        if (keys.state.KeyS) moveDir.addScaledVector(player.forwardDirection, -1);
        if (keys.state.KeyA) moveDir.addScaledVector(player.rightDirection, -1);
        if (keys.state.KeyD) moveDir.addScaledVector(player.rightDirection, 1);

        kinematicCharacter.update(deltaTime, moveDir, !!keys.state['Space']);
        physicsSyncs.forEach(sync => sync());

        player.updateVisuals();

        network?.sendState(player.position, player.rotation.y);
        network?.updateRemotePlayers();

        mainCamera.update();
        miniMapCamera.update();
        if (debugEnabled) {
            debugRenderer.render();
        }
        miniMapRenderer.render();
        mainRenderer.render();

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
