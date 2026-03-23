import * as THREE from 'three';

const defaultMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x88ccff,
    metalness: 0,
    roughness: 0,
    transmission: 0.5,
    thickness: 0.5,
    transparent: true,
    opacity: 0.4,
    envMapIntensity: 1,
    clearcoat: 1,
    clearcoatRoughness: 0
});

export class RigidCuboid extends THREE.Object3D {
    public mesh: THREE.Mesh;
    public halfExtents: THREE.Vector3;

    constructor(
        geometry: THREE.BufferGeometry,
        halfExtents: THREE.Vector3,
        position?: THREE.Vector3,
        material: THREE.Material = defaultMaterial,
    ) {
        super();

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;

        this.add(this.mesh);
        this.halfExtents = halfExtents;

        if (position)
            this.position.copy(position);
    }

    public setPosition(newPos: THREE.Vector3) {
        this.position.copy(newPos);
    }
}
