/**
 * Simple UI Manager for the Pause Menu
 */
export class PauseMenu {
    private isPaused: boolean = false;
    private menuElement: HTMLDivElement;
    private onToggleCallback?: (paused: boolean) => void;
  
    constructor(onToggle?: (paused: boolean) => void) {
      this.onToggleCallback = onToggle;
      this.menuElement = this.createMenuElement();
      this.setupListeners();
    }
  
    private createMenuElement(): HTMLDivElement {
      const div = document.createElement('div');
      div.id = 'pause-menu';
      
      // Styling the overlay
      Object.assign(div.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'none',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: '1000',
        color: 'white',
        fontFamily: 'sans-serif'
      });
  
      div.innerHTML = `
        <h1 style="margin-bottom: 20px;">PAUSED</h1>
        <button id="resume-btn" style="
          padding: 10px 30px;
          font-size: 1.2rem;
          cursor: pointer;
          background: #ff4444;
          border: none;
          color: white;
          border-radius: 5px;
        ">RESUME</button>
        <p style="margin-top: 20px; font-size: 0.9rem; opacity: 0.8;">
          Press <b>ESC</b> to toggle
        </p>
      `;
  
      document.body.appendChild(div);
      return div;
    }
  
    private setupListeners(): void {
      // Resume button click
      this.menuElement.querySelector('#resume-btn')?.addEventListener('click', () => {
        this.toggle(false);
      });
  
      // Escape key listener
      window.addEventListener('keydown', (e) => {
        if (e.code === 'Escape') {
          this.toggle();
        }
      });
    }
  
    public toggle(forceState?: boolean): void {
      this.isPaused = forceState !== undefined ? forceState : !this.isPaused;
      this.menuElement.style.display = this.isPaused ? 'flex' : 'none';
      
      if (this.onToggleCallback) {
        this.onToggleCallback(this.isPaused);
      }
    }
  
    public getPaused(): boolean {
      return this.isPaused;
    }
  }