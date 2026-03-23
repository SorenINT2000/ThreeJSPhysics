import type { ControlState } from '../controls';
import './debugUI.css';

export interface DebugUIFrame {
    networkId?: string | null;
    control: ControlState;
    isPaused: boolean;
    /** World-space player position (same as `Player` / kinematic sync target). */
    playerPosition: { x: number; y: number; z: number };
}

const STICK_TRAVEL_PX = 20;

function clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
}

function setStickDot(el: HTMLElement, x: number, z: number): void {
    const nx = clamp(x, -1, 1);
    const nz = clamp(z, -1, 1);
    el.style.transform = `translate(${nx * STICK_TRAVEL_PX}px, ${nz * STICK_TRAVEL_PX}px)`;
}

function fmt(n: number, d: number): string {
    return n.toFixed(d);
}

/**
 * Fixed overlay: FPS, network id, visual keyboard, gamepad sticks & buttons, footer (pause, player pos, look/move/jump).
 */
export class DebugUI {
    private readonly root: HTMLDivElement;
    private readonly fpsEl: HTMLSpanElement;
    private readonly idEl: HTMLSpanElement;
    private readonly lockDot: HTMLSpanElement;
    private readonly keys: Record<'KeyW' | 'KeyA' | 'KeyS' | 'KeyD' | 'Space', HTMLDivElement>;
    private readonly leftDot: HTMLDivElement;
    private readonly rightDot: HTMLDivElement;
    private readonly gpRoot: HTMLDivElement;
    private readonly gpIdEl: HTMLSpanElement;
    private readonly padBtns: Record<'PadUp' | 'PadDown' | 'PadLeft' | 'PadRight', HTMLDivElement>;
    private readonly faceA: HTMLDivElement;
    private readonly footerEl: HTMLDivElement;
    /** Reused each frame to avoid allocating a new Set for gamepad button checks. */
    private readonly pressedScratch = new Set<string>();
    private frames = 0;
    private lastFpsTime = performance.now();
    private fps = 0;

