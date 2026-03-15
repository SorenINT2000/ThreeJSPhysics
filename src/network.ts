import * as THREE from 'three';
import { insertCoin, myPlayer, onPlayerJoin, PlayerState as PlayroomPlayer, isHost, getRoomCode } from 'playroomkit';

export interface PlayerData {
    id: string;
    position: { x: number, y: number, z: number };
    rotation: number;
}

export class NetworkManager {
    private players: PlayroomPlayer[] = [];
    private localId: string = "";
    private isReady: boolean = false;

    constructor() {
        this.init();
    }

    private async init() {
        console.log("[Network] Initializing PlayroomKit...");
        try {
            await insertCoin({ 
                streamMode: true,
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

            // 2. Setup the Join Listener
            onPlayerJoin((player: PlayroomPlayer) => {
                console.log(`[Network] Player joined: ${player.id}`);
                this.registerPlayer(player);
            });

            // 3. Host-Specific Registry Logic
            // If we are the host, we periodically check if there are "orphaned" states
            if (isHost()) {
                setInterval(() => {
                    // This is a heartbeat to ensure the host keeps its internal list clean
                    // and can be used to trigger sync events if players seem missing.
                }, 2000);
            }

        } catch (e) {
            console.error("[Network] Initialization failed:", e);
        }
    }

    private registerPlayer(player: PlayroomPlayer) {
        if (this.players.find(p => p.id === player.id)) return;
        
        console.log(`[Network] Registering Player: ${player.id} (Local: ${player.id === this.localId})`);
        this.players.push(player);

        player.onQuit(() => {
            console.log(`[Network] Removing Player: ${player.id}`);
            this.players = this.players.filter(p => p.id !== player.id);
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

        const me = myPlayer();
        
        // Iterate through all players Playroom has given us via onPlayerJoin
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