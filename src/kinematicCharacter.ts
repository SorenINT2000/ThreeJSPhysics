import { Jolt } from './jolt';
import { PhysicsWorld } from './physicsWorld';
import * as THREE from 'three';

export interface KinematicCharacterConfig {
    gravity?: number;
    moveSpeed?: number;
    jumpVelocity?: number;
}

/**
 * Wraps a Jolt CharacterVirtual with a simple move/jump API.
 * Hides Jolt filters, settings, Vec3 allocation, and ExtendedUpdate.
 */
export class KinematicCharacter {
    private character: typeof Jolt.CharacterVirtual.prototype;
    private physicsWorld: PhysicsWorld;
    private gravity: number;
    private moveSpeed: number;
    private jumpVelocity: number;
    private verticalVelocity = 0;

    // Jolt objects reused every frame — created once
    private readonly zeroGravity: typeof Jolt.Vec3.prototype;
    private readonly updateSettings: typeof Jolt.ExtendedUpdateSettings.prototype;
    private readonly bodyFilter: typeof Jolt.BodyFilter.prototype;
    private readonly shapeFilter: typeof Jolt.ShapeFilter.prototype;

    constructor(
        physicsWorld: PhysicsWorld,
        character: typeof Jolt.CharacterVirtual.prototype,
        config: KinematicCharacterConfig = {}
    ) {
        this.physicsWorld = physicsWorld;
        this.character = character;
        this.gravity = config.gravity ?? 200;
        this.moveSpeed = config.moveSpeed ?? 24;
        this.jumpVelocity = config.jumpVelocity ?? 40;

        this.zeroGravity = new Jolt.Vec3(0, 0, 0);
        this.updateSettings = new Jolt.ExtendedUpdateSettings();
        this.updateSettings.mStickToFloorStepDown = new Jolt.Vec3(0, -0.1, 0);
        this.updateSettings.mWalkStairsStepUp = new Jolt.Vec3(0, 0.4, 0);
        this.bodyFilter = new Jolt.BodyFilter();
        this.shapeFilter = new Jolt.ShapeFilter();
    }

    /**
     * Move and jump. Call each frame.
     * @param deltaTime Frame delta (seconds)
     * @param moveDir Normalized horizontal direction (-1..1). Will be scaled by moveSpeed.
     * @param jumpPressed True if jump key is pressed this frame.
     */
    update(deltaTime: number, moveDir: THREE.Vector3, jumpPressed: boolean): void {
        const horizontal = moveDir.clone().normalize().multiplyScalar(this.moveSpeed);

        const isGrounded = this.character.GetGroundState() === Jolt.EGroundState_OnGround;
        if (isGrounded) {
            if (this.verticalVelocity < 0) this.verticalVelocity = 0;
            if (jumpPressed) this.verticalVelocity = this.jumpVelocity;
        } else {
            this.verticalVelocity -= this.gravity * deltaTime;
        }

        const joltVel = new Jolt.Vec3(horizontal.x, this.verticalVelocity, horizontal.z);
        this.character.SetLinearVelocity(joltVel);
        Jolt.destroy(joltVel);

        this.physicsWorld.step(deltaTime);

        this.character.ExtendedUpdate(
            deltaTime,
            this.zeroGravity,
            this.updateSettings,
            this.physicsWorld.bpLayerFilter,
            this.physicsWorld.objLayerFilter,
            this.bodyFilter,
            this.shapeFilter,
            this.physicsWorld.tempAllocator
        );
    }

    /** Copy current position into the target Vector3. */
    syncPositionTo(target: THREE.Vector3): void {
        const pos = this.character.GetPosition();
        target.set(pos.GetX(), pos.GetY(), pos.GetZ());
    }
}
