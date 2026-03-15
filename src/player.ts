import { Mesh, BoxGeometry, MeshStandardMaterial, Scene } from 'three';
import { World, RigidBodyDesc, RigidBody, ColliderDesc, Collider, KinematicCharacterController } from '@dimforge/rapier3d-compat';

class Player {
    public playerMesh: Mesh;

    private playerBodyDesc: RigidBodyDesc;
    private playerColliderDesc: ColliderDesc;

    constructor(playerSize: number) {
        this.playerMesh = new Mesh(
          new BoxGeometry(playerSize, playerSize, playerSize),
          new MeshStandardMaterial({ color: 0xff4444 }),
        );
        this.playerMesh.castShadow = true;
    
        this.playerBodyDesc = RigidBodyDesc.kinematicPositionBased()
          .setTranslation(0, 5, 0)
          .enabledRotations(false, false, false); // Keep the box upright
        this.playerColliderDesc = ColliderDesc.cuboid(playerSize / 2, playerSize / 2, playerSize / 2);
    }

    attachToWorld(world: World): { playerBody: RigidBody, playerCollider: Collider, playerController: KinematicCharacterController} {
        const playerController = world.createCharacterController(0.1);
        const playerBody = world.createRigidBody(this.playerBodyDesc);
        playerBody.wakeUp();
        const playerCollider = world.createCollider(this.playerColliderDesc, playerBody);

        return { playerBody, playerCollider, playerController };
    }
    
    public attachToScene(scene: Scene): void {
        scene.add(this.playerMesh);
    }
}

export { Player };