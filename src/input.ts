import * as THREE from 'three';

/**
 * MouseLook is the independent source of truth for the player's view direction.
 * It is decoupled from the Camera and the Player.
 */
export type RotationProvider = () => { theta: number; phi: number };

export class MouseLook {
    public state = {
        theta: 0,
        phi: Math.PI / 6 // Default slight downward tilt
    };
    private isPointerLocked: boolean = false;

    constructor() {
        this.setupPointerLock();
    }

    private setupPointerLock() {
        window.addEventListener('mousedown', () => {
            if (!this.isPointerLocked) document.body.requestPointerLock();
        });

        document.addEventListener('pointerlockchange', () => {
            this.isPointerLocked = document.pointerLockElement === document.body;
        });

        window.addEventListener('mousemove', (e) => {
            if (!this.isPointerLocked) return;
            const sensitivity = 0.002;
            
            // Horizontal rotation (Yaw)
            this.state.theta -= e.movementX * sensitivity;
            
            // Vertical rotation (Pitch)
            this.state.phi += e.movementY * sensitivity;
            
            // Constrain vertical rotation to prevent flipping
            this.state.phi = Math.max(0.1, Math.min(Math.PI / 2.1, this.state.phi));
        });
    }

    public getProvider(): RotationProvider {
        return () => ({ theta: this.state.theta, phi: this.state.phi });
    }
}