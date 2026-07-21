import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronRight } from 'lucide-react'
import { Toaster } from 'sonner'
import { AppProvider, useApp } from '@/store/AppContext'
import { OnlineProvider, useOnline } from '@/online/OnlineContext'
import type { GameConfig, GameResult } from '@/types'
import { getGame } from '@/games'
import { TabBar, type TabId } from '@/sections/TabBar'
import { sounds } from '@/lib/sounds'
import { consumePendingNotificationThread, OPEN_NOTIFICATION_CHAT_EVENT } from '@/lib/pushNotifications'

// Only the shell and active screen are needed at startup. The rest are fetched
// from the local app bundle on demand, reducing parse time and peak JS memory.
const Onboarding = lazy(() => import('@/sections/Onboarding'))
const Home = lazy(() => import('@/sections/Home'))
const Games = lazy(() => import('@/sections/Games'))
const GameLobby = lazy(() => import('@/sections/GameLobby'))
const GameResults = lazy(() => import('@/sections/GameResults'))
const OnlineLobby = lazy(() => import('@/sections/OnlineLobby'))
const OnlineSnake = lazy(() => import('@/games/online/OnlineSnake'))
const Chat = lazy(() => import('@/sections/Chat'))
const ChatRoom = lazy(() => import('@/sections/ChatRoom'))
const Friends = lazy(() => import('@/sections/Friends'))
const Profile = lazy(() => import('@/sections/Profile'))

function AppLoader() {
  return (
    <div className="min-h-dvh grid place-items-center bg-background text-foreground" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 rounded-full border-4 border-emerald-400/25 border-t-emerald-400 animate-spin" />
        <span className="text-sm font-bold text-muted-foreground">جارٍ التحميل…</span>
      </div>
    </div>
  )
}

type View =
  | { kind: 'tabs' }
  | { kind: 'lobby'; gameId: string }
  | { kind: 'playing'; gameId: string; config: GameConfig }
  | { kind: 'results'; result: GameResult; config: GameConfig }
  | { kind: 'online'; quickGameId?: string }
  | { kind: 'snake-online' }

