import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { BloomPass } from 'three/examples/jsm/postprocessing/BloomPass.js';
import { FilmPass } from 'three/examples/jsm/postprocessing/FilmPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';


class ConfigurableRenderer {
    public renderer: THREE.WebGLRenderer;
    private composer: EffectComposer;
    private passes: Pass[];

    constructor(scene: THREE.Scene, camera: THREE.Camera) {
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        document.body.appendChild(this.renderer.domElement);
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;

        this.composer = new EffectComposer(this.renderer);

        this.passes = [];   
        this.passes.push(new RenderPass(scene, camera));
        // this.passes.push(new BloomPass(0.6));
        // this.passes.push(new FilmPass(1, true));
        this.passes.push(new OutputPass());

        this.passes.forEach(pass => this.composer.addPass(pass));
    }

    public render() {
        this.composer.render();
    }
}

export { ConfigurableRenderer }