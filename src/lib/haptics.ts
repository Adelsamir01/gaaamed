import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'

let lastFeedbackAt = 0

function nativeFeedback(action: () => Promise<void>, minimumGapMs = 35): void {
  if (!Capacitor.isNativePlatform()) return
  const now = performance.now()
  if (now - lastFeedbackAt < minimumGapMs) return
  lastFeedbackAt = now
  void action().catch(() => {
    // Haptics are enhancement-only. Some tablets and emulators do not expose a
    // vibrator, and gameplay must remain unaffected on those devices.
  })
}

export const haptics = {
  tap() {
    nativeFeedback(() => Haptics.impact({ style: ImpactStyle.Light }))
  },
  move() {
    nativeFeedback(() => Haptics.impact({ style: ImpactStyle.Medium }), 55)
  },
  success() {
    nativeFeedback(() => Haptics.notification({ type: NotificationType.Success }), 120)
  },
  warning() {
    nativeFeedback(() => Haptics.notification({ type: NotificationType.Warning }), 120)
  },
}
