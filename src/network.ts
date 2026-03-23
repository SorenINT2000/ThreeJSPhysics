import * as THREE from 'three';
import type { PhysicsWorld } from './physics';
import {
    insertCoin,
    myPlayer,
    onPlayerJoin,
    getParticipants,
    PlayerState as PlayroomPlayer,
    isHost,
    getRoomCode,
    setState,
    getState,
} from 'playroomkit';

export interface PlayerData {
    id: string;
    position: { x: number, y: number, z: number };
    rotation: number;
}

/** Room-level Playroom state key written by the host for kinematic world sync. */
export const ROOM_STATE_SIM_TIME = 'simTime' as const;

const SYNC_INTERVAL_MS = 3000;

export class NetworkManager {
    private players: PlayroomPlayer[] = [];
    private knownIds: Set<string> = new Set();
    private localId: string = "";
    private isReady: boolean = false;
    private lastSyncTime: number = 0;

    // Visual tracking
    private remoteVisuals: Map<string, THREE.Mesh> = new Map();
    private scene: THREE.Scene | null = null;
    private physics: PhysicsWorld | null = null;
    private playerHalfExtents: THREE.Vector3 | null = null;
    private remoteMaterial = new THREE.MeshStandardMaterial({ color: 0x4444ff });
    private remoteGeometry = new THREE.BoxGeometry(1, 1, 1);

    constructor() {
        this.init();
    }

    public setScene(scene: THREE.Scene) {
        this.scene = scene;
    }

    /** Enable player–player collision: creates kinematic proxy bodies for remote players. */
    public setPhysics(physics: PhysicsWorld, playerHalfExtents: THREE.Vector3) {
        this.physics = physics;
        this.playerHalfExtents = playerHalfExtents.clone();
    }

    private async init() {
        console.log("[Network] Initializing PlayroomKit...");
        try {
            await insertCoin({ 
                skipLobby: true
            });
            
            const me = myPlayer();
            this.localId = me?.id || "";
            
            me.setState("pos", { x: 0, y: 5, z: 0 }, true);
            me.setState("rot", 0, true);
            
            this.isReady = true;

            const roomCode = getRoomCode();
            console.log(`[Network] Connected! ID: ${this.localId}, Room: ${roomCode}, Host: ${isHost()}`);

            onPlayerJoin((player: PlayroomPlayer) => {
                this.registerPlayer(player);
            });
        } catch (e) {
            console.error("[Network] Initialization failed:", e);
        }
    }

    private registerPlayer(player: PlayroomPlayer) {
        if (this.knownIds.has(player.id)) return;
        
        this.knownIds.add(player.id);
        this.players.push(player);

        player.onQuit(() => {
            const mesh = this.remoteVisuals.get(player.id);
            if (mesh && this.scene) {
                this.scene.remove(mesh);
            }
            this.remoteVisuals.delete(player.id);
            this.physics?.destroyPlayerProxy(player.id);
            this.knownIds.delete(player.id);
            this.players = this.players.filter(p => p.id !== player.id);
        });
    }

    private syncFromParticipants() {
        const participants = getParticipants();
        const participantList = Array.isArray(participants) ? participants : Object.values(participants);
        const me = myPlayer();
        const currentIds = new Set<string>();

        for (const player of participantList) {
            if (!player?.id) continue;
            currentIds.add(player.id);
            if (player.id === me?.id) continue;
            if (this.knownIds.has(player.id)) continue;
            this.registerPlayer(player);
        }
        
        this.players = this.players.filter(p => {
            if (!currentIds.has(p.id)) {
                const mesh = this.remoteVisuals.get(p.id);
                if (mesh && this.scene) this.scene.remove(mesh);
                this.remoteVisuals.delete(p.id);
                this.physics?.destroyPlayerProxy(p.id);
                this.knownIds.delete(p.id);
                return false;
            }
            return true;
        });
    }

    /**
     * Pushes local player pose. Host also writes room `simTime` so clients can drive kinematic platforms with the same clock.
     */
    public sendState(position: THREE.Vector3, rotation: number, simulationTime?: number) {
        const me = myPlayer();
        if (!this.isReady || !me) return;
        me.setState("pos", { x: position.x, y: position.y, z: position.z }, false);
        me.setState("rot", rotation, false);
        if (isHost() && simulationTime !== undefined && Number.isFinite(simulationTime)) {
            setState(ROOM_STATE_SIM_TIME, simulationTime, false);
        }
    }

    /** Host-driven physics/simulation time from room state (undefined until first host update). */
    public getRoomSimulationTime(): number | undefined {
        if (!this.isReady) return undefined;
        const t = getState(ROOM_STATE_SIM_TIME);
        return typeof t === 'number' && Number.isFinite(t) ? t : undefined;
    }

    public getIsHost(): boolean {
        return this.isReady && isHost();
    }

    /**
     * Updated to handle visual updates and physics proxies internally.
     * Call before kinematicCharacter.update so proxies are in place for collision.
     * @param deltaTime Used for MoveKinematic when physics proxies are enabled.
     */
    public updateRemotePlayers(deltaTime: number) {
        if (!this.isReady || !this.scene) return;

        const now = performance.now();
        if (now - this.lastSyncTime >= SYNC_INTERVAL_MS) {
            this.lastSyncTime = now;
            this.syncFromParticipants();
        }

        const me = myPlayer();
        const dt = Math.min(deltaTime, 1 / 30);

        for (const playerState of this.players) {
            if (playerState.id === me?.id) continue;

            const pos = playerState.getState("pos");
            const rot = playerState.getState("rot");

            if (pos && typeof pos.x === 'number') {
                let mesh = this.remoteVisuals.get(playerState.id);

                if (!mesh) {
                    mesh = new THREE.Mesh(this.remoteGeometry, this.remoteMaterial);
                    this.scene.add(mesh);
                    this.remoteVisuals.set(playerState.id, mesh);
                    if (this.physics && this.playerHalfExtents) {
                        this.physics.createPlayerProxy(playerState.id, this.playerHalfExtents, pos);
                    }
                }

                mesh.position.set(pos.x, pos.y, pos.z);
                mesh.rotation.y = rot || 0;

                if (this.physics) {
                    this.physics.updatePlayerProxy(playerState.id, pos, dt);
                }
            }
        }
    }

    public getLocalId(): string {
        return this.localId || myPlayer()?.id || "connecting...";
    }

    public getIsReady(): boolean {
        return this.isReady;
    }
}