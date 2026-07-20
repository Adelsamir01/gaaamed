import { Preferences } from '@capacitor/preferences'

function legacyValue(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/**
 * Native-safe string storage. Preferences persists outside the WebView cache;
 * localStorage is only used as a migration/fallback path for older installs.
 */
export async function readStoredString(key: string): Promise<string | null> {
  try {
    const { value } = await Preferences.get({ key })
    if (value !== null) return value
  } catch {
    // The browser fallback below keeps development and restricted WebViews usable.
  }

  const legacy = legacyValue(key)
  if (legacy !== null) {
    await writeStoredString(key, legacy)
  }
  return legacy
}

export async function writeStoredString(key: string, value: string): Promise<void> {
  try {
    await Preferences.set({ key, value })
    return
  } catch {
    try {
      localStorage.setItem(key, value)
    } catch {
      // Storage failures must never stop a game from running.
    }
  }
}

export async function removeStoredValue(key: string): Promise<void> {
  try {
    await Preferences.remove({ key })
  } catch {
    // Continue with legacy cleanup.
  }
  try {
    localStorage.removeItem(key)
  } catch {
    // Ignore unavailable WebView storage.
  }
}

export async function readStoredJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await readStoredString(key)
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export async function writeStoredJson(key: string, value: unknown): Promise<void> {
  await writeStoredString(key, JSON.stringify(value))
}
