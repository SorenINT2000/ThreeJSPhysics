# ThreeJS Physics Playground

A browser-based 3D physics demo built with [Three.js](https://threejs.org/) and [Jolt Physics](https://github.com/jrouwe/JoltPhysics.js) (WASM), with optional multiplayer via [PlayroomKit](https://docs.joinplayroom.com/).

---

## High-Level Architecture

The project uses a simple, direct architecture — no framework or event bus. A single async `init()` function in `main.ts` constructs all systems, then runs a `requestAnimationFrame` loop.

```
main.ts  →  Level (Three.Scene + PhysicsWorld)
         →  KinematicCharacter (move/jump API, hides Jolt filters/settings)
         →  Player (Object3D, visual only)
         →  Cameras / Renderers / Controls / DebugUI / PauseMenu
```

**Control pipeline (single interface between input and game loop):**

```
input.ts:     KeyboardState, MouseState, GamepadState, LookController
                   ↓
controls.ts:  Controls instantiates all input states, combines them each frame
                   ↓
              getState(dt) → { lookDirection, movementDirection, isJumping, togglePausePressed, debug }
                   ↓
main.ts:      `isPaused` is the only pause flag; `setPaused` shows/hides menu, `exitPointerLock` / `requestPointerLock`
              pointer lock lost (e.g. browser Escape) → `pointerlockchange` → `setPaused(true)`
              Escape key (when it reaches the page) → `togglePausePressed` → `setPaused(!isPaused)` (suppressed briefly after lock loss)
              when running: player.updateLookFromDirection(lookDirection)
              kinematicCharacter.update(dt, movementDirection, isJumping)
```

**Physics data flow:**

```
PhysicsWorld: owns JoltInterface, layers, filters, tempAllocator
  → createStaticBody(halfExtents, pos)
  → createCharacter(halfExtents, pos) → CharacterVirtual

Level(background, envObjects):
  → creates PhysicsWorld, createStaticBody() for each EnvironmentObject
  → addPlayer() creates CharacterVirtual, wraps in KinematicCharacter

main.ts animate():
  controls.getState(dt) every frame (pause HUD + Escape when not eaten by browser)
        → pointerlockchange keeps pause in sync when the browser unlocks the pointer (Escape while captured)
        → if !isPaused: lookDirection, movementDirection, isJumping → kinematicCharacter.update / syncPositionTo
```

---

## System Manifest

### Logic Systems

| File | Role |
|---|---|
| `main.ts` | Entry point — constructs all systems, runs the game loop. Uses `Controls.getState()` for input, calls `kinematicCharacter.update()` and `syncPositionTo()`. |
| `PhysicsWorld.ts` | Jolt lifecycle: object/broad-phase layers, filters, `createStaticBody`, `createCharacter`, `step()`. Owns all Jolt setup so Level stays scene-only. |
| `KinematicCharacter.ts` | Wraps Jolt `CharacterVirtual` with `update(dt, moveDir, jumpPressed)` and `syncPositionTo()`. Reuses a `THREE.Vector3` for horizontal move (no `moveDir.clone()` per frame). |
| `level.ts` | `THREE.Scene` subclass that creates `PhysicsWorld`, composes environment objects, and returns `KinematicCharacter` from `addPlayer()`. |
| `player.ts` | `THREE.Object3D` — box mesh; world-space `lookDirection`; look line updated via local `BufferGeometry` (no `lookAt`). |
| `environmentObject.ts` | `THREE.Object3D` pairing a mesh with `halfExtents: THREE.Vector3` for Jolt box collider creation |
| `camera.ts` | Factory functions: `thirdPersonCamera`, `topDownCameraFollow`, etc. via `ConfigurableCamera` |
| `renderer.ts` | `THREE.WebGLRenderer` + `EffectComposer` wrapper; supports fullscreen or fixed-size viewports |
| `input.ts` | `LookController` (mouse + gamepad look), `MouseState` (pointer-lock + forwards to LookController), `KeyboardState`, `GamepadState` |
| `controls.ts` | `Controls` — single interface: instantiates input states, combines them each frame, returns `{ lookDirection, movementDirection, isJumping, togglePausePressed, debug }` (`Escape` edge via `KeyboardState`) |
| `ui/index.ts` | Barrel re-exports `DebugUI` and `PauseMenu` for `import { … } from './ui'`. |
| `ui/debugUI.ts` + `ui/debugUI.css` | `DebugUI` — top-left overlay; header dot reflects `isPaused` (same as pause/menu state); footer: player `x,y,z`, look/move/jump |
| `ui/pauseUI.ts` + `ui/pauseUI.css` | `PauseMenu` — overlay + resume callback. Pause vs running is only `isPaused` in `main.ts`; `setPaused` syncs menu and pointer lock. |
| `lighting.ts` | `LightSource` — `DirectionalLight` with shadow config |
| `network.ts` | `NetworkManager` wrapping PlayroomKit (currently disabled: `networking = false`) |
| `debugRenderer.ts` | Jolt `DebugRendererJS` bridge — draws physics shapes as Three.js wireframes. F3 toggle. |

### Configuration / Constants

| Value | Location | Purpose |
|---|---|---|
| `LAYER_NON_MOVING = 0` | `PhysicsWorld.ts` | Jolt object layer for static environment |
| `LAYER_MOVING = 1` | `PhysicsWorld.ts` | Jolt object layer for character & dynamic objects |
| `moveSpeed`, `jumpVelocity`, `gravity` | `KinematicCharacter` | Configurable via constructor options (defaults: 24, 40, 200). Gravity applied in JS; zero passed to Jolt. |

---

## Scene Bootstrapping

1. `init()` loads Jolt WASM via top-level await in `jolt.ts`.
2. `EnvironmentObject` instances are created with plain `THREE.Vector3` half-extents — no physics objects yet.
3. `new Level(background, objects)` creates `PhysicsWorld` internally and calls `createStaticBody()` for each `EnvironmentObject`.
4. `level.addPlayer(player)` adds player to scene, creates `CharacterVirtual` via `physicsWorld.createCharacter()`, wraps it in `KinematicCharacter`, returns the wrapper.
5. Each frame: `controls.getState(dt)`; if `togglePausePressed`, flip `isPaused` and update `PauseMenu`; if not paused, `player.updateLookFromDirection` → `kinematicCharacter.update` → `syncPositionTo`.

---

## Jolt Physics Layer Setup

```
ObjectLayerPairFilterTable (2 layers):
  LAYER_NON_MOVING (0) ↔ LAYER_MOVING (1)   ← enabled
  LAYER_MOVING (1)     ↔ LAYER_MOVING (1)   ← enabled

BroadPhaseLayerInterfaceTable:
  LAYER_NON_MOVING → BP_LAYER_NON_MOVING (0)
  LAYER_MOVING     → BP_LAYER_MOVING (1)

Character collision filters (reused every frame):
  bpLayerFilter  = new BroadPhaseLayerFilter()          // accept all BP layers
  objLayerFilter = new DefaultObjectLayerFilter(pairFilter, LAYER_MOVING)
```

**ADR:** Switched from Rapier3D to Jolt Physics.  
*Reason:* Jolt is actively maintained with a richer feature set (determinism, soft bodies, constraints) and the JS/WASM port (`jolt-physics` v1.x) has TypeScript types and a direct `CharacterVirtual` class that maps cleanly to the existing movement model.

**ADR:** Extracted `PhysicsWorld` from `Level`.  
*Reason:* Level is now a pure `THREE.Scene` for composition; PhysicsWorld owns all Jolt filters, layer config, and body creation. Enables swapping levels without mixing scene data with physics setup and simplifies debugging physics in isolation.

**ADR:** Introduced `Controls` and `LookController` as single interface between input and game loop.  
*Reason:* Separates raw input state (keyboard, mouse, gamepad) from derived control state (look direction, movement direction, jump). Movement uses forward/right derived from look, so both keyboard and gamepad share the same orientation. Enables gamepad right-stick look alongside mouse.

**ADR:** Hot-path avoidance of per-frame `THREE.Vector3` allocations.  
*Reason:* `KinematicCharacter.update` previously used `moveDir.clone()` every frame; third-person camera used `worldToLocal(player.lookDirection)` which mutates its argument — fixed with scratch vectors. **Look line:** `lookDirection` is world-space; the debug line is a `BufferGeometry` segment in **player-local** space (end vertex = world look rotated by inverse world quaternion). Avoids `lookAt` and avoids treating a direction as a point with `localToWorld` (which would add translation and skew the vector).

---

## Current State & Known Issues

### Working
- Static environment (floor, platforms, wall) with box colliders
- Player movement (WASD + D-pad + left stick) and look (mouse + right stick) driven by `CharacterVirtual`
- Jumping with mid-air gravity integration (via `ExtendedUpdate`)
- Stair-step-up and snap-to-floor via `ExtendedUpdateSettings`
- Third-person + mini-map orthographic cameras
- Pause menu: `isPaused` drives menu + lock (`setPaused`); browser Escape unlocks pointer → `pointerlockchange` pauses; Escape also toggles via `Controls` when the key event is delivered (e.g. gamepad / already unlocked). The pause overlay stops `mousedown`/`pointerdown` bubbling so `MouseState`’s window listener cannot grab pointer lock before the Resume `click` fires.
- Snowman decoration (visual only, no physics collider)
- FPS + visual input HUD (`DebugUI`: keys, stick gauges, gamepad buttons, compact vectors)
- Debug physics visualizer (F3 to toggle wireframe hitboxes for static bodies)
- GitHub Actions deploy workflow

### Known Issues / Next Steps
- Multiplayer (`NetworkManager` / PlayroomKit) is disabled (`networking = false`) and untested with Jolt
- `EnvironmentObject.setPosition()` only updates the Three.js position — Jolt static bodies cannot be moved after creation; dynamic/kinematic bodies would need `bodyInterface.MoveKinematic()` or similar
