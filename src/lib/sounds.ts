/** أصوات بسيطة عبر WebAudio بدون ملفات صوتية */
let ctx: AudioContext | null = null
let soundEnabled = true

export function setSoundEnabled(v: boolean) {
  soundEnabled = v
}

function getCtx(): AudioContext | null {
  if (!soundEnabled) return null
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function tone(freq: number, duration: number, type: OscillatorType = 'sine', volume = 0.15, delay = 0) {
  const c = getCtx()
  if (!c) return
  const osc = c.createOscillator()
  const gain = c.createGain()
  const start = c.currentTime + delay
  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  gain.gain.setValueAtTime(volume, start)
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration)
  osc.connect(gain)
  gain.connect(c.destination)
  osc.start(start)
  osc.stop(start + duration)
}

export const sounds = {
  click() {
    tone(660, 0.08, 'sine', 0.12)
  },
  pop() {
    tone(440, 0.06, 'square', 0.08)
    tone(880, 0.1, 'sine', 0.1, 0.03)
  },
  flip() {
    tone(520, 0.09, 'triangle', 0.1)
  },
  correct() {
    tone(523, 0.12, 'sine', 0.12)
    tone(784, 0.18, 'sine', 0.12, 0.1)
  },
  wrong() {
    tone(220, 0.2, 'sawtooth', 0.1)
    tone(180, 0.25, 'sawtooth', 0.08, 0.12)
  },
  win() {
    const notes = [523, 659, 784, 1047]
    notes.forEach((n, i) => tone(n, 0.22, 'sine', 0.14, i * 0.12))
  },
  lose() {
    const notes = [392, 330, 262, 196]
    notes.forEach((n, i) => tone(n, 0.25, 'triangle', 0.1, i * 0.14))
  },
  tick() {
    tone(880, 0.05, 'sine', 0.07)
  },
}
