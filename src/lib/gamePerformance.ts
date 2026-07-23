import { Capacitor, registerPlugin } from '@capacitor/core'

export type AndroidGameMode = 'standard' | 'performance' | 'battery' | 'unsupported'

export interface GamePerformanceProfile {
  mode: AndroidGameMode
  refreshRate: number
  lowRamDevice: boolean
}

interface GamePerformancePlugin {
  getProfile(): Promise<GamePerformanceProfile>
}

const nativeGamePerformance = registerPlugin<GamePerformancePlugin>('GamePerformance')
const DEFAULT_PROFILE: GamePerformanceProfile = {
  mode: 'standard',
  refreshRate: 60,
  lowRamDevice: false,
}

let cachedProfile: Promise<GamePerformanceProfile> | null = null

export function getGamePerformanceProfile(): Promise<GamePerformanceProfile> {
  if (!Capacitor.isNativePlatform()) {
    return Promise.resolve(DEFAULT_PROFILE)
  }
  cachedProfile ??= nativeGamePerformance.getProfile()
    .then((profile) => ({
      mode: profile.mode ?? 'standard',
      refreshRate: Math.max(30, Math.min(240, Number(profile.refreshRate) || 60)),
      lowRamDevice: Boolean(profile.lowRamDevice),
    }))
    .catch(() => DEFAULT_PROFILE)
  return cachedProfile
}
