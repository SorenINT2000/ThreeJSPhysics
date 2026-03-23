import * as THREE from 'three';
import { Jolt } from './jolt';

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
     * Create a static box body and add it to the world.
     * Owns all Jolt allocations — caller does not need to destroy.
     */
    createStaticBody(halfExtents: THREE.Vector3, position: THREE.Vector3): void {
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

    // createFloor(yLevel: number): void {
    //     const plane_shape = new Jolt.PlaneShape(new Jolt.Plane(new Jolt.Vec3(0, 1, 0), 0));
    //     // const shape_settings = new Jolt.ShapeSettings(); // Optional, or use shape directly
    //     const body_settings = new Jolt.BodyCreationSettings(
    //         plane_shape, 
    //         new Jolt.RVec3(0, yLevel, 0),     // Position
    //         Jolt.Quat.prototype.sIdentity(), // Rotation
    //         Jolt.EMotionType_Static,    // Motion Type (Static = immovable)
    //         LAYER_NON_MOVING            // Your defined collision layer
    //     );
    //     const body = this.bodyInterface.CreateBody(body_settings);
    //     Jolt.destroy(body_settings);
    //     this.bodyInterface.AddBody(body.GetID(), Jolt.EActivation_DontActivate)

    //     // Register the player contact activation listener

    //     const activationListener = new Jolt.BodyActivationListenerJS;
    //     activationListener.OnBodyActivated = (bodyId, userData) => {
    //         bodyId = Jolt.wrapPointer(bodyId, Jolt.BodyID);
    //         console.log('OnBodyActivated ' + bodyId.GetIndex() + ' ' + userData);
    //     };
    //     activationListener.OnBodyDeactivated = (bodyId, userData) => {
    //         bodyId = Jolt.wrapPointer(bodyId, Jolt.BodyID);
    //         console.log('OnBodyDeactivated ' + bodyId.GetIndex() + ' ' + userData);
    //     };
    //     this.system.SetBodyActivationListener(activationListener);


    //     const contactListener = new Jolt.CharacterContactListenerJS();
    //     contactListener.OnContactValidate = (inCharacter: number, inBodyID2: number, inSubShapeID2: number) => {
    //         body1 = Jolt.wrapPointer(body1, Jolt.Body).GetID().GetIndex();
    //         body2 = Jolt.wrapPointer(body2, Jolt.Body).GetID().GetIndex();
    //         collideShapeResult = Jolt.wrapPointer(collideShapeResult, Jolt.CollideShapeResult).m;
    //         console.log('OnContactValidate ' + body1 + ' ' + body2 + ' ' + collideShapeResult.mPenetrationAxis.ToString());
    //         return Jolt.ValidateResult_AcceptAllContactsForThisBodyPair;
    //     };
    //     contactListener.OnContactAdded = (body1, body2, manifold, settings) => {
    //         body1 = Jolt.wrapPointer(body1, Jolt.Body);
    //         body2 = Jolt.wrapPointer(body2, Jolt.Body);
    //         manifold = Jolt.wrapPointer(manifold, Jolt.ContactManifold);
    //         settings = Jolt.wrapPointer(settings, Jolt.ContactSettings);
    //         console.log('OnContactAdded ' + body1.GetID().GetIndex() + ' ' + body2.GetID().GetIndex() + ' ' + manifold.mWorldSpaceNormal.ToString());

    //         // Override the restitution to 0.5
    //         settings.mCombinedRestitution = 0.5;
    //     };
    //     contactListener.OnContactPersisted = (body1, body2, manifold, settings) => {
    //         body1 = Jolt.wrapPointer(body1, Jolt.Body);
    //         body2 = Jolt.wrapPointer(body2, Jolt.Body);
    //         manifold = Jolt.wrapPointer(manifold, Jolt.ContactManifold);
    //         settings = Jolt.wrapPointer(settings, Jolt.ContactSettings);
    //         console.log('OnContactPersisted ' + body1.GetID().GetIndex() + ' ' + body2.GetID().GetIndex() + ' ' + manifold.mWorldSpaceNormal.ToString());

    //         // Override the restitution to 0.5
    //         settings.mCombinedRestitution = 0.5;
    //     };
    //     contactListener.OnContactRemoved = (subShapePair) => {
    //         subShapePair = Jolt.wrapPointer(subShapePair, Jolt.SubShapeIDPair);
    //         console.log('OnContactRemoved ' + subShapePair.GetBody1ID().GetIndex() + ' ' + subShapePair.GetBody2ID().GetIndex());
    //     };
    //     this.system.SetContactListener(contactListener);
    // }

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

    /**
     * Advance the physics simulation by deltaTime.
     * Clamped to 1/30 s to prevent the "spiral of death" on slow frames.
     */
    step(deltaTime: number): void {
        this.joltInterface.Step(Math.min(deltaTime, 1 / 30), 1);
    }
}
