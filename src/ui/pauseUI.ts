import './pauseUI.css';

/**
 * Pause overlay DOM only; visibility and paused vs running are owned by the game loop (e.g. main).
 */
export class PauseMenu {
  private menuElement: HTMLDivElement;

  constructor(private readonly onResume?: () => void) {
    this.menuElement = this.createMenuElement();
    this.setupListeners();
  }

  private createMenuElement(): HTMLDivElement {
    const div = document.createElement('div');
    div.id = 'pause-menu';

    div.innerHTML = `
        <h1 class="pause-menu__title">PAUSED</h1>
        <button type="button" id="resume-btn" class="pause-menu__resume-btn">RESUME</button>
        <p class="pause-menu__hint">
          Press <b>ESC</b> to toggle
        </p>
      `;

    document.body.appendChild(div);
    return div;
  }

  private setupListeners(): void {
    // Keep pointer/mouse events from bubbling to `window` — `MouseState` uses window mousedown
    // to request pointer lock; that can run before this button's `click` and cancel the click,
    // leaving the game paused while the pointer is captured.
    const stopBubble = (e: Event) => e.stopPropagation();
    this.menuElement.addEventListener('mousedown', stopBubble);
    this.menuElement.addEventListener('pointerdown', stopBubble);

    this.menuElement.querySelector('#resume-btn')?.addEventListener('click', () => {
      this.onResume?.();
    });
  }

  public setVisible(visible: boolean): void {
    this.menuElement.classList.toggle('pause-menu--visible', visible);
  }
}
