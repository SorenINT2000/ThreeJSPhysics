import * as THREE from 'three';
import { Mesh, BoxGeometry, MeshStandardMaterial, Object3D, Line } from 'three';
import { MouseState } from './input';

class Player extends Object3D {
    public playerMesh: Mesh;
    public lookLine: Line;
    /** Half-extents of the player's box collider (x, y, z). */
    public halfExtents: THREE.Vector3;

    public velocity: THREE.Vector3;

    private lookProvider: (oldDirection: THREE.Vector3) => THREE.Vector3;

    public lookDirection: THREE.Vector3 = new THREE.Vector3();
    public forwardDirection: THREE.Vector3 = new THREE.Vector3();
    public rightDirection: THREE.Vector3 = new THREE.Vector3();

    constructor(playerSize: number, position: THREE.Vector3, velocity: THREE.Vector3, lookState: MouseState) {
        super();

        const half = playerSize / 2;
        this.halfExtents = new THREE.Vector3(half, half, half);

        this.playerMesh = new Mesh(
            new BoxGeometry(playerSize, playerSize, playerSize),
            new MeshStandardMaterial({ color: 0xff4444 }),
        );
        this.playerMesh.castShadow = true;

        this.position.copy(position);
        this.velocity = velocity;
        this.lookProvider = (oldDirection: THREE.Vector3) => lookState.setLookVector(oldDirection).normalize();
        this.lookDirection = this.lookProvider(new THREE.Vector3(0, 0, 1));
        this.forwardDirection.copy(this.lookDirection).setY(0).normalize();
        this.rightDirection.set(-this.forwardDirection.z, 0, this.forwardDirection.x);

        const lineMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
        const lineGeometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(),
            new THREE.Vector3().copy(this.lookDirection).multiplyScalar(2)
        ]);
        this.lookLine = new THREE.Line(lineGeometry, lineMaterial);

        super.add(this.playerMesh);
        super.add(this.lookLine);
    }

    public updateLookFromState(state: THREE.Spherical) {
        this.lookDirection.setFromSpherical(state);
        this.forwardDirection.copy(this.lookDirection).setY(0).normalize();
        this.rightDirection.set(-this.forwardDirection.z, 0, this.forwardDirection.x);
    }

    public updateVisuals() {
        this.lookLine.lookAt(this.localToWorld(this.lookDirection));
    }
}

export { Player };
