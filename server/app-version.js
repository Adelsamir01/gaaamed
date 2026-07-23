const DEFAULT_LATEST_VERSION = '1.14.0'
const DEFAULT_LATEST_VERSION_CODE = 23
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.dedos.game'

function integerSetting(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback
}

export function androidReleaseInfo(env = process.env) {
  const latestVersionCode = Math.max(
    1,
    integerSetting(env.DEDOS_ANDROID_LATEST_VERSION_CODE, DEFAULT_LATEST_VERSION_CODE),
  )
  const latestVersion = String(env.DEDOS_ANDROID_LATEST_VERSION || DEFAULT_LATEST_VERSION).trim()

  return {
    platform: 'android',
    packageName: 'com.dedos.game',
    latestVersion: latestVersion || DEFAULT_LATEST_VERSION,
    latestVersionCode,
    // Every published update is mandatory: outdated builds cannot dismiss
    // the update dialog and continue into the app.
    minimumVersionCode: latestVersionCode,
    updateUrl: PLAY_STORE_URL,
  }
}
