import assert from 'node:assert/strict'
import test from 'node:test'
import { androidReleaseInfo } from './app-version.js'

test('publishes the current Android release by default', () => {
  assert.deepEqual(androidReleaseInfo({}), {
    platform: 'android',
    packageName: 'com.dedos.game',
    latestVersion: '1.14.0',
    latestVersionCode: 23,
    minimumVersionCode: 23,
    updateUrl: 'https://play.google.com/store/apps/details?id=com.dedos.game',
  })
})

test('server-side releases always require the latest published build', () => {
  const release = androidReleaseInfo({
    DEDOS_ANDROID_LATEST_VERSION: '1.14.0',
    DEDOS_ANDROID_LATEST_VERSION_CODE: '23',
  })
  assert.equal(release.latestVersion, '1.14.0')
  assert.equal(release.latestVersionCode, 23)
  assert.equal(release.minimumVersionCode, 23)
})
