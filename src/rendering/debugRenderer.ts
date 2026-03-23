import * as THREE from 'three';
import { CSS3DRenderer, CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import { Jolt } from '../physics';

type JoltVec3 = { GetX: () => number; GetY: () => number; GetZ: () => number };

const wrapVec3 = (v: JoltVec3): THREE.Vector3 =>
    new THREE.Vector3(v.GetX(), v.GetY(), v.GetZ());

const textDecoder = new TextDecoder();

/**
 * Jolt debug renderer bridge — draws physics shapes as Three.js wireframes/meshes.
 * Requires the debug build of jolt-physics (DebugRendererJS).
 */
export class DebugRenderer {
    private debugScene: THREE.Scene;
    private physicsSystem: typeof Jolt.PhysicsSystem.prototype;
    private debugGroup: THREE.Group;

    private materialCache: Record<string, THREE.MeshStandardMaterial> = {};
    private lineCache: Record<number, THREE.Vector3[]> = {};
    private lineMesh: Record<number, THREE.LineSegments> = {};
    private triangleCache: Record<number, THREE.Vector3[]> = {};
    private triangleMesh: Record<number, THREE.Mesh> = {};
    private meshList: THREE.Mesh[] = [];
    private geometryList: Array<{
        matrix: THREE.Matrix4;
        geometry: THREE.BufferGeometry | undefined;
        color: number;
        drawMode: number;
        cullMode: number;
    }> = [];
    private geometryCache: THREE.BufferGeometry[] = [];
    private textCache: InstanceType<typeof CSS3DObject>[] = [];
    private textList: Array<{ color: number; position: THREE.Vector3; height: number; text: string }> = [];

    private joltRenderer: unknown;
    private css3dRender: CSS3DRenderer | null = null;
    private initialized = false;

    private bodyDrawSettings: unknown;

    constructor(physicsSystem: typeof Jolt.PhysicsSystem.prototype) {
        this.physicsSystem = physicsSystem;

        this.debugGroup = new THREE.Group();
        this.debugScene = new THREE.Scene()
        this.debugScene.add(this.debugGroup);
        this.debugScene.add(new THREE.AmbientLight(0xffffff, 10));

        const j = Jolt as unknown as { DebugRendererJS: new () => Record<string, unknown>; BodyManagerDrawSettings: new () => unknown };
        this.joltRenderer = new j.DebugRendererJS();
        const r = this.joltRenderer as Record<string, (...args: unknown[]) => unknown>;
        r.DrawLine = this.drawLine.bind(this) as (...args: unknown[]) => unknown;
        r.DrawTriangle = this.drawTriangle.bind(this) as (...args: unknown[]) => unknown;
        r.DrawText3D = this.drawText3D.bind(this) as (...args: unknown[]) => unknown;
        r.DrawGeometryWithID = this.drawGeometryWithID.bind(this) as (...args: unknown[]) => unknown;
        r.CreateTriangleBatchID = this.createTriangleBatchID.bind(this) as (...args: unknown[]) => unknown;
        r.CreateTriangleBatchIDWithIndex = this.createTriangleBatchIDWithIndex.bind(this) as (...args: unknown[]) => unknown;

        this.bodyDrawSettings = new j.BodyManagerDrawSettings();
        (this.bodyDrawSettings as Record<string, boolean>).mDrawShape = true;
        (this.bodyDrawSettings as Record<string, boolean>).mDrawShapeWireframe = true;
    }

    Initialize(): void {
        if (!this.initialized) {
            (this.joltRenderer as { Initialize: () => void }).Initialize();
            this.initialized = true;
        }
    }

    DrawBodies(system: unknown, inDrawSettings: unknown): void {
        (this.joltRenderer as { DrawBodies: (s: unknown, d: unknown) => void }).DrawBodies(system, inDrawSettings);
    }

    DrawConstraints(system: unknown): void {
        (this.joltRenderer as { DrawConstraints: (s: unknown) => void }).DrawConstraints(system);
    }

    DrawConstraintLimits(system: unknown): void {
        (this.joltRenderer as { DrawConstraintLimits: (s: unknown) => void }).DrawConstraintLimits(system);
    }

    private unwrapV3(ptr: number): THREE.Vector3 {
        const j = Jolt as unknown as { wrapPointer: (p: number, t: unknown) => JoltVec3; RVec3: unknown };
        return wrapVec3(j.wrapPointer(ptr, j.RVec3));
    }

    private drawLine(inFrom: number, inTo: number, inColor: number): void {
        const j = Jolt as unknown as { wrapPointer: (p: number, t: unknown) => { mU32: number }; Color: unknown };
        const colorU32 = j.wrapPointer(inColor, j.Color).mU32 >>> 0;
        const arr = (this.lineCache[colorU32] = this.lineCache[colorU32] || []);
        arr.push(this.unwrapV3(inFrom), this.unwrapV3(inTo));
    }

    private drawTriangle(inV1: number, inV2: number, inV3: number, inColor: number): void {
        const j = Jolt as unknown as { wrapPointer: (p: number, t: unknown) => { mU32: number }; Color: unknown };
        const colorU32 = j.wrapPointer(inColor, j.Color).mU32 >>> 0;
        const arr = (this.lineCache[colorU32] = this.lineCache[colorU32] || []);
        const v0 = this.unwrapV3(inV1);
        const v1 = this.unwrapV3(inV2);
        const v2 = this.unwrapV3(inV3);
        arr.push(v0, v1, v1, v2, v2, v0);
    }

    private drawText3D(inPosition: number, inStringPtr: number, inStringLen: number, inColor: number, inHeight: number): void {
        const j = Jolt as unknown as { wrapPointer: (p: number, t: unknown) => { mU32: number }; Color: unknown; HEAPU8: Uint8Array };
        const color = j.wrapPointer(inColor, j.Color).mU32 >>> 0;
        const position = this.unwrapV3(inPosition);
        const text = textDecoder.decode(j.HEAPU8.subarray(inStringPtr, inStringPtr + inStringLen));
        this.textList.push({ color, position, height: inHeight, text });
    }

    private drawGeometryWithID(
        inModelMatrix: number,
        _inWorldSpaceBounds: number,
        _inLODScaleSq: number,
        inModelColor: number,
        inGeometryID: number,
        inCullMode: number,
        _inCastShadow: number,
        inDrawMode: number
    ): void {
        const j = Jolt as unknown as {
            wrapPointer: (p: number, t: unknown) => { mU32: number } | (JoltVec3 & {
                GetAxisX: () => JoltVec3;
                GetAxisY: () => JoltVec3;
                GetAxisZ: () => JoltVec3;
                GetTranslation: () => JoltVec3;
            });
            Color: unknown;
            RMat44: unknown;
        };
        const colorU32 = (j.wrapPointer(inModelColor, j.Color) as { mU32: number }).mU32 >>> 0;
        const modelMatrix = j.wrapPointer(inModelMatrix, j.RMat44) as {
            GetAxisX: () => JoltVec3;
            GetAxisY: () => JoltVec3;
            GetAxisZ: () => JoltVec3;
            GetTranslation: () => JoltVec3;
        };
        const v0 = wrapVec3(modelMatrix.GetAxisX());
        const v1 = wrapVec3(modelMatrix.GetAxisY());
        const v2 = wrapVec3(modelMatrix.GetAxisZ());
        const v3 = wrapVec3(modelMatrix.GetTranslation());
        const matrix = new THREE.Matrix4().makeBasis(v0, v1, v2).setPosition(v3);
        this.geometryList.push({
            matrix,
            geometry: this.geometryCache[inGeometryID],
            color: colorU32,
            drawMode: inDrawMode,
            cullMode: inCullMode,
        });
    }

    private createTriangleBatchID(inTriangles: number, inTriangleCount: number): number {
        const batchID = this.geometryCache.length;
        const traits = (Jolt as unknown as { DebugRendererVertexTraits: { prototype: { mPositionOffset: number; mNormalOffset: number; mUVOffset: number; mSize: number } } }).DebugRendererVertexTraits.prototype;
        const triTraits = (Jolt as unknown as { DebugRendererTriangleTraits: { prototype: { mVOffset: number; mSize: number } } }).DebugRendererTriangleTraits.prototype;
        const { mPositionOffset, mNormalOffset, mUVOffset, mSize } = traits;
        const interleaveBufferF32 = new Float32Array((inTriangleCount * 3 * mSize) / 4);

        const heapF32 = (Jolt as unknown as { HEAPF32: Float32Array }).HEAPF32;
        if (triTraits.mVOffset === 0 && triTraits.mSize === mSize * 3) {
            interleaveBufferF32.set(new Float32Array(heapF32.buffer, inTriangles, interleaveBufferF32.length));
        } else {
            const vertexChunk = (mSize / 4) * 3;
            for (let i = 0; i < inTriangleCount; i++) {
                const triOffset = inTriangles + i * triTraits.mSize + triTraits.mVOffset;
                const chunk = new Float32Array(heapF32.buffer, triOffset, vertexChunk);
                interleaveBufferF32.set(chunk, i * vertexChunk);
            }
        }

        const geometry = new THREE.BufferGeometry();
        const interleavedBuffer = new THREE.InterleavedBuffer(interleaveBufferF32, mSize / 4);
        geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(interleavedBuffer, 3, mPositionOffset / 4));
        geometry.setAttribute('normal', new THREE.InterleavedBufferAttribute(interleavedBuffer, 3, mNormalOffset / 4));
        geometry.setAttribute('uv', new THREE.InterleavedBufferAttribute(interleavedBuffer, 2, mUVOffset / 4));
        this.geometryCache.push(geometry);
        return batchID;
    }

    private createTriangleBatchIDWithIndex(inVertices: number, inVertexCount: number, inIndices: number, inIndexCount: number): number {
        const batchID = this.geometryCache.length;
        const traits = (Jolt as unknown as { DebugRendererVertexTraits: { prototype: { mPositionOffset: number; mNormalOffset: number; mUVOffset: number; mSize: number } } }).DebugRendererVertexTraits.prototype;
        const { mPositionOffset, mNormalOffset, mUVOffset, mSize } = traits;
        const interleaveBufferF32 = new Float32Array((inVertexCount * mSize) / 4);
        interleaveBufferF32.set(new Float32Array((Jolt as unknown as { HEAPF32: Float32Array }).HEAPF32.buffer, inVertices, interleaveBufferF32.length));
        const index = new Uint32Array(inIndexCount);
        index.set((Jolt as unknown as { HEAPU32: Uint32Array }).HEAPU32.subarray(inIndices / 4, inIndices / 4 + inIndexCount));

        const geometry = new THREE.BufferGeometry();
        const interleavedBuffer = new THREE.InterleavedBuffer(interleaveBufferF32, mSize / 4);
        geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(interleavedBuffer, 3, mPositionOffset / 4));
        geometry.setAttribute('normal', new THREE.InterleavedBufferAttribute(interleavedBuffer, 3, mNormalOffset / 4));
        geometry.setAttribute('uv', new THREE.InterleavedBufferAttribute(interleavedBuffer, 2, mUVOffset / 4));
        geometry.setIndex(new THREE.BufferAttribute(index, 1));
        this.geometryCache.push(geometry);
        return batchID;
    }

    private getMeshMaterial(color: number, cullMode: number | undefined, drawMode: number): THREE.MeshStandardMaterial {
        const key = `${color}|${cullMode}|${drawMode}`;
        if (!this.materialCache[key]) {
            const material = new THREE.MeshStandardMaterial({ color, depthTest: false });
            const JoltEnums = Jolt as unknown as {
                EDrawMode_Wireframe: number;
                ECullMode_Off: number;
                ECullMode_CullBackFace: number;
                ECullMode_CullFrontFace: number;
            };
            if (drawMode === JoltEnums.EDrawMode_Wireframe) {
                material.wireframe = true;
            }
            if (cullMode !== undefined) {
                switch (cullMode) {
                    case JoltEnums.ECullMode_Off:
                        material.side = THREE.DoubleSide;
                        break;
                    case JoltEnums.ECullMode_CullBackFace:
                        material.side = THREE.FrontSide;
                        break;
                    case JoltEnums.ECullMode_CullFrontFace:
                        material.side = THREE.BackSide;
                        break;
                }
            }
            this.materialCache[key] = material;
        }
        return this.materialCache[key];
    }

    Render(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void {
        const allMeshes = [
            ...Object.values(this.lineMesh),
            ...Object.values(this.triangleMesh),
            ...this.meshList,
            ...this.textCache,
        ];
        allMeshes.forEach((mesh) => (mesh.visible = false));

        for (const [colorU32, points] of Object.entries(this.lineCache)) {
            
            const color = parseInt(colorU32, 10);
            if (this.lineMesh[color]) {
                this.lineMesh[color].geometry.dispose();
                this.lineMesh[color].geometry = new THREE.BufferGeometry().setFromPoints(points);
                this.lineMesh[color].visible = true;
            } else {
                const material = new THREE.LineBasicMaterial({ color, depthTest: false });
                const geometry = new THREE.BufferGeometry().setFromPoints(points);
                const mesh = new THREE.LineSegments(geometry, material);
                this.lineMesh[color] = mesh;
                this.debugGroup.add(mesh);
            }
        }

        for (const [colorU32, points] of Object.entries(this.triangleCache)) {
            const color = parseInt(colorU32, 10);
            if (this.triangleMesh[color]) {
                this.triangleMesh[color].geometry.dispose();
                this.triangleMesh[color].geometry = new THREE.BufferGeometry().setFromPoints(points);
                this.triangleMesh[color].visible = true;
            } else {
                const material = this.getMeshMaterial(color, undefined, 0);
                const geometry = new THREE.BufferGeometry().setFromPoints(points);
                const mesh = new THREE.Mesh(geometry, material);
                this.triangleMesh[color] = mesh;
                this.debugGroup.add(mesh);
            }
        }

        this.geometryList.forEach(({ geometry, color, matrix, cullMode, drawMode }, i) => {
            if (!geometry) return;
            const material = this.getMeshMaterial(color, cullMode, drawMode);
            let mesh = this.meshList[i];
            if (!mesh) {
                mesh = new THREE.Mesh(geometry, material);
                this.meshList[i] = mesh;
                this.debugGroup.add(mesh);
            } else {
                mesh.material = material;
                mesh.geometry = geometry;
            }
            matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
            mesh.visible = true;
        });

        this.textList.forEach(({ position, text, color, height }, i) => {
            let mesh = this.textCache[i];
            if (!this.css3dRender) {
                this.css3dRender = new CSS3DRenderer();
                const renderSize = new THREE.Vector2();
                renderer.getSize(renderSize);
                this.css3dRender.setSize(renderSize.x, renderSize.y);
                const element = this.css3dRender.domElement;
                element.style.position = 'absolute';
                element.style.left = element.style.right = element.style.top = element.style.bottom = '0';
                const container = document.getElementById('container');
                (container ?? document.body).appendChild(element);
                window.addEventListener('resize', () => {
                    renderer.getSize(renderSize);
                    this.css3dRender!.setSize(renderSize.x, renderSize.y);
                }, { once: false });
            }
            if (!mesh) {
                mesh = new CSS3DObject(document.createElement('div'));
                (mesh as unknown as { element: HTMLElement }).element.style.display = 'block';
                (mesh as unknown as { element: HTMLElement }).element.style.fontSize = `${height}px`;
                this.textCache[i] = mesh;
                this.debugGroup.add(mesh);
            } else {
                ((mesh as unknown as { element: HTMLElement }).element as HTMLDivElement).innerText = text;
                ((mesh as unknown as { element: HTMLElement }).element as HTMLDivElement).style.color =
                    '#' + ('FFFFFF' + color.toString(16)).slice(-6);
            }
            mesh.position.copy(position);
            mesh.visible = true;
        });

        const oldAutoClear = renderer.autoClear;
        
        renderer.autoClear = false;
        renderer.render(this.debugScene, camera);
        renderer.autoClear = oldAutoClear;

        if (this.css3dRender) {
            this.css3dRender.render(this.debugScene, camera);
        }

        this.geometryList = [];
        this.textList = [];
        this.lineCache = {};
        this.triangleCache = {};
    }

    /**
     * Draw physics bodies and flush to Three.js. Call each frame when debug is enabled.
     */
    render(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void {
        this.Initialize();
        this.DrawBodies(this.physicsSystem, this.bodyDrawSettings);
        this.Render(renderer, camera);
    }
}
