import * as THREE from 'three';
import { Jolt, type JoltModule } from './jolt';

// Object layers: static world vs. dynamic/moving objects
export const LAYER_NON_MOVING = 0;
export const LAYER_MOVING = 1;
const NUM_OBJECT_LAYERS = 2;

// Broad-phase layers mirror the object layers
const BP_LAYER_NON_MOVING = 0;
const BP_LAYER_MOVING = 1;
const NUM_BROAD_PHASE_LAYERS = 2;

/**
 * Manages the Jolt physics lifecycle: filters, broad-phase layers, body/character
 * creation, and stepping. Owns all Jolt "baggage" so Level can focus on scene
 * composition and swapping.
 */
export class PhysicsWorld {
    public readonly system: typeof Jolt.PhysicsSystem.prototype;
    public readonly bodyInterface: typeof Jolt.BodyInterface.prototype;
    public readonly tempAllocator: typeof Jolt.TempAllocator.prototype;

    /** Filters for CharacterVirtual.ExtendedUpdate — accepts relevant layers. */
    public readonly bpLayerFilter: typeof Jolt.BroadPhaseLayerFilter.prototype;
    public readonly objLayerFilter: typeof Jolt.ObjectLayerFilter.prototype;

    private joltInterface: typeof Jolt.JoltInterface.prototype;
    private objectFilter: typeof Jolt.ObjectLayerPairFilterTable.prototype;
    private bpInterface: typeof Jolt.BroadPhaseLayerInterfaceTable.prototype;

    private currentTime: number = 0;
    private identityQuat: InstanceType<JoltModule['Quat']> = Jolt.Quat.prototype.sIdentity();
    /** Per-frame kinematic sync; each entry owns a long-lived `RVec3` (no per-frame alloc). */
    private positionUpdaters: Array<(dt: number) => void> = [];

    /** Remote player collision proxies: kinematic bodies the local CharacterVirtual collides with. */
    private playerProxies: Map<string, { bodyID: InstanceType<JoltModule['BodyID']>; joltPos: InstanceType<JoltModule['RVec3']> }> = new Map();

    constructor() {
        // Which object layers can collide with each other
        this.objectFilter = new Jolt.ObjectLayerPairFilterTable(NUM_OBJECT_LAYERS);
        this.objectFilter.EnableCollision(LAYER_NON_MOVING, LAYER_MOVING);
        this.objectFilter.EnableCollision(LAYER_MOVING, LAYER_MOVING);

        // Map object layers to broad-phase buckets
        this.bpInterface = new Jolt.BroadPhaseLayerInterfaceTable(NUM_OBJECT_LAYERS, NUM_BROAD_PHASE_LAYERS);
        this.bpInterface.MapObjectToBroadPhaseLayer(LAYER_NON_MOVING, new Jolt.BroadPhaseLayer(BP_LAYER_NON_MOVING));
        this.bpInterface.MapObjectToBroadPhaseLayer(LAYER_MOVING, new Jolt.BroadPhaseLayer(BP_LAYER_MOVING));

        const objVsBpFilter = new Jolt.ObjectVsBroadPhaseLayerFilterTable(
            this.bpInterface,
            NUM_BROAD_PHASE_LAYERS,
            this.objectFilter,
            NUM_OBJECT_LAYERS
        );

        const settings = new Jolt.JoltSettings();
        settings.mObjectLayerPairFilter = this.objectFilter;
        settings.mBroadPhaseLayerInterface = this.bpInterface;
        settings.mObjectVsBroadPhaseLayerFilter = objVsBpFilter;

        this.joltInterface = new Jolt.JoltInterface(settings);
        Jolt.destroy(settings);

        this.system = this.joltInterface.GetPhysicsSystem();
        this.bodyInterface = this.system.GetBodyInterface();
        this.tempAllocator = this.joltInterface.GetTempAllocator();

        this.bpLayerFilter = new Jolt.BroadPhaseLayerFilter();
        this.objLayerFilter = new Jolt.DefaultObjectLayerFilter(this.objectFilter, LAYER_MOVING);
    }

    /**
     * Emscripten linear memory stats exposed by Jolt (`HEAP8.length` and dlmalloc `mallinfo` free estimate).
     */
    getWasmHeapStats(): { totalBytes: number; freeBytes: number; usedBytesApprox: number } {
        const totalBytes = this.joltInterface.sGetTotalMemory();
        const freeBytes = this.joltInterface.sGetFreeMemory();
        return {
            totalBytes,
            freeBytes,
            usedBytesApprox: Math.max(0, totalBytes - freeBytes),
        };
    }

    /**
     * Create a static box body and add it to the world.
     * Owns all Jolt allocations — caller does not need to destroy.
     */
    createStaticCuboid(halfExtents: THREE.Vector3, position: THREE.Vector3): void {
        const { x, y, z } = halfExtents;
        const shape = new Jolt.BoxShape(new Jolt.Vec3(x, y, z), 0.05);
        const bodySettings = new Jolt.BodyCreationSettings(
            shape,
            new Jolt.RVec3(position.x, position.y, position.z),
            Jolt.Quat.prototype.sIdentity(),
            Jolt.EMotionType_Static,
            LAYER_NON_MOVING
        );
        const body = this.bodyInterface.CreateBody(bodySettings);
        Jolt.destroy(bodySettings);
        this.bodyInterface.AddBody(body.GetID(), Jolt.EActivation_DontActivate);
    }

