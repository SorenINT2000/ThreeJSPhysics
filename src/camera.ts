import * as THREE from 'three';

/**
 * Providers decouple the source of data from the camera's application of that data.
 * The provider is now responsible for any smoothing (lerping) logic.
 */
export type VectorProvider = () => THREE.Vector3;
export type RotationProvider = () => { theta: number; phi: number };

export interface CameraConfig {
    /** Where the camera is physically located */
    positionProvider: VectorProvider;
    /** Where the camera is looking (Target Vector) */
    targetProvider: VectorProvider;
}

/**
 * Manages mouse input and provides rotation data.
 * This is now the "source of truth" for the look angle, independent of the camera.
 */
export class MouseLook {
    public state = {
        theta: 0,
        phi: Math.PI / 6
    };
    private isPointerLocked: boolean = false;

    constructor() {
        this.setupPointerLock();
    }

    private setupPointerLock() {
        window.addEventListener('mousedown', () => {
            if (!this.isPointerLocked) document.body.requestPointerLock();
        });

        document.addEventListener('pointerlockchange', () => {
            this.isPointerLocked = document.pointerLockElement === document.body;
        });

        window.addEventListener('mousemove', (e) => {
            if (!this.isPointerLocked) return;
            const sensitivity = 0.002;
            this.state.theta -= e.movementX * sensitivity;
            this.state.phi += e.movementY * sensitivity;
            this.state.phi = Math.max(0.1, Math.min(Math.PI / 2.1, this.state.phi));
        });
    }

    public getProvider(): RotationProvider {
        return () => ({ theta: this.state.theta, phi: this.state.phi });
    }
}

export class CameraFactory {
    /**
     * Orbital camera: Position is calculated as a function of target + rotation + distance.
     * Note: If you want this to be smooth, the calling code should wrap the returned 
     * provider in a lerping function.
     */
    static createOrbital(
        targetRef: VectorProvider,
        rotationRef: RotationProvider,
        distance: number,
        heightOffset: number,
        lookAtOffset: THREE.Vector3
    ): CameraConfig {
        return {
            positionProvider: () => {
                const target = targetRef();
                const { theta, phi } = rotationRef();
                
                const x = distance * Math.sin(theta) * Math.cos(phi);
                const y = distance * Math.sin(phi) + heightOffset;
                const z = distance * Math.cos(theta) * Math.cos(phi);

                return new THREE.Vector3(target.x + x, target.y + y, target.z + z);
            },
            targetProvider: () => {
                return targetRef().clone().add(lookAtOffset);
            }
        };
    }

    /**
     * Creates a top-down camera that follows a target from a fixed height.
     */
    static createTopDown(targetRef: VectorProvider, height: number): CameraConfig {
        return {
            positionProvider: () => {
                const target = targetRef();
                return new THREE.Vector3(target.x, target.y + height, target.z + 0.01);
            },
            targetProvider: targetRef
        };
    }
}

export class CameraManager {
    public camera: THREE.PerspectiveCamera;
    private config: CameraConfig;

    constructor(aspect: number, initialConfig: CameraConfig) {
        this.camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
        this.config = initialConfig;
    }

    public setConfig(config: CameraConfig) {
        this.config = config;
    }

    /**
     * The manager now strictly follows the providers. 
     * Smoothing is handled by the provider logic, not the manager.
     */
    public update() {
        this.camera.position.copy(this.config.positionProvider());
        this.camera.lookAt(this.config.targetProvider());
    }

    public onResize(width: number, height: number) {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    }
}