import * as THREE from 'three';

class LookState {
    public state: THREE.Spherical
    public setLookVector = (oldDirection: THREE.Vector3) =>
        this.state ? oldDirection.setFromSpherical(this.state).normalize() : oldDirection;

    constructor(defaultPhi: number = Math.PI / 2, defaultTheta: number = 0) {
        this.state = new THREE.Spherical(1, defaultPhi, defaultTheta);
    }
}


class KeyboardState {
    private allowedKeys: Array<string>;
    public state: Record<string, boolean> = {};

    constructor(allowedKeys: Array<string>) {
        this.allowedKeys = allowedKeys;

        // console.log(allowedKeys.includes("Space"))

        window.addEventListener('keydown', (e) => {
            if (this.allowedKeys.includes(e.code))
                this.state[e.code] = true;
        });

        window.addEventListener('keyup', (e) => {
            if (this.allowedKeys.includes(e.code))
                this.state[e.code] = false;
        });
    }

}

export { LookState, KeyboardState }