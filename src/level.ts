import * as THREE from 'three';
import { PhysicsWorld, KinematicCharacter } from './physics';
import { RigidCuboid } from './rigidCuboid';
import { Player } from './player';
import { LightSource } from './lighting';
import { MovingCuboid } from './movingCuboid';

class Level extends THREE.Scene {
    private physicsWorld: PhysicsWorld;
    private staticCuboids: Array<RigidCuboid>;
    private kinematicCuboids: Array<MovingCuboid>;

    constructor(
        background: THREE.Color | THREE.Texture | THREE.CubeTexture | null,
        rigidCuboids: Array<RigidCuboid>,
        kinematicCuboids: Array<MovingCuboid>,
    ) {
        super();

        this.physicsWorld = new PhysicsWorld();
        this.add(new THREE.AmbientLight(0xffffff, 0.5));
        const lightSource = new LightSource(0xffffff, 1);
        this.add(lightSource);
        lightSource.setPos(0, 5, 0);

        this.background = background;

        this.staticCuboids = rigidCuboids;
        this.staticCuboids.forEach(obj => {
            super.add(obj);
            this.physicsWorld.createStaticCuboid(obj.halfExtents, obj.position);
        });

        this.kinematicCuboids = kinematicCuboids;
        this.kinematicCuboids.forEach(obj => {
            super.add(obj);
            this.physicsWorld.createKinematicCuboid(obj.halfExtents, obj.positionFn);
        });

        this.addFloor(-15);
    }

    public addFloor(yLevel: number): void {
        const floorGeom = new THREE.PlaneGeometry(500, 500, 1, 1).rotateX(-Math.PI / 2);
        const material = new THREE.MeshPhysicalMaterial({ color: 0xC7C7C7 });
        const floorObject = new THREE.Mesh(floorGeom, material)
        super.add(floorObject)
        floorObject.position.setY(yLevel);
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
