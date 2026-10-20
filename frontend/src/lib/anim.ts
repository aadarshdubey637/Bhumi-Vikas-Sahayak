// Construction-animation clock shared by the 3D scene (reads `progress` every frame, no React renders) and the controls (subscribe).
export interface AnimSnapshot {
  progress: number;
  playing: boolean;
  speed: number;
}

export class AnimController {
  progress: number;
  playing = false;
  speed = 1;
  /** seconds for the whole build at 1x */
  readonly duration: number;
  private snap: AnimSnapshot;
  private listeners = new Set<() => void>();
  private lastEmit = 0;

  constructor(initialProgress = 1, duration = 16) {
    this.progress = initialProgress;
    this.duration = duration;
    this.snap = { progress: initialProgress, playing: false, speed: 1 };
  }

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  };
  getSnapshot = (): AnimSnapshot => this.snap;

  private emit(force: boolean, now = Date.now()): void {
    if (!force && now - this.lastEmit < 80) return;
    this.lastEmit = now;
    this.snap = { progress: this.progress, playing: this.playing, speed: this.speed };
    this.listeners.forEach((l) => l());
  }

  /** Advance by dt seconds; returns true while a further frame is needed. */
  tick(dt: number): boolean {
    if (!this.playing) return false;
    this.progress = Math.min(1, this.progress + (dt * this.speed) / this.duration);
    if (this.progress >= 1) {
      this.playing = false;
      this.emit(true);
      return false;
    }
    this.emit(false);
    return true;
  }
  play(): void {
    if (this.progress >= 1) this.progress = 0;
    this.playing = true;
    this.emit(true);
  }
  pause(): void {
    this.playing = false;
    this.emit(true);
  }
  /** Start again from the foundation. */
  replay(): void {
    this.progress = 0;
    this.playing = true;
    this.emit(true);
  }
  /** Back to the empty site, paused. */
  reset(): void {
    this.progress = 0;
    this.playing = false;
    this.emit(true);
  }
  /** Jump to the finished building. */
  finish(): void {
    this.progress = 1;
    this.playing = false;
    this.emit(true);
  }
  seek(p: number): void {
    this.progress = Math.min(1, Math.max(0, p));
    this.playing = false;
    this.emit(true);
  }
  setSpeed(s: number): void {
    this.speed = s;
    this.emit(true);
  }
}

/** True when this browser can create a WebGL context (the 3D scene needs one; otherwise the SVG preview is used). */
export function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}
