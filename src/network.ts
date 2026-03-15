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

    constructor() {
        this.init();
    }

    private async init() {
        console.log("[Network] Initializing PlayroomKit...");
        try {
            await insertCoin({ 
                // streamMode: true,
                skipLobby: true
            });
            
            const me = myPlayer();
            this.localId = me?.id || "";
            
            // 1. Initial Broadcast: Make sure we aren't "silent"
            me.setState("pos", { x: 0, y: 5, z: 0 }, true);
            me.setState("rot", 0, true);
            
            this.isReady = true;

            const roomCode = getRoomCode();
            console.log(`[Network] Connected! ID: ${this.localId}, Room: ${roomCode}, Host: ${isHost()}`);

            // 2. Setup the Join Listener (works for host only; spectators don't receive this)
            onPlayerJoin((player: PlayroomPlayer) => {
                console.log(`[Network] Player joined (onPlayerJoin): ${player.id}`);
                this.registerPlayer(player);
            });

            // 3. Fallback: Sync from getParticipants() every frame. With streamMode, the first
            // player is a SPECTATOR, not the host, so onPlayerJoin never fires for them. But
            // getParticipants() is updated via sync for all clients. We reconcile in getRemotePlayers.
        } catch (e) {
            console.error("[Network] Initialization failed:", e);
        }
    }

    private registerPlayer(player: PlayroomPlayer) {
        if (this.knownIds.has(player.id)) return;
        
        console.log(`[Network] Registering Player: ${player.id} (Local: ${player.id === this.localId})`);
        this.knownIds.add(player.id);
        this.players.push(player);

        player.onQuit(() => {
            console.log(`[Network] Removing Player: ${player.id}`);
            this.knownIds.delete(player.id);
            this.players = this.players.filter(p => p.id !== player.id);
        });
    }

    /**
     * Reconcile our player list with getParticipants(). Needed because with streamMode,
     * the first player (spectator) never receives onPlayerJoin.
     * Note: getParticipants() returns an array, not Record<id, PlayerState>.
     */
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
        // Remove players who left (no longer in participants)
        this.players = this.players.filter(p => {
            if (!currentIds.has(p.id)) {
                this.knownIds.delete(p.id);
                return false;
            }
            return true;
        });
    }

    /**
     * Sends state to peers.
     */
    public sendState(position: THREE.Vector3, rotation: number) {
        const me = myPlayer();
        if (!this.isReady || !me) return;

        // Reliable: false (Unreliable/Volatile) for movement
        me.setState("pos", { x: position.x, y: position.y, z: position.z }, false);
        me.setState("rot", rotation, false);
    }

    /**
     * Maps the Playroom player states to a format our renderer understands.
     */
    public getRemotePlayers(): Map<string, PlayerData> {
        const remoteMap = new Map<string, PlayerData>();
        if (!this.isReady) return remoteMap;

        const now = performance.now();
        if (now - this.lastSyncTime >= SYNC_INTERVAL_MS) {
            this.lastSyncTime = now;
            this.syncFromParticipants();
        }
        const me = myPlayer();
        
        // Iterate through all players (from onPlayerJoin + syncFromParticipants fallback)
        for (const playerState of this.players) {
            if (playerState.id === me?.id) continue;

            const pos = playerState.getState("pos");
            const rot = playerState.getState("rot");

            // Only return players who have valid position data
            if (pos && typeof pos.x === 'number') {
                remoteMap.set(playerState.id, {
                    id: playerState.id,
                    position: pos,
                    rotation: rot || 0
                });
            }
        }

        return remoteMap;
    }

    public getLocalId(): string {
        return this.localId || myPlayer()?.id || "connecting...";
    }

    public getIsReady(): boolean {
        return this.isReady;
    }
}