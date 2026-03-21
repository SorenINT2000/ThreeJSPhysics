import initJolt from 'jolt-physics';

/**
 * Initialized Jolt module — shared singleton across the whole app.
 * Top-level await ensures the WASM is ready before any importer can use it.
 */
export const Jolt = await initJolt();
