import * as THREE from 'three';

/**
 * Single source of truth for look direction. Combines mouse and gamepad right-stick input.
 */
class LookController {
    private lookState: THREE.Spherical;
    private readonly minPitch: number;
    private readonly maxPitch: number;
    private readonly mouseSensitivity = 0.002;
    private readonly gamepadSensitivity = 2;
    private readonly gamepadDeadzone = 0.15;

    constructor(
        defaultPhi: number = Math.PI / 2,
        defaultTheta: number = 0,
        minPitch: number = 0.1,
        maxPitch: number = Math.PI - 0.1
    ) {
        this.lookState = new THREE.Spherical(1, defaultPhi, defaultTheta);
        this.minPitch = minPitch;
        this.maxPitch = maxPitch;
    }

    addMouseDelta(dx: number, dy: number): void {
        this.lookState.theta -= dx * this.mouseSensitivity;
        this.lookState.phi += dy * this.mouseSensitivity;
        this.clampPitch();
    }

    addGamepadLook(yaw: number, pitch: number, deltaTime: number): void {
        const x = Math.abs(yaw) > this.gamepadDeadzone ? yaw : 0;
        const y = Math.abs(pitch) > this.gamepadDeadzone ? pitch : 0;
        const scale = this.gamepadSensitivity * deltaTime;
        this.lookState.theta -= x * scale;
        this.lookState.phi += y * scale;
        this.clampPitch();
    }

    private clampPitch(): void {
        this.lookState.phi = Math.max(this.minPitch, Math.min(this.maxPitch, this.lookState.phi));
    }

    getLookDirection(out: THREE.Vector3): THREE.Vector3 {
        return out.setFromSpherical(this.lookState).normalize();
    }

    /** Spherical angles in radians (for debug / HUD). */
    getAngles(): { phi: number; theta: number } {
        return { phi: this.lookState.phi, theta: this.lookState.theta };
    }
}

/**
 * Handles pointer lock and forwards mouse movement to a LookController.
 */
class MouseState {
    public focusState: boolean = false;

    constructor(lookController: LookController) {
        window.addEventListener('mousedown', () => {
            if (!this.focusState) document.body.requestPointerLock();
        });

        document.addEventListener('pointerlockchange', () => {
            this.focusState = document.pointerLockElement === document.body;
        });

        window.addEventListener('mousemove', (e) => {
            if (!this.focusState) return;
            lookController.addMouseDelta(e.movementX, e.movementY);
        });
    }
}

class KeyboardState {
    private allowedKeys: Array<string>;
    public state: Record<string, boolean> = {};

    constructor(allowedKeys: Array<string>) {
        this.allowedKeys = allowedKeys;

        // console.log(allowedKeys.includes("Space"))

        window.addEventListener('keydown', (e) => {
            if (this.allowedKeys.includes(e.code))
                this.state[e.code] = true;
        });

        window.addEventListener('keyup', (e) => {
            if (this.allowedKeys.includes(e.code))
                this.state[e.code] = false;
        });
    }
}

class GamepadState {
    private allowedButtons: Array<string>;

    private gamepad: Gamepad | null = null;
    private leftAxis = new THREE.Vector3();
    private rightAxis = new THREE.Vector3();

    private fullButtonList: Array<string> = [
        "ButtonA", "ButtonB", "ButtonX", "ButtonY",
        "BumperLeft", "BumperRight",
        "TriggerLeft", "TriggerRight",
        "ButtonShare", "ButtonOptions",
        "StickLight", "StickRight",
        "PadUp", "PadDown", "PadLeft", "PadRight",
        "Home"
    ]

    public buttonState = () => {
        this.refresh();
        if (!this.gamepad) return null;
        const gp = this.gamepad;

        return Object.fromEntries(
            this.fullButtonList
                .map((btn, i) => [btn, !!gp.buttons[i]?.pressed] as [string, boolean])
                .filter(([btn]) => this.allowedButtons.includes(btn))
        );
    }
    /** Call each frame to poll gamepad state (required for axis/button reads). */
    refresh(): void {
        this.getGamePad();
    }

    public axisState = () => {
        this.refresh();
        if (!this.gamepad) return null;
        const gp = this.gamepad;

        const axes = gp.axes;
        this.leftAxis.set(axes[0], 0, axes[1]);
        this.rightAxis.set(axes[2], 0, axes[3]);

        return {
            "AxesLeft": this.leftAxis,
            "AxesRight": this.rightAxis,
        }
    }

    constructor(allowedButtons: Array<string>) {
        this.allowedButtons = allowedButtons;

        window.addEventListener('gamepadconnected', () => this.getGamePad())
        window.addEventListener('gamepaddisconnected', () => this.getGamePad())
    }

    getGamePad(): void {
        const gamepads = window.navigator.getGamepads();
        // console.log(gamepads)
        this.gamepad = Array.isArray(gamepads)
            ? gamepads.find((gp): gp is Gamepad => gp !== null) ?? null
            : null;
            
    }

    /** Connected gamepad metadata (for debug HUD). */
    getGamepadInfo(): { connected: boolean; id?: string } {
        this.refresh();
        if (!this.gamepad) return { connected: false };
        return { connected: true, id: this.gamepad.id };
    }
}

export { LookController, MouseState, KeyboardState, GamepadState }