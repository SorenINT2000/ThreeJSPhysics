import * as THREE from 'three';
import { insertCoin, myPlayer, onPlayerJoin, getParticipants, PlayerState as PlayroomPlayer, isHost, getRoomCode } from 'playroomkit';

export interface PlayerData {
    id: string;
    position: { x: number, y: number, z: number };
    rotation: number;
}

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
    private remoteMaterial = new THREE.MeshStandardMaterial({ color: 0x4444ff });
    private remoteGeometry = new THREE.BoxGeometry(1, 1, 1);

    constructor() {
        this.init();
    }

    public setScene(scene: THREE.Scene) {
        this.scene = scene;
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
                this.knownIds.delete(p.id);
                return false;
            }
            return true;
        });
    }

    public sendState(position: THREE.Vector3, rotation: number) {
        const me = myPlayer();
        if (!this.isReady || !me) return;
        me.setState("pos", { x: position.x, y: position.y, z: position.z }, false);
        me.setState("rot", rotation, false);
    }

    /**
     * Updated to handle visual updates internally.
     * This avoids garbage collection pressure from creating Maps/Objects every frame.
     */
    public updateRemotePlayers() {
        if (!this.isReady || !this.scene) return;

        const now = performance.now();
        if (now - this.lastSyncTime >= SYNC_INTERVAL_MS) {
            this.lastSyncTime = now;
            this.syncFromParticipants();
        }

        const me = myPlayer();
        
        for (const playerState of this.players) {
            if (playerState.id === me?.id) continue;

            const pos = playerState.getState("pos");
            const rot = playerState.getState("rot");

            if (pos && typeof pos.x === 'number') {
                let mesh = this.remoteVisuals.get(playerState.id);
                
                // Lazy create the mesh if it doesn't exist
                if (!mesh) {
                    mesh = new THREE.Mesh(this.remoteGeometry, this.remoteMaterial);
                    this.scene.add(mesh);
                    this.remoteVisuals.set(playerState.id, mesh);
                }

                // Update existing mesh properties (zero allocation)
                mesh.position.set(pos.x, pos.y, pos.z);
                mesh.rotation.y = rot || 0;
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