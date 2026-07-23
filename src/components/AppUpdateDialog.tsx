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
        className="w-[calc(100%_-_2rem)] max-w-[370px] overflow-hidden rounded-[2rem] border-emerald-300/25 bg-background p-0 shadow-2xl"
      >
        <div className="relative overflow-hidden bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 px-6 pb-6 pt-8 text-center text-white">
          <div className="absolute -right-8 -top-10 h-28 w-28 rounded-full bg-white/10 blur-sm" />
          <div className="absolute -bottom-12 -left-7 h-32 w-32 rounded-full bg-yellow-200/15 blur-sm" />
          <Sparkles className="absolute right-7 top-7 h-5 w-5 text-yellow-200" aria-hidden="true" />
          <motion.div
            initial={{ scale: 0.75, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 16 }}
            className="mx-auto grid h-20 w-20 place-items-center rounded-[1.7rem] border border-white/40 bg-white/20 text-4xl shadow-lg backdrop-blur"
            aria-hidden="true"
          >
            🎁
          </motion.div>
          <AlertDialogHeader className="mt-4 space-y-2 text-center">
            <AlertDialogTitle className="text-center text-xl font-black text-white">
              تحديث جديد وصل! ✨
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center text-sm font-semibold leading-6 text-white/90">
              {prompt?.required
                ? 'لازم تحدّث ديدوس عشان تكمّل وتدخل التطبيق بأحدث نسخة.'
                : 'نزّل آخر نسخة من ديدوس عشان تستمتع بأحدث الألعاب والتحسينات.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
        </div>

        <div className="space-y-4 px-5 pb-5 pt-4">
          {prompt && (
            <div className="flex items-center justify-center gap-2 rounded-2xl bg-muted/70 px-3 py-2 text-xs font-bold text-muted-foreground">
              <span>نسختك {prompt.app.version}</span>
              <span aria-hidden="true">←</span>
              <span className="text-emerald-500">الجديدة {prompt.release.latestVersion}</span>
            </div>
          )}

          {storeError && (
            <p className="text-center text-xs font-bold text-red-400" role="alert">
              معرفناش نفتح Google Play. اتأكد إنه موجود وحاول تاني.
            </p>
          )}

          <AlertDialogFooter className="flex-row gap-2 sm:justify-center">
            {!prompt?.required && (
              <Button type="button" variant="ghost" className="h-12 flex-1 rounded-2xl" onClick={remindLater}>
                بعدها
              </Button>
            )}
            <Button
              type="button"
              className="h-12 flex-[1.35] rounded-2xl bg-emerald-500 font-black text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-400"
              disabled={openingStore}
              onClick={() => void openPlayStore()}
            >
              {openingStore
                ? <LoaderCircle className="animate-spin" aria-hidden="true" />
                : <Download aria-hidden="true" />}
              حدّث دلوقتي
            </Button>
          </AlertDialogFooter>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}