    constructor() {
        this.root = document.createElement('div');
        this.root.className = 'debug-ui';

        const header = document.createElement('div');
        header.className = 'debug-ui__header';
        this.fpsEl = document.createElement('strong');
        this.fpsEl.textContent = 'FPS: —';
        const idWrap = document.createElement('span');
        idWrap.className = 'debug-ui__id-wrap';
        idWrap.append('ID: ');
        this.idEl = document.createElement('span');
        this.idEl.textContent = '—';
        idWrap.appendChild(this.idEl);
        const lockWrap = document.createElement('span');
        lockWrap.className = 'debug-ui__lock';
        this.lockDot = document.createElement('span');
        this.lockDot.className = 'debug-ui__lock-dot';
        lockWrap.append(this.lockDot, document.createTextNode(' paused'));
        header.append(this.fpsEl, idWrap, lockWrap);

        const body = document.createElement('div');
        body.className = 'debug-ui__body';

        const kbdCol = document.createElement('div');
        const kbdTitle = document.createElement('div');
        kbdTitle.className = 'debug-ui__section-title';
        kbdTitle.textContent = 'Keyboard';
        const kbd = document.createElement('div');
        kbd.className = 'debug-ui__kbd';

        const mkKey = (code: 'KeyW' | 'KeyA' | 'KeyS' | 'KeyD' | 'Space', label: string, wide = false) => {
            const d = document.createElement('div');
            d.className = 'debug-ui__key' + (wide ? ' debug-ui__key--wide' : '');
            d.dataset.key = code;
            d.textContent = label;
            return d;
        };

        this.keys = {
            KeyW: mkKey('KeyW', 'W'),
            KeyA: mkKey('KeyA', 'A'),
            KeyS: mkKey('KeyS', 'S'),
            KeyD: mkKey('KeyD', 'D'),
            Space: mkKey('Space', 'Space', true),
        };

        const rowW = document.createElement('div');
        rowW.className = 'debug-ui__key-row';
        rowW.appendChild(this.keys.KeyW);
        const rowASD = document.createElement('div');
        rowASD.className = 'debug-ui__key-row';
        rowASD.append(this.keys.KeyA, this.keys.KeyS, this.keys.KeyD);
        const rowSp = document.createElement('div');
        rowSp.className = 'debug-ui__key-row';
        rowSp.appendChild(this.keys.Space);
        kbd.append(rowW, rowASD, rowSp);
        kbdCol.append(kbdTitle, kbd);

        this.gpRoot = document.createElement('div');
        this.gpRoot.className = 'debug-ui__gp';
        const gpTitle = document.createElement('div');
        gpTitle.className = 'debug-ui__section-title';
        gpTitle.textContent = 'Gamepad';
        this.gpIdEl = document.createElement('div');
        this.gpIdEl.className = 'debug-ui__gp-id';

        const sticks = document.createElement('div');
        sticks.className = 'debug-ui__sticks';
        const mkStick = (label: string) => {
            const col = document.createElement('div');
            col.className = 'debug-ui__stick-col';
            const lb = document.createElement('div');
            lb.className = 'debug-ui__stick-label';
            lb.textContent = label;
            const ring = document.createElement('div');
            ring.className = 'debug-ui__stick-ring';
            const dot = document.createElement('div');
            dot.className = 'debug-ui__stick-dot';
            ring.appendChild(dot);
            col.append(lb, ring);
            return { col, dot };
        };
        const left = mkStick('L');
        const right = mkStick('R');
        this.leftDot = left.dot;
        this.rightDot = right.dot;
        sticks.append(left.col, right.col);

        const gpBtns = document.createElement('div');
        gpBtns.className = 'debug-ui__gp-buttons';
        const dpad = document.createElement('div');
        dpad.className = 'debug-ui__dpad';
        const mkPadCell = (
            name: 'PadUp' | 'PadDown' | 'PadLeft' | 'PadRight' | null,
            sym: string,
            row: number,
            col: number
        ) => {
            const cell = document.createElement('div');
            cell.className = 'debug-ui__dpad-cell';
            cell.style.gridRow = String(row);
            cell.style.gridColumn = String(col);
            if (name) {
                const b = document.createElement('div');
                b.className = 'debug-ui__padbtn';
                b.dataset.pad = name;
                b.textContent = sym;
                cell.appendChild(b);
            }
            dpad.appendChild(cell);
            return name ? (cell.querySelector('[data-pad]') as HTMLDivElement) : null;
        };
        mkPadCell(null, '', 1, 1);
        const padUp = mkPadCell('PadUp', '▲', 1, 2);
        mkPadCell(null, '', 1, 3);
        const padLeft = mkPadCell('PadLeft', '◀', 2, 1);
        mkPadCell(null, '', 2, 2);
        const padRight = mkPadCell('PadRight', '▶', 2, 3);
        mkPadCell(null, '', 3, 1);
        const padDown = mkPadCell('PadDown', '▼', 3, 2);
        mkPadCell(null, '', 3, 3);

        this.padBtns = {
            PadUp: padUp!,
            PadDown: padDown!,
            PadLeft: padLeft!,
            PadRight: padRight!,
        };

        const face = document.createElement('div');
        face.className = 'debug-ui__face';
        const faceLabel = document.createElement('div');
        faceLabel.className = 'debug-ui__stick-label';
        faceLabel.textContent = 'Jump';
        this.faceA = document.createElement('div');
        this.faceA.className = 'debug-ui__face-a';
        this.faceA.dataset.face = 'ButtonA';
        this.faceA.textContent = 'A';
        face.append(faceLabel, this.faceA);

        gpBtns.append(dpad, face);
        this.gpRoot.append(gpTitle, this.gpIdEl, sticks, gpBtns);

        body.append(kbdCol, this.gpRoot);

        this.footerEl = document.createElement('div');
        this.footerEl.className = 'debug-ui__footer';

        this.root.append(header, body, this.footerEl);
        Object.assign(this.root.style, {
            position: 'fixed',
            top: '10px',
            left: '10px',
            pointerEvents: 'none',
            zIndex: '1000',
        });
        document.body.appendChild(this.root);
    }

