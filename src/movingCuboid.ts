import * as THREE from 'three';
import { RigidCuboid } from './rigidCuboid';
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

export class MovingCuboid extends RigidCuboid {
    public positionFn: (time: number) => THREE.Vector3;
    constructor(
        geometry: THREE.BufferGeometry,
        halfExtents: THREE.Vector3,
        positionFn: (positionVec: THREE.Vector3, time: number) => THREE.Vector3,
        material: THREE.Material = defaultMaterial,
    ) {
        super(geometry, halfExtents, positionFn(new THREE.Vector3(), 0), material);
        this.positionFn = (time: number) => positionFn(this.position, time);
    }
}
