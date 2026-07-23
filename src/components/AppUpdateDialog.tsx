import { useCallback, useEffect, useRef, useState } from 'react'
import { App, type AppInfo } from '@capacitor/app'
import { AppLauncher } from '@capacitor/app-launcher'
import { Capacitor, type PluginListenerHandle } from '@capacitor/core'
import { motion } from 'framer-motion'
import { Download, LoaderCircle, Sparkles } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  evaluateAndroidUpdate,
  parseAndroidReleaseInfo,
  type AndroidReleaseInfo,
} from '@/lib/appVersion'

const VERSION_ENDPOINT = 'https://dedos.adelsamir.com/api/app-version'
const PLAY_STORE_MARKET_URL = 'market://details?id=com.dedos.game'
const CHECK_INTERVAL_MS = 15 * 60 * 1000
const SNOOZE_MS = 24 * 60 * 60 * 1000
const REQUEST_TIMEOUT_MS = 7_000

interface UpdatePrompt {
  app: AppInfo
  release: AndroidReleaseInfo
  required: boolean
}

export default function AppUpdateDialog() {
  const [prompt, setPrompt] = useState<UpdatePrompt | null>(null)
  const [openingStore, setOpeningStore] = useState(false)
  const [storeError, setStoreError] = useState(false)
  const lastCheckAt = useRef(0)

  const checkForUpdate = useCallback(async (force = false) => {
    if (Capacitor.getPlatform() !== 'android') return
    const now = Date.now()
    if (!force && now - lastCheckAt.current < CHECK_INTERVAL_MS) return
    lastCheckAt.current = now

    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const [app, response] = await Promise.all([
        App.getInfo(),
        fetch(VERSION_ENDPOINT, {
          cache: 'no-store',
          headers: { accept: 'application/json' },
          signal: controller.signal,
        }),
      ])
      if (!response.ok) return
      const release = parseAndroidReleaseInfo(await response.json())
      if (!release || release.packageName !== app.id) return

      const status = evaluateAndroidUpdate(app.build, release)
      if (!status.available) {
        setPrompt(null)
        return
      }

      const snoozedUntil = Number(localStorage.getItem(`dedos:update-snooze:${release.latestVersionCode}`) || 0)
      if (!status.required && snoozedUntil > now) return
      setPrompt({ app, release, required: status.required })
    } catch {
      // Version checks must never delay startup or interrupt offline play.
    } finally {
      window.clearTimeout(timeout)
    }
  }, [])

  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return
    let disposed = false
    let appStateListener: PluginListenerHandle | undefined

    const initialTimer = window.setTimeout(() => {
      if (!disposed) void checkForUpdate(true)
    }, 900)

    void App.addListener('appStateChange', ({ isActive }) => {
      if (isActive && !disposed) void checkForUpdate()
    }).then((listener) => {
      if (disposed) void listener.remove()
      else appStateListener = listener
    })

    return () => {
      disposed = true
      window.clearTimeout(initialTimer)
      void appStateListener?.remove()
    }
  }, [checkForUpdate])

  const remindLater = useCallback(() => {
    if (!prompt || prompt.required) return
    localStorage.setItem(
      `dedos:update-snooze:${prompt.release.latestVersionCode}`,
      String(Date.now() + SNOOZE_MS),
    )
    setPrompt(null)
  }, [prompt])

  const openPlayStore = useCallback(async () => {
    if (!prompt || openingStore) return
    setOpeningStore(true)
    setStoreError(false)
    try {
      const marketResult = await AppLauncher.openUrl({ url: PLAY_STORE_MARKET_URL })
      if (!marketResult.completed) {
        const webResult = await AppLauncher.openUrl({ url: prompt.release.updateUrl })
        if (!webResult.completed) throw new Error('Unable to open Play Store')
      }
      if (!prompt.required) setPrompt(null)
    } catch {
      setStoreError(true)
    } finally {
      setOpeningStore(false)
    }
  }, [openingStore, prompt])

  return (
    <AlertDialog
      open={Boolean(prompt)}
      onOpenChange={(open) => {
        if (!open && !prompt?.required) remindLater()
      }}
    >
      <AlertDialogContent
        dir="rtl"
        className="left-1/2 top-1/2 max-h-[94dvh] w-[94vw] max-w-[400px] -translate-x-1/2 -translate-y-1/2 gap-0 overflow-y-auto overscroll-contain rounded-[2rem] border-emerald-300/35 bg-[#091522] p-0 shadow-[0_28px_90px_rgba(0,0,0,0.72),0_0_0_1px_rgba(255,255,255,0.04)]"
      >
        <div className="relative overflow-hidden bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 px-6 pb-7 pt-7 text-center text-white">
          <div className="absolute -right-8 -top-10 h-28 w-28 rounded-full bg-white/10 blur-sm" />
          <div className="absolute -bottom-12 -left-7 h-32 w-32 rounded-full bg-yellow-200/15 blur-sm" />
          <Sparkles className="absolute right-7 top-7 h-5 w-5 text-yellow-200" aria-hidden="true" />
          <motion.div
            initial={{ scale: 0.75, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 16 }}
            className="mx-auto grid h-24 w-24 place-items-center rounded-[2rem] border border-white/45 bg-white/20 text-5xl shadow-[0_16px_35px_rgba(4,47,46,0.28)] backdrop-blur"
            aria-hidden="true"
          >
            🎁
          </motion.div>
          <AlertDialogHeader className="mt-5 space-y-2.5 text-center">
            <AlertDialogTitle className="text-center text-2xl font-black leading-tight text-white">
              تحديث جديد وصل! ✨
            </AlertDialogTitle>
            <AlertDialogDescription className="mx-auto max-w-[310px] text-center text-[0.95rem] font-semibold leading-7 text-white/90">
              {prompt?.required
                ? 'لازم تحدّث ديدوس عشان تكمّل وتدخل التطبيق بأحدث نسخة.'
                : 'نزّل آخر نسخة من ديدوس عشان تستمتع بأحدث الألعاب والتحسينات.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
        </div>

        <div className="space-y-5 px-5 pb-6 pt-5">
          {prompt && (
            <div className="flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.06] px-3 py-2.5 text-xs font-bold text-slate-300">
              <span>نسختك {prompt.app.version}</span>
              <span aria-hidden="true">←</span>
              <span className="text-emerald-300">الجديدة {prompt.release.latestVersion}</span>
            </div>
          )}

          {storeError && (
            <p className="text-center text-xs font-bold text-red-400" role="alert">
              معرفناش نفتح Google Play. اتأكد إنه موجود وحاول تاني.
            </p>
          )}

          <AlertDialogFooter className="flex w-full flex-col gap-3 sm:flex-col">
            <Button
              type="button"
              className="h-16 w-full rounded-[1.35rem] bg-gradient-to-l from-emerald-400 via-teal-400 to-cyan-400 px-6 text-lg font-black text-slate-950 shadow-[0_14px_34px_rgba(45,212,191,0.28)] transition-transform hover:from-emerald-300 hover:to-cyan-300 active:scale-[0.98]"
              disabled={openingStore}
              onClick={() => void openPlayStore()}
            >
              {openingStore
                ? <LoaderCircle className="size-6 animate-spin" aria-hidden="true" />
                : <Download className="size-6" aria-hidden="true" />}
              حدّث دلوقتي
            </Button>
            {!prompt?.required && (
              <Button
                type="button"
                variant="ghost"
                className="h-12 w-full rounded-2xl text-slate-300 hover:bg-white/[0.08] hover:text-white"
                onClick={remindLater}
              >
                بعدها
              </Button>
            )}
          </AlertDialogFooter>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}
