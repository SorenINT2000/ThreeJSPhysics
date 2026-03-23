import * as THREE from 'three';
import { LookController, MouseState, KeyboardState, GamepadState } from './input';

export interface ControlsDebugSnapshot {
    /** Look spherical angles in degrees (phi ≈ pitch from vertical, theta ≈ yaw). */
    lookPhiDeg: number;
    lookThetaDeg: number;
    /** Raw keyboard switches (for debug HUD). */
    keyboard: {
        KeyW: boolean;
        KeyA: boolean;
        KeyS: boolean;
        KeyD: boolean;
        Space: boolean;
        Escape: boolean;
    };
    gamepad: {
        connected: boolean;
        id?: string;
        leftStick: { x: number; z: number };
        rightStick: { x: number; z: number };
        buttonsPressed: string[];
    };
}

export interface ControlState {
    lookDirection: THREE.Vector3;
    movementDirection: THREE.Vector3;
    isJumping: boolean;
    /** True for one frame when Escape goes from up to down (pause menu toggle). */
    togglePausePressed: boolean;
    debug: ControlsDebugSnapshot;
}

const LEFT_STICK_DEADZONE = 0.15;

/**
 * Single interface between raw input (keyboard, mouse, gamepad) and the game loop.
 * Produces look direction, movement direction, and jump state each frame.
 */
export class Controls {
    private lookController: LookController;
    private keys: KeyboardState;
    private pad: GamepadState;

    private lookDirection = new THREE.Vector3();
    private movementDirection = new THREE.Vector3();
    private forwardDirection = new THREE.Vector3();
    private rightDirection = new THREE.Vector3();
    private escapeWasDown = false;

    constructor() {
        this.lookController = new LookController();
        new MouseState(this.lookController);
        this.keys = new KeyboardState(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'Escape']);
        this.pad = new GamepadState(['PadUp', 'PadDown', 'PadLeft', 'PadRight', 'ButtonA']);
    }

    /**
     * Call each frame. Returns the current control state for the player and render pipeline.
     */
    getState(deltaTime: number): ControlState {
        const padState = this.pad.buttonState();
        const axisState = this.pad.axisState();

        if (axisState) {
            this.lookController.addGamepadLook(axisState.AxesRight.x, axisState.AxesRight.z, deltaTime);
        }

        this.lookController.getLookDirection(this.lookDirection);
        this.forwardDirection.copy(this.lookDirection).setY(0).normalize();
        this.rightDirection.set(-this.forwardDirection.z, 0, this.forwardDirection.x);

        this.movementDirection.set(0, 0, 0);

        if (this.keys.state.KeyW || padState?.PadUp) {
            this.movementDirection.addScaledVector(this.forwardDirection, 1);
        }
        if (this.keys.state.KeyS || padState?.PadDown) {
            this.movementDirection.addScaledVector(this.forwardDirection, -1);
        }
        if (this.keys.state.KeyA || padState?.PadLeft) {
            this.movementDirection.addScaledVector(this.rightDirection, -1);
        }
        if (this.keys.state.KeyD || padState?.PadRight) {
            this.movementDirection.addScaledVector(this.rightDirection, 1);
        }

        if (axisState) {
            const lx = Math.abs(axisState.AxesLeft.x) > LEFT_STICK_DEADZONE ? axisState.AxesLeft.x : 0;
            const lz = Math.abs(axisState.AxesLeft.z) > LEFT_STICK_DEADZONE ? axisState.AxesLeft.z : 0;
            this.movementDirection.addScaledVector(this.forwardDirection, -lz);
            this.movementDirection.addScaledVector(this.rightDirection, lx);
        }

        const isJumping = !!(this.keys.state.Space || padState?.ButtonA);

        const escapeDown = !!this.keys.state.Escape;
        const togglePausePressed = escapeDown && !this.escapeWasDown;
        this.escapeWasDown = escapeDown;

        const keyboard = {
            KeyW: !!this.keys.state.KeyW,
            KeyA: !!this.keys.state.KeyA,
            KeyS: !!this.keys.state.KeyS,
            KeyD: !!this.keys.state.KeyD,
            Space: !!this.keys.state.Space,
            Escape: escapeDown,
        };

        const angles = this.lookController.getAngles();
        const gpInfo = this.pad.getGamepadInfo();
        const buttonsPressed = padState
            ? Object.entries(padState)
                  .filter(([, v]) => v)
                  .map(([k]) => k)
            : [];

        const debug: ControlsDebugSnapshot = {
            lookPhiDeg: THREE.MathUtils.radToDeg(angles.phi),
            lookThetaDeg: THREE.MathUtils.radToDeg(angles.theta),
            keyboard,
            gamepad: {
                connected: gpInfo.connected,
                id: gpInfo.id,
                leftStick: axisState
                    ? { x: axisState.AxesLeft.x, z: axisState.AxesLeft.z }
                    : { x: 0, z: 0 },
                rightStick: axisState
                    ? { x: axisState.AxesRight.x, z: axisState.AxesRight.z }
                    : { x: 0, z: 0 },
                buttonsPressed,
            },
        };

        return {
            lookDirection: this.lookDirection,
            movementDirection: this.movementDirection,
            isJumping,
            togglePausePressed,
            debug,
        };
    }
}
