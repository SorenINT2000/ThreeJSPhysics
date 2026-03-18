import * as THREE from 'three';

export class ConfigurableCamera {
    public camera: THREE.Camera;
    public target: THREE.Vector3;
    public position: THREE.Vector3;

    private updatePosition?: () => void;
    private updateTarget?: () => void;

    // "Initial" could mean permanent if its a reusable vector
    constructor(
        cameraObject: THREE.Camera,
        initialPosition: THREE.Vector3,
        initialTarget: THREE.Vector3,
        positionProvider?: (prev: THREE.Vector3) => THREE.Vector3,
        targetProvider?: (prev: THREE.Vector3) => THREE.Vector3,
    ) {

        this.camera = cameraObject;

        this.position = initialPosition;
        this.target = initialTarget;

        if (positionProvider)
            this.updatePosition = () => positionProvider(this.position)

        if (targetProvider)
            this.updateTarget = () => targetProvider(this.target)
        
        window.addEventListener('resize', () => {
            if (this.camera instanceof THREE.PerspectiveCamera) {
                this.camera.aspect = window.innerWidth / window.innerHeight;
                this.camera.updateProjectionMatrix();
            }
        });
        
        this.update();
    }

    public update() {
        if (this.updatePosition) this.updatePosition();
        if (this.updateTarget) this.updateTarget();

        this.camera.position.copy(this.position);
        this.camera.lookAt(this.target)
    }
}