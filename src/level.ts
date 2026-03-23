import * as THREE from 'three';
import { PhysicsWorld, KinematicCharacter } from './physics';
import { EnvironmentObject } from './environmentObject';
import { Player } from './player';
import { LightSource } from './lighting';

class Level extends THREE.Scene {
    public physicsWorld: PhysicsWorld;
    private environmentObjects: Array<EnvironmentObject>;

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

        this.addFloor(-15);
    }

    /** Dynamically add a static physics object to the scene at runtime. */
    public addWithPhysics(object: EnvironmentObject): void {
        super.add(object);
        this.environmentObjects.push(object);
        this.physicsWorld.createStaticBody(object.halfExtents, object.position);
    }

    public addFloor(yLevel: number): void {
        const floorGeom = new THREE.PlaneGeometry(500, 500, 1, 1).rotateX(-Math.PI / 2);
        const material = new THREE.MeshPhysicalMaterial({ color: 0xC7C7C7 });
        const floorObject = new THREE.Mesh(floorGeom, material)
        super.add(floorObject)
        floorObject.position.setY(yLevel);
        // this.physicsWorld.createFloor(yLevel);
    }

    /**
     * Add the local player to the scene and return a KinematicCharacter.
     * Update it each frame via kinematicCharacter.update(dt, moveDir, jumpPressed).
     */
    public spawn(player: Player): { kinematicCharacter: KinematicCharacter } {
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
