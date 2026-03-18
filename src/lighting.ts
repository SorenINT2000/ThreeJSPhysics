import * as THREE from 'three'

class LightSource extends THREE.Object3D {
    private light: THREE.DirectionalLight
    private debugShapeOn: boolean = true;
    private debugShape: THREE.DirectionalLightHelper;

    constructor(color: THREE.ColorRepresentation, intensity: number) {
        super()
        this.light = new THREE.DirectionalLight(color, intensity);
        this.debugShape =  new THREE.DirectionalLightHelper(this.light, 5);

        const shadowSize = 30;
        this.light.shadow.camera.left = -shadowSize;
        this.light.shadow.camera.right = shadowSize;
        this.light.shadow.camera.top = shadowSize;
        this.light.shadow.camera.bottom = -shadowSize;
        this.light.shadow.camera.near = 0.5;
        this.light.shadow.camera.far = 100;
        this.light.castShadow = true;

        this.add(this.light, this.debugShape);
    }

    public toggleLight(on?: boolean): void {
        if (on === undefined)
            this.light.visible = !this.light.visible;
        else
            this.light.visible = on;
    }

    public toggleDebugShape(on?: boolean) {
        if (on === undefined)
            this.debugShape.visible = !this.debugShapeOn;
        else
            this.debugShape.visible = on;
    }

    public setPos(x: number, y: number, z: number) {
        this.position.set(x, y, z);
        this.debugShape.update();
    }
}

export { LightSource }