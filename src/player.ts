import * as THREE from 'three';
import { Mesh, BoxGeometry, MeshStandardMaterial, Scene, Object3D, Line } from 'three';
import { World, RigidBodyDesc, RigidBody, ColliderDesc, Collider, KinematicCharacterController } from '@dimforge/rapier3d-compat';
import { LookState } from './input';

class Player extends Object3D {
    private playerMesh: Mesh;
    private lookLine: Line;
    private playerBodyDesc: RigidBodyDesc;
    private playerColliderDesc: ColliderDesc;

    // Non-visual Data
    // public position: THREE.Vector3; (inherited from Object3D)
    public velocity: THREE.Vector3;

    private lookProvider: (oldDirection: THREE.Vector3) => THREE.Vector3;

    public lookDirection: THREE.Vector3 = new THREE.Vector3();
    public forwardDirection: THREE.Vector3 = new THREE.Vector3();
    public rightDirection: THREE.Vector3 = new THREE.Vector3();

    constructor(playerSize: number, position: THREE.Vector3, velocity: THREE.Vector3, lookState: LookState) {
        super();

        // Setup
        this.playerMesh = new Mesh(
            new BoxGeometry(playerSize, playerSize, playerSize),
            new MeshStandardMaterial({ color: 0xff4444 }),
        );
        this.playerMesh.castShadow = true;
        this.playerBodyDesc = RigidBodyDesc.kinematicPositionBased();
        this.playerColliderDesc = ColliderDesc.cuboid(playerSize / 2, playerSize / 2, playerSize / 2);

        // Set internal state
        this.position.copy(position);
        this.velocity = velocity;
        this.lookProvider = (oldDirection: THREE.Vector3) => lookState.setLookVector(oldDirection).normalize()
        this.lookDirection = this.lookProvider(new THREE.Vector3(0, 0, 1));
        this.forwardDirection.copy(this.lookDirection).setY(0).normalize();
        this.rightDirection.set(-this.forwardDirection.z, 0, this.forwardDirection.x);

        // Look Direction Visualizer
        const lineMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
        const lineGeometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(),
            new THREE.Vector3().copy(this.lookDirection).multiplyScalar(2)
        ]);
        this.lookLine = new THREE.Line(lineGeometry, lineMaterial);
        
        super.add(this.playerMesh);
        super.add(this.lookLine);
    }

    public attachToWorld(world: World): { playerBody: RigidBody, playerCollider: Collider, playerController: KinematicCharacterController } {
        // 0.1 is the offset to keep the character slightly above the ground to avoid jitter
        const playerController = world.createCharacterController(0.01);
        playerController.enableSnapToGround(0.5);
        // playerController.enableAutostep(0.5, 0.2, true);

        const playerBody = world.createRigidBody(this.playerBodyDesc);
        const playerCollider = world.createCollider(this.playerColliderDesc, playerBody);

        return { playerBody, playerCollider, playerController };
    }

    public attachToScene(scene: Scene): void {
        scene.add(this);
    }

    public updateLookFromState(state: THREE.Spherical) {
        this.lookDirection.setFromSpherical(state);
        this.forwardDirection.copy(this.lookDirection).setY(0).normalize();
        // this.rightDirection.crossVectors(this.forwardDirection, new THREE.Vector3(0, 1, 0));
        this.rightDirection.set(-this.forwardDirection.z, 0, this.forwardDirection.x);
    }

    public updateVisuals() {
        // if (Math.abs(this.velocity.x) > 0.001 || Math.abs(this.velocity.z) > 0.001) {
        //     this.rotation.y = Math.atan2(this.velocity.x, this.velocity.z);
        // }
        this.lookLine.lookAt(this.localToWorld(this.lookDirection));
        
        // console.log(this.worldToLocal(this.lookDirection));
    }
}

export { Player };