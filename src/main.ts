import * as THREE from 'three';
import { Player } from './player';
import { Controls } from './controls';
import { NetworkManager } from './network';
import { RigidCuboid } from './rigidCuboid';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Renderer, CameraPresets, Camera, DebugRenderer } from './rendering';
import { Level } from './level';
import { DebugUI, PauseMenu } from './ui';
import { MovingCuboid } from './movingCuboid';

const FALL_THRESHOLD_Y = -10;

async function init() {
    const clock = new THREE.Clock();

    // 2. Environment objects: (geometry, halfExtents, position, material?)
    const floorSize = 20;
    const floor = new RigidCuboid(
        new THREE.BoxGeometry(floorSize * 2, 1, floorSize * 2),
        new THREE.Vector3(floorSize, 0.5, floorSize),
        new THREE.Vector3(0, 0, 0),
        new THREE.MeshStandardMaterial({ color: 0xffffff })
    );
    floor.mesh.receiveShadow = true;

    const platform1 = new RigidCuboid(
        new THREE.BoxGeometry(4, 0.2, 4),
        new THREE.Vector3(2, 0.1, 2),
        new THREE.Vector3(5, 1, 5)
    );

    const platform2 = new RigidCuboid(
        new THREE.BoxGeometry(4, 0.2, 4),
        new THREE.Vector3(2, 0.1, 2),
        new THREE.Vector3(0, 3, 8)
    );

    const platform3 = new RigidCuboid(
        new THREE.BoxGeometry(4, 0.2, 4),
        new THREE.Vector3(2, 0.1, 2),
        new THREE.Vector3(-4, 5, 4)
    );

    const wall = new RigidCuboid(
        new THREE.BoxGeometry(10, 8, 0.5),
        new THREE.Vector3(5, 4, 0.25),
        new THREE.Vector3(0, 4, -10)
    );

    const movingPlatform = new MovingCuboid(
        new THREE.BoxGeometry(4, 0.2, 4),
        new THREE.Vector3(2, 0.1, 2),
        (positionVec: THREE.Vector3, time: number) => {
            return positionVec.setY(10 + 3 * Math.sin(time * 2));
        }
    );


    // 3. Physics world (Jolt) and scene (Level)
    const level = new Level(
        new THREE.Color(0x87ceeb),
        [floor, platform1, platform2, platform3, wall],
        [movingPlatform]
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

    let isPaused = false;
    /** Ignore Escape toggle briefly after browser-driven pointer unlock (same event as pause). */
    let suppressPauseToggleFromEscapeMs = 0;
    let pointerWasLocked = document.pointerLockElement === document.body;

    function setPaused(next: boolean) {
        if (next === isPaused) return;
        isPaused = next;
        pauseMenu.setVisible(next);
        if (next) {
            document.exitPointerLock();
        } else {
            document.body.requestPointerLock();
        }
    }

    const pauseMenu = new PauseMenu(() => setPaused(false));

    document.addEventListener('pointerlockchange', () => {
        const locked = document.pointerLockElement === document.body;
        if (pointerWasLocked && !locked) {
            if (!isPaused) {
                setPaused(true);
            }
            suppressPauseToggleFromEscapeMs = performance.now() + 150;
        }
        pointerWasLocked = locked;
    });

    const debugUI = new DebugUI();

    const controls = new Controls();

    const playerSpawnPosition = new THREE.Vector3(0, 5, 0);
    const playerSpawnVelocity = new THREE.Vector3(0, 3, 0);

    const player = new Player(1, playerSpawnPosition, playerSpawnVelocity);
    const { kinematicCharacter } = level.spawn(player);

    const physicsSyncs: Array<() => void> = [];
    physicsSyncs.push(() => kinematicCharacter.syncPositionTo(player.position));
    physicsSyncs.push(() => kinematicCharacter.syncVelocityTo(player.velocity));

    const mainCamera: Camera = CameraPresets.thirdPersonCamera(player);
    const miniMapCamera: Camera = CameraPresets.topDownCameraFollow(player);


    const debugRenderer = new DebugRenderer(level.physics.system)
    const mainRenderer = new Renderer(level, mainCamera, debugRenderer, true);
    const miniMapRenderer = new Renderer(level, miniMapCamera, debugRenderer, false, 200, 200);

    Object.assign(miniMapRenderer.renderer.domElement.style, {
        position: 'fixed', top: '10px', right: '10px',
        width: '200px', height: '200px', zIndex: '1001',
        border: '2px solid #fff', background: 'rgba(0,0,0,0.2)',
        pointerEvents: 'none',
    });

    function onPlayerDeath(): void {
        console.log("player dead");
        kinematicCharacter.setPosition(playerSpawnPosition.x, playerSpawnPosition.y, playerSpawnPosition.z);
        kinematicCharacter.setVelocity(playerSpawnVelocity.x, playerSpawnVelocity.y, playerSpawnVelocity.z);
        player.playerDead = false;
        player.velocity.copy(playerSpawnVelocity);
    }

    function animate() {
        requestAnimationFrame(animate);

        const deltaTime = Math.min(clock.getDelta(), 1 / 30);
        const controlState = controls.getState(deltaTime);

        if (
            controlState.togglePausePressed &&
            performance.now() > suppressPauseToggleFromEscapeMs
        ) {
            setPaused(!isPaused);
        }

        const flushDebugHud = () => {
            debugUI.update({
                networkId: network?.getLocalId() ?? null,
                control: controlState,
                isPaused,
                playerPosition: {
                    x: player.position.x,
                    y: player.position.y,
                    z: player.position.z,
                },
                playerVelocity: {
                    x: player.velocity.x,
                    y: player.velocity.y,
                    z: player.velocity.z,
                },
                wasmHeap: level.physics.getWasmHeapStats(),
            });
        };

        if (isPaused) {
            flushDebugHud();
            return;
        }

        const { lookDirection, movementDirection, isJumping } = controlState;

        player.updateLookFromDirection(lookDirection);
        kinematicCharacter.update(deltaTime, movementDirection, isJumping);

        physicsSyncs.forEach(sync => sync());

        // Kill the player if below the fall threshold
        if (player.position.y < FALL_THRESHOLD_Y) {
            if (!player.playerDead) {
                player.playerDead = true;
                onPlayerDeath();  // your event: respawn, play sound, etc.
            }
        } else {
            player.playerDead = false;  // reset when above again (e.g. after respawn)
        }

        player.updateVisuals();

        network?.sendState(player.position, player.rotation.y);
        network?.updateRemotePlayers();

        mainCamera.update();
        miniMapCamera.update();
        
        miniMapRenderer.render();
        mainRenderer.render();

        flushDebugHud();
    }

    animate();
}

init();
