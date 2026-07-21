import { useCallback, useEffect, useRef, useState } from 'react'
import type { Match3AnimationFrame, Match3State } from './engine.js'

export interface Match3VisualEffect {
  key: number
  phase: Match3AnimationFrame['phase']
  indices: number[]
  cascade: number
}

const FRAME_DURATION_MS: Record<Match3AnimationFrame['phase'], number> = {
  swap: 180,
  clear: 220,
  burst: 320,
  fall: 280,
  shuffle: 340,
}

export function useMatch3Animator<T extends Match3State | null>(initialState: T) {
  const [state, setState] = useState<T>(initialState)
  const [animating, setAnimating] = useState(false)
  const [visual, setVisual] = useState<Match3VisualEffect | null>(null)
  const generationRef = useRef(0)
  const effectKeyRef = useRef(0)
  const timersRef = useRef(new Set<ReturnType<typeof setTimeout>>())

  const clearTimers = useCallback(() => {
    for (const timer of timersRef.current) clearTimeout(timer)
    timersRef.current.clear()
  }, [])

  useEffect(() => () => {
    generationRef.current += 1
    clearTimers()
  }, [clearTimers])

  const wait = useCallback((duration: number, generation: number) => new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      timersRef.current.delete(timer)
      resolve(generationRef.current === generation)
    }, duration)
    timersRef.current.add(timer)
  }), [])

  const syncState = useCallback((nextState: Match3State) => {
    generationRef.current += 1
    clearTimers()
    setState(nextState as T)
    setVisual(null)
    setAnimating(false)
  }, [clearTimers])

  const playFrames = useCallback(async (
    frames: Match3AnimationFrame[] | undefined,
    finalState: Match3State,
    onFrame?: (frame: Match3AnimationFrame) => void,
  ): Promise<boolean> => {
    if (!frames?.length) {
      syncState(finalState)
      return true
    }

    const generation = generationRef.current + 1
    generationRef.current = generation
    clearTimers()
    setAnimating(true)

    for (const frame of frames) {
      if (generationRef.current !== generation) return false
      effectKeyRef.current += 1
      setState(frame.state as T)
      setVisual({
        key: effectKeyRef.current,
        phase: frame.phase,
        indices: frame.cleared,
        cascade: frame.cascade,
      })
      onFrame?.(frame)
      if (!await wait(FRAME_DURATION_MS[frame.phase], generation)) return false
    }

    if (generationRef.current !== generation) return false
    setState(finalState as T)
    setVisual(null)
    setAnimating(false)
    return true
  }, [clearTimers, syncState, wait])

  return { state, visual, animating, playFrames, syncState }
}
