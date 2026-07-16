import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import type { ChatThread, Friend, GameResult, GameStats, Profile, Settings } from '@/types'
import { levelFromXp } from '@/types'
import { FRIENDS_SEED } from '@/data/friends'
import { CHAT_SEED } from '@/data/chat'
import { setSoundEnabled } from '@/lib/sounds'

const STORAGE_KEY = 'gaaamed-state-v1'

interface PersistedState {
  onboarded: boolean
  profile: Profile
  stats: Record<string, GameStats>
  friends: Friend[]
  threads: ChatThread[]
  settings: Settings
  lastDailyClaim: string | null
}

interface AppContextValue extends PersistedState {
  completeOnboarding: (name: string, avatar: string) => void
  addCoins: (n: number) => void
  addXp: (n: number) => void
  finishGame: (result: GameResult) => void
  claimDailyReward: () => boolean
  canClaimDaily: boolean
  sendMessage: (threadId: string, text: string) => void
  receiveMessage: (threadId: string, senderName: string, senderAvatar: string, text: string) => void
  markThreadRead: (threadId: string) => void
  updateProfile: (name: string, avatar: string) => void
  toggleSound: () => void
  resetProgress: () => void
}

const defaultState: PersistedState = {
  onboarded: false,
  profile: { name: '', avatar: '😎', xp: 0, coins: 100 },
  stats: {},
  friends: FRIENDS_SEED,
  threads: CHAT_SEED,
  settings: { sound: true },
  lastDailyClaim: null,
}

function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultState
    const parsed = JSON.parse(raw) as PersistedState
    return { ...defaultState, ...parsed, friends: parsed.friends?.length ? parsed.friends : FRIENDS_SEED }
  } catch {
    return defaultState
  }
}

const AppContext = createContext<AppContextValue | null>(null)

function todayKey() {
  return new Date().toDateString()
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedState>(loadState)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  useEffect(() => {
    setSoundEnabled(state.settings.sound)
  }, [state.settings.sound])

  const completeOnboarding = useCallback((name: string, avatar: string) => {
    setState((s) => ({ ...s, onboarded: true, profile: { ...s.profile, name, avatar } }))
  }, [])

  const addCoins = useCallback((n: number) => {
    setState((s) => ({ ...s, profile: { ...s.profile, coins: Math.max(0, s.profile.coins + n) } }))
  }, [])

  const addXp = useCallback((n: number) => {
    setState((s) => {
      const oldLevel = levelFromXp(s.profile.xp)
      const newXp = s.profile.xp + n
      const newLevel = levelFromXp(newXp)
      if (newLevel > oldLevel) {
        setTimeout(() => {
          toast.success(`🎉 مبروك! وصلت للمستوى ${newLevel}`, {
            description: 'استمر في اللعب لتكسب المزيد من النقاط',
          })
        }, 300)
      }
      return { ...s, profile: { ...s.profile, xp: newXp } }
    })
  }, [])

  const finishGame = useCallback((result: GameResult) => {
    setState((s) => {
      const prev = s.stats[result.gameId] ?? { played: 0, won: 0 }
      let bestScore = prev.bestScore
      if (result.bestCandidate !== undefined) {
        if (bestScore === undefined) bestScore = result.bestCandidate
        else if (result.lowerIsBetter) bestScore = Math.min(bestScore, result.bestCandidate)
        else bestScore = Math.max(bestScore, result.bestCandidate)
      }
      const won = result.outcome === 'win'
      const oldLevel = levelFromXp(s.profile.xp)
      const newXp = s.profile.xp + result.xpEarned
      const newLevel = levelFromXp(newXp)
      if (newLevel > oldLevel) {
        setTimeout(() => {
          toast.success(`🎉 مبروك! وصلت للمستوى ${newLevel}`)
        }, 800)
      }
      return {
        ...s,
        profile: { ...s.profile, xp: newXp, coins: s.profile.coins + result.coinsEarned },
        stats: {
          ...s.stats,
          [result.gameId]: { played: prev.played + 1, won: prev.won + (won ? 1 : 0), bestScore },
        },
      }
    })
  }, [])

  const canClaimDaily = state.lastDailyClaim !== todayKey()

  const claimDailyReward = useCallback(() => {
    let ok = false
    setState((s) => {
      if (s.lastDailyClaim === todayKey()) return s
      ok = true
      return { ...s, lastDailyClaim: todayKey(), profile: { ...s.profile, coins: s.profile.coins + 50 } }
    })
    return ok
  }, [])

  const sendMessage = useCallback((threadId: string, text: string) => {
    setState((s) => ({
      ...s,
      threads: s.threads.map((t) =>
        t.id === threadId
          ? {
              ...t,
              messages: [
                ...t.messages,
                { id: `me-${Date.now()}`, senderId: 'me', senderName: s.profile.name || 'أنا', senderAvatar: s.profile.avatar, text, time: Date.now() },
              ],
            }
          : t,
      ),
    }))
  }, [])

  const receiveMessage = useCallback((threadId: string, senderName: string, senderAvatar: string, text: string) => {
    setState((s) => ({
      ...s,
      threads: s.threads.map((t) =>
        t.id === threadId
          ? {
              ...t,
              messages: [
                ...t.messages,
                { id: `bot-${Date.now()}-${Math.random()}`, senderId: 'bot', senderName, senderAvatar, text, time: Date.now() },
              ],
            }
          : t,
      ),
    }))
  }, [])

  const markThreadRead = useCallback((threadId: string) => {
    setState((s) => ({
      ...s,
      threads: s.threads.map((t) => (t.id === threadId ? { ...t, unread: 0 } : t)),
    }))
  }, [])

  const updateProfile = useCallback((name: string, avatar: string) => {
    setState((s) => ({ ...s, profile: { ...s.profile, name, avatar } }))
  }, [])

  const toggleSound = useCallback(() => {
    setState((s) => ({ ...s, settings: { sound: !s.settings.sound } }))
  }, [])

  const resetProgress = useCallback(() => {
    setState(() => ({
      ...defaultState,
      onboarded: true,
      profile: { ...defaultState.profile, name: state.profile.name, avatar: state.profile.avatar },
    }))
    toast.success('تمت إعادة تعيين التقدم بنجاح')
  }, [state.profile.name, state.profile.avatar])

  const value = useMemo<AppContextValue>(
    () => ({
      ...state,
      canClaimDaily,
      completeOnboarding,
      addCoins,
      addXp,
      finishGame,
      claimDailyReward,
      sendMessage,
      receiveMessage,
      markThreadRead,
      updateProfile,
      toggleSound,
      resetProgress,
    }),
    [state, canClaimDaily, completeOnboarding, addCoins, addXp, finishGame, claimDailyReward, sendMessage, receiveMessage, markThreadRead, updateProfile, toggleSound, resetProgress],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
