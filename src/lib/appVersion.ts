export interface AndroidReleaseInfo {
  platform: 'android'
  packageName: string
  latestVersion: string
  latestVersionCode: number
  minimumVersionCode: number
  updateUrl: string
}

export interface AppUpdateStatus {
  available: boolean
  required: boolean
  currentVersionCode: number
}

function positiveInteger(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}

export function parseAndroidReleaseInfo(value: unknown): AndroidReleaseInfo | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<AndroidReleaseInfo>
  const latestVersionCode = positiveInteger(candidate.latestVersionCode)
  const minimumVersionCode = positiveInteger(candidate.minimumVersionCode)
  if (
    candidate.platform !== 'android'
    || typeof candidate.packageName !== 'string'
    || typeof candidate.latestVersion !== 'string'
    || latestVersionCode === null
    || latestVersionCode < 1
    || minimumVersionCode === null
    || minimumVersionCode > latestVersionCode
    || typeof candidate.updateUrl !== 'string'
    || !candidate.updateUrl.startsWith('https://play.google.com/')
  ) {
    return null
  }

  return {
    platform: 'android',
    packageName: candidate.packageName,
    latestVersion: candidate.latestVersion,
    latestVersionCode,
    minimumVersionCode,
    updateUrl: candidate.updateUrl,
  }
}

export function evaluateAndroidUpdate(currentBuild: string | number, release: AndroidReleaseInfo): AppUpdateStatus {
  const currentVersionCode = positiveInteger(currentBuild) ?? 0
  return {
    available: currentVersionCode < release.latestVersionCode,
    required: currentVersionCode < release.minimumVersionCode,
    currentVersionCode,
  }
}
