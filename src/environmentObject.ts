import * as THREE from 'three';
import { World, RigidBodyDesc, ColliderDesc, RigidBody } from '@dimforge/rapier3d-compat';

/**
 * A class to create interactive, glass-like rigid bodies in the scene.
 */
export class EnvironmentObject {
    public mesh: THREE.Mesh;
    public body: RigidBody;

    constructor(
        world: World,
        scene: THREE.Scene,
        position: THREE.Vector3,
        size: THREE.Vector3 = new THREE.Vector3(2, 2, 2),
        color: number = 0x88ccff
    ) {
        // 1. Create the Visual (Three.js)
        const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
        const material = new THREE.MeshPhysicalMaterial({
            color: color,
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

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(position);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        scene.add(this.mesh);

        // 2. Create the Physics (Rapier)
        const bodyDesc = RigidBodyDesc.fixed() // Fixed means it won't fall, but objects can hit it
            .setTranslation(position.x, position.y, position.z);
        
        this.body = world.createRigidBody(bodyDesc);
        
        const colliderDesc = ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2);
        world.createCollider(colliderDesc, this.body);
    }

    /**
     * Call this if the object needs to move (e.g. kinematic platforms)
     */
    public update() {
        const t = this.body.translation();
        this.mesh.position.set(t.x, t.y, t.z);
        const r = this.body.rotation();
        this.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
}