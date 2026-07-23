import assert from 'node:assert/strict'
import test from 'node:test'
import {
  evaluateAndroidUpdate,
  parseAndroidReleaseInfo,
  type AndroidReleaseInfo,
} from '../src/lib/appVersion.ts'

const release: AndroidReleaseInfo = {
  platform: 'android',
  packageName: 'com.dedos.game',
  latestVersion: '1.12.0',
  latestVersionCode: 18,
  minimumVersionCode: 0,
  updateUrl: 'https://play.google.com/store/apps/details?id=com.dedos.game',
}

test('does not prompt when the installed Android build is current', () => {
  assert.deepEqual(evaluateAndroidUpdate('18', release), {
    available: false,
    required: false,
    currentVersionCode: 18,
  })
})

test('prompts for an optional update when a newer build is available', () => {
  assert.deepEqual(evaluateAndroidUpdate('17', release), {
    available: true,
    required: false,
    currentVersionCode: 17,
  })
})

test('marks builds below the configured minimum as required', () => {
  assert.equal(evaluateAndroidUpdate('16', { ...release, minimumVersionCode: 17 }).required, true)
})

test('accepts only a valid Google Play Android release response', () => {
  assert.deepEqual(parseAndroidReleaseInfo(release), release)
  assert.equal(parseAndroidReleaseInfo({ ...release, latestVersionCode: 'nope' }), null)
  assert.equal(parseAndroidReleaseInfo({ ...release, updateUrl: 'https://example.com/app' }), null)
})
