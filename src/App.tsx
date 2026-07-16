import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronRight } from 'lucide-react'
import { Toaster } from 'sonner'
import { AppProvider, useApp } from '@/store/AppContext'
import { OnlineProvider } from '@/online/OnlineContext'
import type { GameConfig, GameResult } from '@/types'
import { getGame } from '@/games'
import Onboarding from '@/sections/Onboarding'
import Home from '@/sections/Home'
import Games from '@/sections/Games'
import GameLobby from '@/sections/GameLobby'
import GameResults from '@/sections/GameResults'
import OnlineLobby from '@/sections/OnlineLobby'
import Chat from '@/sections/Chat'
import ChatRoom from '@/sections/ChatRoom'
import Friends from '@/sections/Friends'
import Profile from '@/sections/Profile'
import { TabBar, type TabId } from '@/sections/TabBar'
import { sounds } from '@/lib/sounds'

type View =
  | { kind: 'tabs' }
  | { kind: 'lobby'; gameId: string }
  | { kind: 'playing'; gameId: string; config: GameConfig }
  | { kind: 'results'; result: GameResult; config: GameConfig }
  | { kind: 'online' }

function Shell() {
  const { onboarded, threads, finishGame } = useApp()
  const [tab, setTab] = useState<TabId>('home')
  const [view, setView] = useState<View>({ kind: 'tabs' })
  const [chatRoomId, setChatRoomId] = useState<string | null>(null)

  const unreadChats = useMemo(() => threads.reduce((a, t) => a + t.unread, 0), [threads])

  if (!onboarded) return <Onboarding />

  const openGame = (id: string) => {
    sounds.click()
    if (getGame(id)?.online) setView({ kind: 'online' })
    else setView({ kind: 'lobby', gameId: id })
  }

  const openOnline = () => {
    sounds.click()
    setView({ kind: 'online' })
  }

  const openChat = (id: string) => {
    setTab('chat')
    setChatRoomId(id)
    setView({ kind: 'tabs' })
  }

  const handleFinish = (result: GameResult, config: GameConfig) => {
    finishGame(result)
    setView({ kind: 'results', result, config })
  }

  // شاشة نتائج اللعبة
  if (view.kind === 'results') {
    return (
      <div className="mx-auto max-w-[420px] min-h-dvh relative">
        <GameResults
          result={view.result}
          onReplay={() => setView({ kind: 'playing', gameId: view.result.gameId, config: view.config })}
          onExit={() => {
            setView({ kind: 'tabs' })
            setTab('games')
          }}
        />
      </div>
    )
  }

  // شاشة اللعب
  if (view.kind === 'playing') {
    const game = getGame(view.gameId)!
    const GameComp = game.component
    return (
      <div className="mx-auto max-w-[420px] min-h-dvh flex flex-col">
        <div className="px-4 pt-4 flex items-center gap-2">
          <button
            onClick={() => setView({ kind: 'lobby', gameId: view.gameId })}
            className="flex items-center gap-1 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors"
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
      <div className="mx-auto max-w-[420px] min-h-dvh">
        <GameLobby
          game={game}
          onStart={(config) => setView({ kind: 'playing', gameId: view.gameId, config })}
          onBack={() => setView({ kind: 'tabs' })}
        />
      </div>
    )
  }

  // ردهة الأونلاين
  if (view.kind === 'online') {
    return (
      <div className="mx-auto max-w-[420px] min-h-dvh">
        <OnlineLobby
          onBack={() => {
            setView({ kind: 'tabs' })
            setTab('games')
          }}
        />
      </div>
    )
  }

  // غرفة دردشة مفتوحة
  if (tab === 'chat' && chatRoomId) {
    return (
      <div className="mx-auto max-w-[420px] min-h-dvh">
        <ChatRoom threadId={chatRoomId} onBack={() => setChatRoomId(null)} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[420px] min-h-dvh relative">
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 16 }}
          transition={{ duration: 0.18 }}
        >
          {tab === 'home' && <Home goTab={setTab} openGame={openGame} openChat={openChat} />}
          {tab === 'games' && <Games openGame={openGame} openOnline={openOnline} />}
          {tab === 'chat' && <Chat openChat={(id) => setChatRoomId(id)} />}
          {tab === 'friends' && <Friends />}
          {tab === 'profile' && <Profile />}
        </motion.div>
      </AnimatePresence>
      <TabBar active={tab} onChange={setTab} unreadChats={unreadChats} />
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <OnlineProvider>
        <Shell />
      </OnlineProvider>
      <Toaster position="top-center" richColors dir="rtl" toastOptions={{ style: { fontFamily: 'Cairo, sans-serif' } }} />
    </AppProvider>
  )
}
