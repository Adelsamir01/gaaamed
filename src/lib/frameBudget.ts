export type RenderQuality = 'high' | 'balanced' | 'low'

export interface FrameBudgetSample {
  quality: RenderQuality
  p95FrameMs: number
  changed: boolean
}

interface FrameBudgetOptions {
  initialQuality?: RenderQuality
  sampleCount?: number
}

/**
 * Uses full frame intervals rather than FPS averages. P95 catches the pauses
 * people perceive while avoiding a quality change because of one isolated GC.
 */
export class FrameBudgetController {
  private samples: number[] = []
  private recoveryWindows = 0
  private readonly sampleCount: number
  quality: RenderQuality

  constructor(options: FrameBudgetOptions = {}) {
    this.quality = options.initialQuality ?? 'high'
    this.sampleCount = Math.max(30, options.sampleCount ?? 90)
  }

  reset(quality: RenderQuality = this.quality): void {
    this.quality = quality
    this.samples = []
    this.recoveryWindows = 0
  }

  record(frameIntervalMs: number): FrameBudgetSample | null {
    if (!Number.isFinite(frameIntervalMs) || frameIntervalMs <= 0 || frameIntervalMs > 250) return null
    this.samples.push(frameIntervalMs)
    if (this.samples.length < this.sampleCount) return null

    const ordered = this.samples.splice(0).sort((first, second) => first - second)
    const p95FrameMs = ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * 0.95))]
    const previous = this.quality

    if (this.quality === 'high' && p95FrameMs > 24) {
      this.quality = 'balanced'
      this.recoveryWindows = 0
    } else if (this.quality === 'balanced' && p95FrameMs > 31) {
      this.quality = 'low'
      this.recoveryWindows = 0
    } else if (p95FrameMs < 19) {
      this.recoveryWindows += 1
      if (this.recoveryWindows >= 4) {
        this.quality = this.quality === 'low' ? 'balanced' : 'high'
        this.recoveryWindows = 0
      }
    } else {
      this.recoveryWindows = 0
    }

    return {
      quality: this.quality,
      p95FrameMs,
      changed: previous !== this.quality,
    }
  }
}
