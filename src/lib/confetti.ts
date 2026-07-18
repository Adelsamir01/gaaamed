import type confetti from 'canvas-confetti'

let confettiModule: Promise<{ default: typeof confetti }> | null = null

/** Load the canvas engine only when a celebration is actually shown. */
export function launchConfetti(options: confetti.Options) {
  const module = (confettiModule ??= import('canvas-confetti'))
  void module.then(({ default: fire }) => fire(options))
}
