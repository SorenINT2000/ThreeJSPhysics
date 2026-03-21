import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { EnvironmentObject } from './environmentObject';
import { Player } from './player';
import { LightSource } from './lighting';

class Level extends THREE.Scene {
    private world: RAPIER.World;
    private environmentObjects: Array<EnvironmentObject>;
    public stepPhysics: (eventQueue?: RAPIER.EventQueue, hooks?: RAPIER.PhysicsHooks) => void;

    constructor(
        background: THREE.Color | THREE.Texture | THREE.CubeTexture | null,
        environmentObjects: Array<EnvironmentObject>
    ) {
            
        super();

        // Lighting
        this.add(new THREE.AmbientLight(0xffffff, 0.5));
        const lightSource = new LightSource(0xffffff, 1);
        this.add(lightSource);
        lightSource.setPos(0, 5, 0);

        this.background = background

        this.world = new RAPIER.World({ x: 0.0, y: -9.81, z: 0.0 });

        this.environmentObjects = environmentObjects;
        this.stepPhysics =  (eventQueue?: RAPIER.EventQueue, hooks?: RAPIER.PhysicsHooks) => this.world.step(eventQueue, hooks);

        this.environmentObjects.forEach(obj => this.addWithPhysics(obj))
    }

    public addWithPhysics(object: EnvironmentObject): RAPIER.RigidBody {
        super.add(object);

        this.environmentObjects.push(object);
        
        const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(...object.position.toArray());
        const body = this.world.createRigidBody(bodyDesc);
        this.world.createCollider(object.colliderDesc, body);
        object.rigidBody = body;

        return body;
    }


    public addPlayer(player: Player): { playerBody: RAPIER.RigidBody, playerCollider: RAPIER.Collider, playerController: RAPIER.KinematicCharacterController } {
        this.add(player);
        

        const playerBody = this.world.createRigidBody(player.playerBodyDesc);
        const playerCollider = this.world.createCollider(player.playerColliderDesc, playerBody);

        // 0.1 is the offset to keep the character slightly above the ground to avoid jitter
        const playerController = this.world.createCharacterController(0.05);

        playerController.enableSnapToGround(0.1);
        playerController.setSlideEnabled(true);
        playerController.enableAutostep(0.5, 0.2, true);

        return { playerBody, playerCollider, playerController };
    }
}

export { Level };