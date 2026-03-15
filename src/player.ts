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

        // Kinematic Position Based means we are responsible for moving it
        this.playerBodyDesc = RigidBodyDesc.kinematicPositionBased()
            .setTranslation(0, 5, 0)
            .enabledRotations(false, false, false);
            
        this.playerColliderDesc = ColliderDesc.cuboid(playerSize / 2, playerSize / 2, playerSize / 2);
    }

    attachToWorld(world: World): { playerBody: RigidBody, playerCollider: Collider, playerController: KinematicCharacterController } {
        // 0.1 is the offset to keep the character slightly above the ground to avoid jitter
        const playerController = world.createCharacterController(0.01);
        playerController.enableSnapToGround(0.5);
        playerController.enableAutostep(0.5, 0.2, true);

        const playerBody = world.createRigidBody(this.playerBodyDesc);
        const playerCollider = world.createCollider(this.playerColliderDesc, playerBody);

        return { playerBody, playerCollider, playerController };
    }

    public attachToScene(scene: Scene): void {
        scene.add(this.playerMesh);
    }
}

export { Player };