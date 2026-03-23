import initJolt from 'jolt-physics/debug-wasm-compat';

/**
 * Initialized Jolt module — shared singleton across the whole app.
 * Top-level await ensures the WASM is ready before any importer can use it.
 */
export const Jolt = await initJolt();

/**
 * Type of the initialized module (constructors, enums, `destroy`, heap views, …).
 * Use `JoltModule["Quat"]` or `InstanceType<JoltModule["Quat"]>` in type positions — unlike the upstream
 * `declare module Jolt` merge on the default export, this re-exported `const` is not a TS namespace, so
 * `Jolt.Quat` as a *type* can fail with TS2503/TS2713; `typeof Jolt.SomeClass` / `InstanceType<typeof Jolt.SomeClass>` still work.
 */
export type JoltModule = Awaited<ReturnType<typeof initJolt>>;