import * as THREE from 'three';

class ConfigurableCamera {
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

const topDownCamera = () => new ConfigurableCamera(
    new THREE.OrthographicCamera(-10, 10, 10, -10, 1, 1000),
    new THREE.Vector3(0, 20, 0),
    new THREE.Vector3(0, 0, 0)
);

interface HasPosition {
    position: THREE.Vector3;
}
const topDownCameraFollow = (object: HasPosition) => new ConfigurableCamera(
    new THREE.OrthographicCamera(-10, 10, 10, -10, 1, 1000),
    new THREE.Vector3(0, 20, 0).add(object.position),
    new THREE.Vector3(0, 0, 0),
    (prev) => { prev.setX(object.position.x); prev.setZ(object.position.z); return prev; },
    (prev) => { prev.setX(object.position.x); prev.setZ(object.position.z); return prev; }
)

interface HasLookDirection {
    lookDirection: THREE.Vector3;
    worldToLocal: (worldVec: THREE.Vector3) => THREE.Vector3;
}


const firstPersonCamera = (player: HasPosition & HasLookDirection) => new ConfigurableCamera(
    new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000),
    player.position,
    player.lookDirection,
);

const thirdPersonCamera = (player: HasPosition & HasLookDirection) => {
    return new ConfigurableCamera(
        new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000),
        player.position.clone().addScaledVector(player.lookDirection, -10),
        player.position,
        (prev) => prev.copy(player.position).addScaledVector(player.lookDirection, -10)
    );
};

const Cameras = { topDownCamera, topDownCameraFollow, firstPersonCamera, thirdPersonCamera }

export { ConfigurableCamera, Cameras }