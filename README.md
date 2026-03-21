# ThreeJS Physics Playground

A browser-based 3D physics demo built with [Three.js](https://threejs.org/) and [Jolt Physics](https://github.com/jrouwe/JoltPhysics.js) (WASM), with optional multiplayer via [PlayroomKit](https://docs.joinplayroom.com/).

---

## High-Level Architecture

The project uses a simple, direct architecture — no framework or event bus. A single async `init()` function in `main.ts` constructs all systems, then runs a `requestAnimationFrame` loop.

```
main.ts  →  Level (Three.Scene + JoltInterface)
         →  Player (Object3D + CharacterVirtual handle)
         →  Cameras / Renderers / Input / PauseMenu
```

**Physics data flow:**

```
EnvironmentObject(geometry, halfExtents, pos)
  → Level._createStaticBody()  → Jolt static body (LAYER_NON_MOVING)

Player(size, pos)
  → Level.addPlayer()  → Jolt CharacterVirtual (virtual, not a rigid body)

main.ts animate():
  input → character.SetLinearVelocity()
        → level.stepPhysics(dt)          // advances dynamic bodies
        → character.ExtendedUpdate(dt)   // moves virtual character
        → read character.GetPosition()   // sync Three.js player position
```

---

## System Manifest

### Logic Systems

| File | Role |
|---|---|
| `main.ts` | Entry point — constructs all systems, runs the game loop |
| `level.ts` | `THREE.Scene` subclass that owns the Jolt `JoltInterface` and `PhysicsSystem`; creates static environment bodies and the `CharacterVirtual` for the player |
| `player.ts` | `THREE.Object3D` — box mesh, direction vectors, no Jolt objects (physics is owned by Level) |
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
| `LAYER_NON_MOVING = 0` | `level.ts` | Jolt object layer for static environment |
| `LAYER_MOVING = 1` | `level.ts` | Jolt object layer for character & dynamic objects |
| `moveSpeed = 9` | `main.ts` | Player horizontal speed (units/sec) |
| `jumpVelocity = 9` | `main.ts` | Player jump impulse (units/sec) |
| `gravity = (0, -9.81, 0)` | `main.ts` | Gravity vector applied manually in JS each frame; **zero** gravity is passed to `CharacterVirtual.ExtendedUpdate` |

---

## Scene Bootstrapping

1. `init()` awaits `initJolt()` (loads the Jolt WASM binary).
2. `EnvironmentObject` instances are created with plain `THREE.Vector3` half-extents — no physics objects yet.
3. `new Level(Jolt, background, objects)`:
   - Configures two Jolt object layers and two broad-phase layers.
   - Creates a `JoltInterface` + `PhysicsSystem`.
   - Calls `_createStaticBody()` for each `EnvironmentObject`, inserting Jolt static box bodies at their `THREE.Object3D.position`.
4. `level.addPlayer(player)` creates a `CharacterVirtual` at the player's start position and returns it.
5. Each frame: input → set character velocity → `level.stepPhysics(dt)` → `character.ExtendedUpdate(dt, gravity, ...)` → read `character.GetPosition()` back into `player.position`.

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
- `renderer.ts` has two pre-existing unused imports (`BloomPass`, `FilmPass`) — harmless TS warnings
- Multiplayer (`NetworkManager` / PlayroomKit) is disabled (`networking = false`) and untested with Jolt
- `EnvironmentObject.setPosition()` only updates the Three.js position — Jolt static bodies cannot be moved after creation; dynamic/kinematic bodies would need `bodyInterface.MoveKinematic()` or similar
- No debug physics visualizer (Jolt has a debug renderer in C++ but not exposed in the JS bindings)
