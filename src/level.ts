import * as THREE from 'three';
import { Jolt } from './jolt';
import { EnvironmentObject } from './environmentObject';
import { Player } from './player';
import { LightSource } from './lighting';

// Object layers: static world vs. dynamic/moving objects
const LAYER_NON_MOVING = 0;
const LAYER_MOVING = 1;
const NUM_OBJECT_LAYERS = 2;

// Broad-phase layers mirror the object layers
const BP_LAYER_NON_MOVING = 0;
const BP_LAYER_MOVING = 1;
const NUM_BROAD_PHASE_LAYERS = 2;

class Level extends THREE.Scene {
    private joltInterface: typeof Jolt.JoltInterface.prototype;
    public readonly physicsSystem: typeof Jolt.PhysicsSystem.prototype;
    private bodyInterface: typeof Jolt.BodyInterface.prototype;

    // Broad-phase and object-layer interfaces kept alive for filter reuse
    private objectFilter: typeof Jolt.ObjectLayerPairFilterTable.prototype;
    private bpInterface: typeof Jolt.BroadPhaseLayerInterfaceTable.prototype;

    /**
     * Filters used when updating CharacterVirtual — exposed so main.ts can pass them.
     * bpLayerFilter: accepts all broad-phase layers (base BroadPhaseLayerFilter).
     * objLayerFilter: accepts object layers that LAYER_MOVING can collide with.
     */
    public readonly bpLayerFilter: typeof Jolt.BroadPhaseLayerFilter.prototype;
    public readonly objLayerFilter: typeof Jolt.ObjectLayerFilter.prototype;
    public readonly tempAllocator: typeof Jolt.TempAllocator.prototype;

    private environmentObjects: Array<EnvironmentObject>;

    constructor(
        background: THREE.Color | THREE.Texture | THREE.CubeTexture | null,
        environmentObjects: Array<EnvironmentObject>
    ) {
        super();

        this.add(new THREE.AmbientLight(0xffffff, 0.5));
        const lightSource = new LightSource(0xffffff, 1);
        this.add(lightSource);
        lightSource.setPos(0, 5, 0);

        this.background = background;

        // ── Jolt setup ────────────────────────────────────────────────────────

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

        this.physicsSystem = this.joltInterface.GetPhysicsSystem();
        this.bodyInterface = this.physicsSystem.GetBodyInterface();
        this.tempAllocator = this.joltInterface.GetTempAllocator();

        // Pre-built filters for character collision queries:
        // - bpLayerFilter: base class = accept all broad-phase layers
        // - objLayerFilter: accept only layers that LAYER_MOVING can collide with
        this.bpLayerFilter = new Jolt.BroadPhaseLayerFilter();
        this.objLayerFilter = new Jolt.DefaultObjectLayerFilter(this.objectFilter, LAYER_MOVING);

        // ── Populate environment ───────────────────────────────────────────────
        this.environmentObjects = environmentObjects;
        this.environmentObjects.forEach(obj => {
            super.add(obj);
            this._createStaticBody(obj);
        });
    }

    private _createStaticBody(object: EnvironmentObject): void {
        const { x, y, z } = object.halfExtents;

        const shape = new Jolt.BoxShape(new Jolt.Vec3(x, y, z), 0.05);
        const pos = object.position;
        const bodySettings = new Jolt.BodyCreationSettings(
            shape,
            new Jolt.RVec3(pos.x, pos.y, pos.z),
            new Jolt.Quat(0, 0, 0, 1),
            Jolt.EMotionType_Static,
            LAYER_NON_MOVING
        );
        const body = this.bodyInterface.CreateBody(bodySettings);
        Jolt.destroy(bodySettings);
        this.bodyInterface.AddBody(body.GetID(), Jolt.EActivation_DontActivate);
    }

    /** Dynamically add a static physics object to the scene at runtime. */
    public addWithPhysics(object: EnvironmentObject): void {
        super.add(object);
        this.environmentObjects.push(object);
        this._createStaticBody(object);
    }

    /**
     * Add the local player and return a Jolt CharacterVirtual that drives it.
     * The CharacterVirtual is virtual — it is not a rigid body in the world,
     * so it must be updated manually each frame via character.Update / ExtendedUpdate.
     */
    public addPlayer(player: Player): { character: typeof Jolt.CharacterVirtual.prototype } {
        super.add(player);

        const { x: hx, y: hy, z: hz } = player.halfExtents;
        const shape = new Jolt.BoxShape(new Jolt.Vec3(hx, hy, hz), 0.02);

        const characterSettings = new Jolt.CharacterVirtualSettings();
        characterSettings.mMass = 70;
        characterSettings.mMaxSlopeAngle = Math.PI / 4;
        characterSettings.mShape = shape;
        characterSettings.mCharacterPadding = 0.02;
        characterSettings.mPenetrationRecoverySpeed = 1.0;
        characterSettings.mPredictiveContactDistance = 0.1;

        const pos = player.position;
        const character = new Jolt.CharacterVirtual(
            characterSettings,
            new Jolt.RVec3(pos.x, pos.y, pos.z),
            new Jolt.Quat(0, 0, 0, 1),
            this.physicsSystem
        );
        Jolt.destroy(characterSettings);

        return { character };
    }

    /**
     * Advance the physics simulation by deltaTime.
     * Clamped to 1/30 s to prevent the "spiral of death" on slow frames.
     */
    public stepPhysics(deltaTime: number): void {
        this.joltInterface.Step(Math.min(deltaTime, 1 / 30), 1);
    }
}

export { Level };
