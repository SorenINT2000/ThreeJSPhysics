import initJolt from 'https://www.unpkg.com/jolt-physics/dist/jolt-physics.debug.wasm-compat.js';

/**
 * Initialized Jolt module — shared singleton across the whole app.
 * Top-level await ensures the WASM is ready before any importer can use it.
 */
export const Jolt = await initJolt();

// // diagnostic.ts
// console.log("--- Jolt Runtime Diagnostic ---");

// // 1. Check if the class exists
// if (Jolt.DebugRendererJS) {
//     console.log("✅ DebugRendererJS found in Jolt namespace.");
//     try {
//         const testRender = new Jolt.DebugRendererJS();
//         console.log("✅ Successfully instantiated DebugRendererJS.");
//         Jolt.destroy(testRender);
//     } catch (e) {
//         console.error("❌ Failed to instantiate DebugRendererJS:", e);
//     }
// } else {
//     console.warn("❌ DebugRendererJS is MISSING from the Jolt namespace.");
// }

// // 2. Check for the pointer wrapper (needed for the DrawLine arguments)
// if (Jolt.wrapPointer) {
//     console.log("✅ wrapPointer utility found.");
// } else {
//     console.error("❌ wrapPointer is MISSING. You won't be able to read DrawLine arguments.");
// }

// // 3. Check for the DrawBodies method on the physics system
// const tempSettings = new Jolt.PhysicsSystemSettings();
// const tempSystem = new Jolt.PhysicsSystem();
// tempSystem.Init(1024, 0, 1024, 1024, Jolt.mBroadPhaseLayerInterface, Jolt.mObjectVsBroadPhaseLayerFilter, Jolt.mObjectLayerPairFilter);

// if (tempSystem.DrawBodies) {
//     console.log("✅ PhysicsSystem.DrawBodies is available.");
// } else {
//     console.warn("❌ DrawBodies is MISSING. This might be a production build instead of debug.");
// }