    /**
     * Create a kinematic proxy for a remote player. The local CharacterVirtual will collide with it.
     * Idempotent — no-op if proxy for this ID already exists.
     */
    createPlayerProxy(playerId: string, halfExtents: THREE.Vector3, position: THREE.Vector3): void {
        if (this.playerProxies.has(playerId)) return;
        const { x, y, z } = halfExtents;
        const shape = new Jolt.BoxShape(new Jolt.Vec3(x, y, z), 0.02);
        const bodySettings = new Jolt.BodyCreationSettings(
            shape,
            new Jolt.RVec3(position.x, position.y, position.z),
            Jolt.Quat.prototype.sIdentity(),
            Jolt.EMotionType_Kinematic,
            LAYER_MOVING
        );
        const body = this.bodyInterface.CreateBody(bodySettings);
        Jolt.destroy(bodySettings);
        const bodyID = body.GetID();
        const joltPos = new Jolt.RVec3();
        this.playerProxies.set(playerId, { bodyID, joltPos });
        this.bodyInterface.AddBody(bodyID, Jolt.EActivation_Activate);
    }

    /**
     * Update a player proxy position from network state. No-op if proxy does not exist.
     */
    updatePlayerProxy(playerId: string, position: THREE.Vector3, dt: number): void {
        const entry = this.playerProxies.get(playerId);
        if (!entry) return;
        entry.joltPos.Set(position.x, position.y, position.z);
        this.bodyInterface.MoveKinematic(entry.bodyID, entry.joltPos, this.identityQuat, dt);
    }

    /**
     * Remove a player proxy and free its Jolt allocations. No-op if proxy does not exist.
     */
    destroyPlayerProxy(playerId: string): void {
        const entry = this.playerProxies.get(playerId);
        if (!entry) return;
        this.bodyInterface.RemoveBody(entry.bodyID);
        this.bodyInterface.DestroyBody(entry.bodyID);
        Jolt.destroy(entry.joltPos);
        this.playerProxies.delete(playerId);
    }

    createKinematicCuboid(
        halfExtents: THREE.Vector3,
        positionFn: (time: number) => THREE.Vector3
    ): void {
        const { x, y, z } = halfExtents;
        const shape = new Jolt.BoxShape(new Jolt.Vec3(x, y, z), 0.05);
        const initialPosition = positionFn(this.currentTime);

        const bodySettings = new Jolt.BodyCreationSettings(
            shape,
            new Jolt.RVec3(initialPosition.x, initialPosition.y, initialPosition.z),
            Jolt.Quat.prototype.sIdentity(),
            Jolt.EMotionType_Kinematic,
            LAYER_MOVING
        );
        const body = this.bodyInterface.CreateBody(bodySettings);
        Jolt.destroy(bodySettings);

        const bodyID = body.GetID();
        const joltPos = new Jolt.RVec3();
        this.positionUpdaters.push((dt: number) => {
            const p = positionFn(this.currentTime);
            joltPos.Set(p.x, p.y, p.z);
            this.bodyInterface.MoveKinematic(bodyID, joltPos, this.identityQuat, dt);
        });
        this.bodyInterface.AddBody(bodyID, Jolt.EActivation_Activate);
    }

    /**
     * Create and return a CharacterVirtual. Caller must update it each frame via
     * ExtendedUpdate. The character is virtual — not a rigid body in the world.
     */
    createCharacter(
        halfExtents: THREE.Vector3,
        position: THREE.Vector3
    ): typeof Jolt.CharacterVirtual.prototype {
        const { x: hx, y: hy, z: hz } = halfExtents;
        const shape = new Jolt.BoxShape(new Jolt.Vec3(hx, hy, hz), 0.02);

        const characterSettings = new Jolt.CharacterVirtualSettings();
        characterSettings.mMass = 70;
        characterSettings.mMaxSlopeAngle = Math.PI / 4;
        characterSettings.mShape = shape;
        characterSettings.mCharacterPadding = 0.02;
        characterSettings.mPenetrationRecoverySpeed = 1.0;
        characterSettings.mPredictiveContactDistance = 0.1;

        const character = new Jolt.CharacterVirtual(
            characterSettings,
            new Jolt.RVec3(position.x, position.y, position.z),
            new Jolt.Quat(0, 0, 0, 1),
            this.system
        );
        Jolt.destroy(characterSettings);

        return character;
    }

    /** Simulation clock used by kinematic movers (`positionFn(time)`). Host advances locally; clients override via `step(..., authoritativeTime)`. */
    getSimulationTime(): number {
        return this.currentTime;
    }

    /**
     * Update moving platform positions (visual + Jolt bodies) without stepping physics.
     * Use when paused so clients see platforms advance from host simTime, and host sees local time advance.
     */
    updateMovingPlatforms(simulationTime: number, dt: number): void {
        this.currentTime = simulationTime;
        const clampedDt = Math.min(dt, 1 / 30);
        this.positionUpdaters.forEach((updater) => updater(clampedDt));
    }

    /**
     * Advance the physics simulation by deltaTime.
     * Clamped to 1/30 s to prevent the "spiral of death" on slow frames.
     * @param authoritativeTime If set (e.g. from multiplayer host), replaces `currentTime` instead of advancing by `dt` — keeps kinematic platforms in sync.
     */
    step(deltaTime: number, authoritativeTime?: number): void {
        const dt = Math.min(deltaTime, 1 / 30);
        if (authoritativeTime !== undefined && Number.isFinite(authoritativeTime)) {
            this.currentTime = authoritativeTime;
        } else {
            this.currentTime += dt;
        }
        this.positionUpdaters.forEach((updater) => updater(dt));
        this.joltInterface.Step(dt, 1);
    }
}
