import * as THREE from 'three';
import { PhysicsWorld } from './physicsWorld';
import { EnvironmentObject } from './environmentObject';
import { Player } from './player';
import { LightSource } from './lighting';
import { KinematicCharacter } from './kinematicCharacter';

class Level extends THREE.Scene {
    private physicsWorld: PhysicsWorld;
    private environmentObjects: Array<EnvironmentObject>;
    private playerCharacter: any = null; // Track the character for debug drawing

    constructor(
        background: THREE.Color | THREE.Texture | THREE.CubeTexture | null,
        environmentObjects: Array<EnvironmentObject>
    ) {
        super();

        this.physicsWorld = new PhysicsWorld();
        this.add(new THREE.AmbientLight(0xffffff, 0.5));
        const lightSource = new LightSource(0xffffff, 1);
        this.add(lightSource);
        lightSource.setPos(0, 5, 0);

        this.background = background;

        this.environmentObjects = environmentObjects;
        this.environmentObjects.forEach(obj => {
            super.add(obj);
            this.physicsWorld.createStaticBody(obj.halfExtents, obj.position);
        });
    }

    /** Dynamically add a static physics object to the scene at runtime. */
    public addWithPhysics(object: EnvironmentObject): void {
        super.add(object);
        this.environmentObjects.push(object);
        this.physicsWorld.createStaticBody(object.halfExtents, object.position);
    }

    /**
     * Add the local player to the scene and return a KinematicCharacter.
     * Update it each frame via kinematicCharacter.update(dt, moveDir, jumpPressed).
     */
    public addPlayer(player: Player): { kinematicCharacter: KinematicCharacter } {
        super.add(player);
        const character = this.physicsWorld.createCharacter(player.halfExtents, player.position);
        const kinematicCharacter = new KinematicCharacter(this.physicsWorld, character);
        return { kinematicCharacter };
    }

    /** Advance physics. Delegates to PhysicsWorld. */
    public stepPhysics(deltaTime: number): void {
        this.physicsWorld.step(deltaTime);
    }

    /** Expose PhysicsWorld for filters/allocator used in character update. */
    public get physics(): PhysicsWorld {
        return this.physicsWorld;
    }
}

export { Level };