function Shell() {
  const { onboarded, profile, finishGame } = useApp()
  const online = useOnline()
  const [tab, setTab] = useState<TabId>('home')
  const [view, setView] = useState<View>({ kind: 'tabs' })
  const [chatRoomId, setChatRoomId] = useState<string | null>(null)
  const [friendMatchThreadId, setFriendMatchThreadId] = useState<string | null>(null)
  const tabHistoryRef = useRef<TabId[]>([])
  const activeTabRef = useRef<TabId>('home')
  const tabScrollRef = useRef<Record<TabId, number>>({ home: 0, games: 0, chat: 0, friends: 0, profile: 0 })

  const activateTab = useCallback((nextTab: TabId, rememberHistory = true) => {
    const currentTab = activeTabRef.current
    if (currentTab === nextTab) return

    tabScrollRef.current[currentTab] = window.scrollY
    if (rememberHistory) {
      tabHistoryRef.current = [...tabHistoryRef.current, currentTab].slice(-12)
    }

    activeTabRef.current = nextTab
    setTab(nextTab)
    requestAnimationFrame(() => window.scrollTo({ top: tabScrollRef.current[nextTab], behavior: 'auto' }))
  }, [])

  const changeTab = useCallback((nextTab: TabId) => activateTab(nextTab), [activateTab])

  const openChat = useCallback((id: string) => {
    activateTab('chat')
    setChatRoomId(id)
    setView({ kind: 'tabs' })
  }, [activateTab])

  useEffect(() => {
    if (!onboarded) return
    const handleNotificationChat = (event: Event) => {
      const threadId = (event as CustomEvent<{ threadId?: string }>).detail?.threadId
      if (threadId) openChat(threadId)
    }
    window.addEventListener(OPEN_NOTIFICATION_CHAT_EVENT, handleNotificationChat)
    const pendingThreadId = consumePendingNotificationThread()
    if (pendingThreadId) openChat(pendingThreadId)
    return () => window.removeEventListener(OPEN_NOTIFICATION_CHAT_EVENT, handleNotificationChat)
  }, [onboarded, openChat])

  const unreadChats = useMemo(() => online.threads.reduce((a, t) => a + t.unread, 0), [online.threads])

  // عندما أرسل دعوة لعبة: افتح التحدي تلقائيًا وانتظر أصدقائي.
  const ownInvite = online.ownInviteRoom
  useEffect(() => {
    if (!ownInvite) return
    online.clearOwnInviteRoom()
    setFriendMatchThreadId(ownInvite.threadId)
    online.acceptGameInvite(ownInvite.code, profile.name, profile.avatar)
    setChatRoomId(null)
    setView({ kind: 'online' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownInvite])

  const handleAndroidBack = useCallback(() => {
    // A modal is the top-most in-app step. Let Radix dismiss it before moving
    // the underlying screen so Android back behaves like users expect.
    if (document.querySelector('[role="dialog"], [role="alertdialog"]')) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }))
      return
    }

    // Onboarding and the home tab are roots: Android back deliberately keeps
    // MainActivity open instead of exiting the app.
    if (!onboarded) return

    if (view.kind === 'results') {
      setView({ kind: 'lobby', gameId: view.result.gameId })
      return
    }
    if (view.kind === 'playing') {
      setView({ kind: 'lobby', gameId: view.gameId })
      return
    }
    if (view.kind === 'lobby') {
      setView({ kind: 'tabs' })
      return
    }
    if (view.kind === 'online') {
      online.leaveRoom()
      setView({ kind: 'tabs' })
      activateTab('games', false)
      return
    }
    if (view.kind === 'snake-online') {
      setView({ kind: 'lobby', gameId: 'snake' })
      return
    }
    if (chatRoomId) {
      setChatRoomId(null)
      return
    }
    const previousTab = tabHistoryRef.current.pop()
    if (previousTab) activateTab(previousTab, false)
    else if (tab !== 'home') activateTab('home', false)
  }, [activateTab, chatRoomId, onboarded, online, tab, view])

  useEffect(() => {
    window.addEventListener('androidBackButton', handleAndroidBack)
    return () => window.removeEventListener('androidBackButton', handleAndroidBack)
  }, [handleAndroidBack])

  if (!onboarded) return <Onboarding />

  const openGame = (id: string) => {
    sounds.click()
    setView({ kind: 'lobby', gameId: id })
  }

  // قبول تحدٍ من دعوة دردشة
  const acceptInvite = (inviteToken: string) => {
    setFriendMatchThreadId(chatRoomId)
    online.acceptGameInvite(inviteToken, profile.name, profile.avatar)
    setChatRoomId(null)
    setView({ kind: 'online' })
  }

  const handleFinish = (result: GameResult, config: GameConfig) => {
    finishGame(result)
    setView({ kind: 'results', result, config })
  }

  const returnToFriendChat = (threadId: string) => {
    online.leaveRoom()
    setFriendMatchThreadId(null)
    setView({ kind: 'tabs' })
    activateTab('chat', false)
    setChatRoomId(threadId)
  }

  // شاشة نتائج اللعبة
  if (view.kind === 'results') {
    return (
      <div className="mx-auto max-w-[420px] min-h-dvh relative safe-top">
        <GameResults
          result={view.result}
          onReplay={() => setView({ kind: 'playing', gameId: view.result.gameId, config: view.config })}
          onExit={() => {
            setView({ kind: 'tabs' })
            activateTab('games', false)
          }}
        />
      </div>
    )
  }

  // شاشة اللعب
  if (view.kind === 'snake-online') {
    return (
      <div className="mx-auto h-dvh max-w-[420px] overflow-hidden safe-top">
        <OnlineSnake onExit={() => setView({ kind: 'lobby', gameId: 'snake' })} />
      </div>
    )
  }

  if (view.kind === 'playing') {
    const game = getGame(view.gameId)!
    const GameComp = game.component
    if (view.gameId === 'bank-el7az') {
      return (
        <div className="h-dvh overflow-hidden">
          <motion.div
            key={view.gameId + JSON.stringify(view.config)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="h-full"
          >
            <GameComp
              config={view.config}
              onFinish={(r) => handleFinish(r, view.config)}
              onExit={() => setView({ kind: 'lobby', gameId: view.gameId })}
            />
          </motion.div>
        </div>
      )
    }
    if (view.gameId === 'snake') {
      return (
        <div className="mx-auto h-dvh max-w-[420px] overflow-hidden safe-top">
          <motion.div
            key={view.gameId + JSON.stringify(view.config)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="h-full"
          >
            <GameComp
              config={view.config}
              onFinish={(r) => handleFinish(r, view.config)}
              onExit={() => setView({ kind: 'lobby', gameId: view.gameId })}
            />
          </motion.div>
        </div>
      )
    }
    return (
      <div className="mx-auto max-w-[420px] min-h-dvh flex flex-col safe-top">
        <div className="px-4 pt-4 flex items-center gap-2">
          <button
            onClick={() => setView({ kind: 'lobby', gameId: view.gameId })}
            className="min-h-11 flex items-center gap-1 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors"
            aria-label="العودة إلى إعدادات اللعبة"
          >
            <ChevronRight className="w-4 h-4" />
            خروج
          </button>
          <span className="flex-1 text-center font-extrabold">
            {game.emoji} {game.name}
          </span>
          <span className="w-14" />
        </div>
        <motion.div key={view.gameId + JSON.stringify(view.config)} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex-1 px-4 pb-8">
          <GameComp config={view.config} onFinish={(r) => handleFinish(r, view.config)} />
        </motion.div>
      </div>
    )
  }

  // شاشة اللوبي
  if (view.kind === 'lobby') {
    const game = getGame(view.gameId)!
    return (
      <div className="mx-auto max-w-[420px] min-h-dvh safe-top">
        <GameLobby
          game={game}
          onStart={(config) => setView({ kind: 'playing', gameId: view.gameId, config })}
          onOnline={() => {
            setFriendMatchThreadId(null)
            setView(view.gameId === 'snake'
              ? { kind: 'snake-online' }
              : { kind: 'online', quickGameId: view.gameId })
          }}
          onBack={() => setView({ kind: 'tabs' })}
        />
      </div>
    )
  }

  // ردهة الأونلاين
  if (view.kind === 'online') {
    return (
      <div className="mx-auto max-w-[420px] min-h-dvh safe-top">
        <OnlineLobby
          quickGameId={view.quickGameId}
          friendThreadId={friendMatchThreadId}
          onFriendMatchFinished={returnToFriendChat}
          onBack={() => {
            setFriendMatchThreadId(null)
            setView({ kind: 'tabs' })
            activateTab('games', false)
          }}
        />
      </div>
    )
  }

  // غرفة دردشة مفتوحة
  if (tab === 'chat' && chatRoomId) {
    return (
      <div className="mx-auto max-w-[420px] h-dvh overflow-hidden safe-top">
        <ChatRoom threadId={chatRoomId} onBack={() => setChatRoomId(null)} onAcceptInvite={acceptInvite} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[420px] min-h-dvh relative safe-top">
      <div className="tab-panels">
        <section className="tab-panel" hidden={tab !== 'home'} aria-hidden={tab !== 'home'}>
          <Home goTab={changeTab} openGame={openGame} openChat={openChat} />
        </section>
        <section className="tab-panel" hidden={tab !== 'games'} aria-hidden={tab !== 'games'}>
          <Games openGame={openGame} />
        </section>
        <section className="tab-panel" hidden={tab !== 'chat'} aria-hidden={tab !== 'chat'}>
          <Chat openChat={(id) => setChatRoomId(id)} />
        </section>
        <section className="tab-panel" hidden={tab !== 'friends'} aria-hidden={tab !== 'friends'}>
          <Friends openChat={openChat} />
        </section>
        <section className="tab-panel" hidden={tab !== 'profile'} aria-hidden={tab !== 'profile'}>
          <Profile />
        </section>
      </div>
      <TabBar
        active={tab}
        onChange={changeTab}
        unreadChats={unreadChats}
        pendingFriendRequests={online.incomingFriendRequests.length}
      />
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <OnlineProvider>
        <Suspense fallback={<AppLoader />}>
          <Shell />
        </Suspense>
      </OnlineProvider>
      <Toaster position="top-center" richColors dir="rtl" toastOptions={{ style: { fontFamily: 'Cairo, sans-serif' } }} />
    </AppProvider>
  )
}
