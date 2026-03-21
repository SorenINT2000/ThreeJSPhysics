import * as THREE from 'three';

class MouseState {
    public lookState: THREE.Spherical;
    public focusState: boolean = false;
    public setLookVector = (oldDirection: THREE.Vector3) =>
        this.lookState ? oldDirection.setFromSpherical(this.lookState).normalize() : oldDirection;

    constructor(defaultPhi: number = Math.PI / 2, defaultTheta: number = 0, minPitch: number = 0.1, maxPitch: number = Math.PI - 0.1) {
        this.lookState = new THREE.Spherical(1, defaultPhi, defaultTheta);
        
        window.addEventListener('mousedown', () => {
            if (!this.focusState) document.body.requestPointerLock();
        });

        document.addEventListener('pointerlockchange', () => {
            this.focusState = document.pointerLockElement === document.body;
        });

        window.addEventListener('mousemove', (e) => {
            if (!this.focusState) return;

            const sensitivity = 0.002;
            
            this.lookState.theta -= e.movementX * sensitivity; // Yaw
            this.lookState.phi += e.movementY * sensitivity; // Pitch

            this.lookState.phi = Math.max(minPitch, Math.min(maxPitch, this.lookState.phi));
        });
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

export { MouseState, KeyboardState }