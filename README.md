# ThreeJS Physics Playground

A browser-based 3D physics demo built with [Three.js](https://threejs.org/) and [Jolt Physics](https://github.com/jrouwe/JoltPhysics.js) (WASM), with optional multiplayer via [PlayroomKit](https://docs.joinplayroom.com/).

---

## High-Level Architecture

The project uses a simple, direct architecture — no framework or event bus. A single async `init()` function in `main.ts` constructs all systems, then runs a `requestAnimationFrame` loop.

```
main.ts  →  Level (Three.Scene + PhysicsWorld)
         →  KinematicCharacter (move/jump API, hides Jolt filters/settings)
         →  Player (Object3D, visual only)
         →  Cameras / Renderers / Input / PauseMenu
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
  input → moveDir (from keys + player look)
        → kinematicCharacter.update(dt, moveDir, jumpPressed)  // gravity, step, ExtendedUpdate
        → kinematicCharacter.syncPositionTo(player.position)
```

---

## System Manifest

### Logic Systems

| File | Role |
|---|---|
| `main.ts` | Entry point — constructs all systems, runs the game loop. Builds `moveDir` from keys, calls `kinematicCharacter.update()` and `syncPositionTo()`. |
| `PhysicsWorld.ts` | Jolt lifecycle: object/broad-phase layers, filters, `createStaticBody`, `createCharacter`, `step()`. Owns all Jolt setup so Level stays scene-only. |
| `KinematicCharacter.ts` | Wraps Jolt `CharacterVirtual` with `update(dt, moveDir, jumpPressed)` and `syncPositionTo()`. Hides Jolt filters, settings, Vec3 allocation, gravity/jump logic. |
| `level.ts` | `THREE.Scene` subclass that creates `PhysicsWorld`, composes environment objects, and returns `KinematicCharacter` from `addPlayer()`. |
| `player.ts` | `THREE.Object3D` — box mesh, direction vectors. No Jolt; movement driven by `KinematicCharacter`. |
| `environmentObject.ts` | `THREE.Object3D` pairing a mesh with `halfExtents: THREE.Vector3` for Jolt box collider creation |
| `camera.ts` | Factory functions: `thirdPersonCamera`, `topDownCameraFollow`, etc. via `ConfigurableCamera` |
| `renderer.ts` | `THREE.WebGLRenderer` + `EffectComposer` wrapper; supports fullscreen or fixed-size viewports |
| `input.ts` | `MouseState` (pointer-lock, spherical look) and `KeyboardState` (allowlisted keys) |
| `lighting.ts` | `LightSource` — `DirectionalLight` with shadow config |
| `network.ts` | `NetworkManager` wrapping PlayroomKit (currently disabled: `networking = false`) |
| `pauseMenu.ts` | HTML overlay pause menu, toggled by Escape |

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
5. Each frame: build `moveDir` from keys → `kinematicCharacter.update(dt, moveDir, jumpPressed)` → `kinematicCharacter.syncPositionTo(player.position)`.

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

---

## Current State & Known Issues

### Working
- Static environment (floor, platforms, wall) with box colliders
- Player movement (WASD + mouse look) driven by `CharacterVirtual`
- Jumping with mid-air gravity integration (via `ExtendedUpdate`)
- Stair-step-up and snap-to-floor via `ExtendedUpdateSettings`
- Third-person + mini-map orthographic cameras
- Pause menu (Escape)
- Snowman decoration (visual only, no physics collider)
- FPS counter HUD
- GitHub Actions deploy workflow

### Known Issues / Next Steps
- Multiplayer (`NetworkManager` / PlayroomKit) is disabled (`networking = false`) and untested with Jolt
- `EnvironmentObject.setPosition()` only updates the Three.js position — Jolt static bodies cannot be moved after creation; dynamic/kinematic bodies would need `bodyInterface.MoveKinematic()` or similar
- No debug physics visualizer (Jolt has a debug renderer in C++ but not exposed in the JS bindings)
