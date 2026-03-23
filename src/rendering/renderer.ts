import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

import { ConfigurableCamera } from './camera';
import { DebugRenderer } from './debugRenderer';

import { Level } from '../level.ts';

class ConfigurableRenderer {
    public camera: ConfigurableCamera;
    public renderer: THREE.WebGLRenderer;
    private composer: EffectComposer;
    private passes: Pass[];
    private debugEnabled: boolean = false;
    private debugRenderer: DebugRenderer | null;

    constructor(
        level: Level,
        camera: ConfigurableCamera,
        debugRenderer: DebugRenderer | null = null,
        fullscreen: boolean = false,
        width?: number, height?: number
    ) {
        this.camera = camera;
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        document.body.appendChild(this.renderer.domElement);
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.shadowMap.enabled = true;
        
        if (fullscreen) {
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            window.addEventListener('resize', () => {
                this.renderer.setSize(window.innerWidth, window.innerHeight);
            });
        } else if (width && height) {
            this.renderer.setSize(width, height);
        }

        this.composer = new EffectComposer(this.renderer);

        this.passes = [];   
        this.passes.push(new RenderPass(level, this.camera.camera));
        // this.passes.push(new BloomPass(0.6));
        // this.passes.push(new FilmPass(1, true));
        this.passes.push(new OutputPass());

        this.passes.forEach(pass => this.composer.addPass(pass));

        this.debugRenderer = debugRenderer;
        if (this.debugRenderer) {
            window.addEventListener('keydown', (e) => {
                if (e.code === 'F3') {
                    e.preventDefault();
                    this.debugEnabled = !this.debugEnabled;
                    console.log("debug mode: ", this.debugEnabled ? "on" : "off")
                }
            });
        }
    }

    public toggleDebugRenderer(on?: boolean) {
        this.debugEnabled = on ?? !this.debugEnabled;
    }

    public render() {
        this.composer.render();

        if (this.debugRenderer && this.debugEnabled) {
            this.debugRenderer.render(this.renderer, this.camera.camera);
        }
    }
}

export { ConfigurableRenderer }