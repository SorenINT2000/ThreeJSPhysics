import * as THREE from 'three';

export class LookState {
    public state: THREE.Spherical
    public setLookVector = (oldDirection: THREE.Vector3) =>
        this.state ? oldDirection.setFromSpherical(this.state).normalize() : oldDirection;

    constructor(defaultPhi: number = Math.PI / 2, defaultTheta: number = 0) {
        this.state = new THREE.Spherical(1, defaultPhi, defaultTheta);
    }
}


export class KeyboardControls {

}