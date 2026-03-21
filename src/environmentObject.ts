import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d-compat';

const defaultMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x88ccff,
    metalness: 0,
    roughness: 0,
    transmission: 0.5, // High transmission for glass-like look
    thickness: 0.5,
    transparent: true,
    opacity: 0.4,
    envMapIntensity: 1,
    clearcoat: 1,
    clearcoatRoughness: 0
});

export class EnvironmentObject extends THREE.Object3D {
    public mesh: THREE.Mesh;
    public colliderDesc: RAPIER.ColliderDesc;
    /** Set by Level.addWithPhysics. Used by setPosition to keep physics in sync. */
    public rigidBody: RAPIER.RigidBody | null = null;

    constructor(
        geometry: THREE.BufferGeometry,
        colliderDesc: RAPIER.ColliderDesc,
        position?: THREE.Vector3,
        material: THREE.Material = defaultMaterial,
    ) {
        super();

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        
        this.add(this.mesh);
        
        this.colliderDesc = colliderDesc;

        if (!position) return;

        this.position.copy(position);
    }

    public setPosition(newPos: THREE.Vector3) {
        this.position.copy(newPos);
        this.rigidBody?.setTranslation({ x: newPos.x, y: newPos.y, z: newPos.z }, true);
    }
}