    update(frame: DebugUIFrame): void {
        const now = performance.now();
        this.frames++;
        if (now - this.lastFpsTime >= 1000) {
            this.fps = Math.round((this.frames * 1000) / (now - this.lastFpsTime));
            this.frames = 0;
            this.lastFpsTime = now;
        }

        const c = frame.control;
        const d = c.debug;
        const nid = frame.networkId;

        this.fpsEl.textContent = `FPS: ${this.fps}`;
        this.idEl.textContent = nid != null && nid !== '' ? nid : '—';
        this.lockDot.classList.toggle('debug-ui__lock-dot--on', frame.isPaused);

        const kb = d.keyboard;
        this.keys.KeyW.classList.toggle('debug-ui__key--pressed', kb.KeyW);
        this.keys.KeyA.classList.toggle('debug-ui__key--pressed', kb.KeyA);
        this.keys.KeyS.classList.toggle('debug-ui__key--pressed', kb.KeyS);
        this.keys.KeyD.classList.toggle('debug-ui__key--pressed', kb.KeyD);
        this.keys.Space.classList.toggle('debug-ui__key--pressed', kb.Space);

        const gp = d.gamepad;
        this.gpRoot.classList.toggle('debug-ui__gp--disconnected', !gp.connected);
        this.gpIdEl.textContent = gp.connected
            ? gp.id
                ? gp.id.length > 42
                    ? `${gp.id.slice(0, 40)}…`
                    : gp.id
                : 'Connected'
            : 'No controller';

        setStickDot(this.leftDot, gp.leftStick.x, gp.leftStick.z);
        setStickDot(this.rightDot, gp.rightStick.x, gp.rightStick.z);

        const pressed = this.pressedScratch;
        pressed.clear();
        for (let i = 0; i < gp.buttonsPressed.length; i++) {
            pressed.add(gp.buttonsPressed[i]!);
        }
        this.padBtns.PadUp.classList.toggle('debug-ui__padbtn--pressed', pressed.has('PadUp'));
        this.padBtns.PadDown.classList.toggle('debug-ui__padbtn--pressed', pressed.has('PadDown'));
        this.padBtns.PadLeft.classList.toggle('debug-ui__padbtn--pressed', pressed.has('PadLeft'));
        this.padBtns.PadRight.classList.toggle('debug-ui__padbtn--pressed', pressed.has('PadRight'));
        this.faceA.classList.toggle('debug-ui__face-a--pressed', pressed.has('ButtonA'));

        const ld = c.lookDirection;
        const md = c.movementDirection;
        const p = frame.playerPosition;
        this.footerEl.innerHTML = [
            `pos <span class="debug-ui__footer-accent">${fmt(p.x, 2)}, ${fmt(p.y, 2)}, ${fmt(p.z, 2)}</span>`,
            `look φ/θ ${fmt(d.lookPhiDeg, 1)}° / ${fmt(d.lookThetaDeg, 1)}°`,
            `look <span class="debug-ui__footer-accent">${fmt(ld.x, 2)}, ${fmt(ld.y, 2)}, ${fmt(ld.z, 2)}</span>`,
            `move <span class="debug-ui__footer-accent">${fmt(md.x, 2)}, ${fmt(md.y, 2)}, ${fmt(md.z, 2)}</span>`,
            `jump: ${c.isJumping ? 'yes' : 'no'}`,
        ].join(' · ');
    }

    dispose(): void {
        this.root.remove();
    }
}
