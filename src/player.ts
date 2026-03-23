import * as THREE from 'three';
import { Mesh, BoxGeometry, MeshStandardMaterial, Object3D, Line, LineBasicMaterial, BufferGeometry, Float32BufferAttribute } from 'three';

class Player extends Object3D {
    public playerMesh: Mesh;
    public lookLine: Line;
    /** Half-extents of the player's box collider (x, y, z). */
    public halfExtents: THREE.Vector3;

    /** Unit look direction in **world** space (from controls / camera). */
    public lookDirection: THREE.Vector3 = new THREE.Vector3();
    public forwardDirection: THREE.Vector3 = new THREE.Vector3();
    public rightDirection: THREE.Vector3 = new THREE.Vector3();

    // Player state
    public velocity: THREE.Vector3;
    public playerDead: boolean;

    private readonly lookLineLength = 2;
    private readonly worldQuatScratch = new THREE.Quaternion();
    private readonly localLookEndScratch = new THREE.Vector3();

    constructor(playerSize: number, position: THREE.Vector3, velocity: THREE.Vector3) {
        super();

        const half = playerSize / 2;
        this.halfExtents = new THREE.Vector3(half, half, half);

        this.playerMesh = new Mesh(
            new BoxGeometry(playerSize, playerSize, playerSize),
            new MeshStandardMaterial({ color: 0xff4444 }),
        );
        this.playerMesh.castShadow = true;

        this.position.copy(position);
        this.velocity = new THREE.Vector3().copy(velocity);
        this.lookDirection.set(0, 0, 1);
        this.forwardDirection.copy(this.lookDirection).setY(0).normalize();
        this.rightDirection.set(-this.forwardDirection.z, 0, this.forwardDirection.x);

        const lineMaterial = new LineBasicMaterial({ color: 0x000000 });
        const positions = new Float32Array(6);
        const lineGeometry = new BufferGeometry();
        lineGeometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
        this.lookLine = new Line(lineGeometry, lineMaterial);
        /** Line is drawn in player-local space; scene graph applies world transform — no lookAt. */
        this.lookLine.frustumCulled = false;

        super.add(this.playerMesh);
        super.add(this.lookLine);
        this.playerDead = false;
    }

    public updateLookFromDirection(dir: THREE.Vector3) {
        this.lookDirection.copy(dir).normalize();
        this.forwardDirection.copy(this.lookDirection).setY(0).normalize();
        if (this.forwardDirection.lengthSq() < 1e-6) {
            this.forwardDirection.set(0, 0, 1);
        }
        this.rightDirection.set(-this.forwardDirection.z, 0, this.forwardDirection.x);
    }

    /**
     * Updates the look line geometry in **player-local** space.
     * `lookDirection` is world-space; we rotate it by the inverse world rotation so the segment
     * (0 → local end) aims correctly when the player Object3D is transformed.
     */
    public updateVisuals() {
        this.getWorldQuaternion(this.worldQuatScratch).invert();
        this.localLookEndScratch
            .copy(this.lookDirection)
            .applyQuaternion(this.worldQuatScratch)
            .multiplyScalar(this.lookLineLength);

        const pos = this.lookLine.geometry.attributes.position as THREE.BufferAttribute;
        pos.setXYZ(0, 0, 0, 0);
        pos.setXYZ(1, this.localLookEndScratch.x, this.localLookEndScratch.y, this.localLookEndScratch.z);
        pos.needsUpdate = true;
    }
}

export { Player };
