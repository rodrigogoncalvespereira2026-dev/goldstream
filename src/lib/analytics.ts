import { useSyncExternalStore } from 'react'
import type { View } from './nav'

export type ConsentPreferences = Readonly<{
  analytics: boolean
  retargeting: boolean
}>

type DataLayerItem = {
  event: string
  [key: string]: unknown
}

type AnalyticsWindow = Window & {
  dataLayer?: DataLayerItem[]
  __TWITTER_PIXEL_ID__?: string
  __PINTEREST_PIXEL_ID__?: string
  __SNAPCHAT_PIXEL_ID__?: string
}

const CONSENT_KEY = 'goldstream.privacy-consent.v2'
const LEGACY_ANALYTICS_KEY = 'goldstream.analytics-consent.v1'
const CONSENT_CHANGE_EVENT = 'goldstream:analytics-consent-change'

const PREFERENCES = {
  neither: Object.freeze({ analytics: false, retargeting: false }),
  analytics: Object.freeze({ analytics: true, retargeting: false }),
  retargeting: Object.freeze({ analytics: false, retargeting: true }),
  both: Object.freeze({ analytics: true, retargeting: true }),
} satisfies Record<string, ConsentPreferences>

let memoryPreferences: ConsentPreferences | null | undefined
let initialized = false

function preferencesFor(analytics: boolean, retargeting: boolean): ConsentPreferences {
  if (analytics && retargeting) return PREFERENCES.both
  if (analytics) return PREFERENCES.analytics
  if (retargeting) return PREFERENCES.retargeting
  return PREFERENCES.neither
}

function parsePreferences(value: string | null): ConsentPreferences | null {
  if (!value) return null
  try {
    const parsed: unknown = JSON.parse(value)
    if (
      parsed &&
      typeof parsed === 'object' &&
      'analytics' in parsed &&
      'retargeting' in parsed &&
      typeof parsed.analytics === 'boolean' &&
      typeof parsed.retargeting === 'boolean'
    ) {
      return preferencesFor(parsed.analytics, parsed.retargeting)
    }
  } catch {
    // Ignore damaged or unsupported stored consent and ask again.
  }
  return null
}

export function getConsentPreferences(): ConsentPreferences | null {
  try {
    const stored = localStorage.getItem(CONSENT_KEY)
    if (stored) return parsePreferences(stored)

    // Preserve the analytics choice made with the previous version; retargeting stays off.
    const legacy = localStorage.getItem(LEGACY_ANALYTICS_KEY)
    if (legacy === 'granted') return PREFERENCES.analytics
    if (legacy === 'denied') return PREFERENCES.neither
  } catch {
    // Some browser privacy modes block localStorage; keep this session's choice in memory.
  }
  return memoryPreferences ?? null
}

export function setConsentPreferences(preferences: ConsentPreferences): void {
  memoryPreferences = preferencesFor(preferences.analytics, preferences.retargeting)
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify(memoryPreferences))
    localStorage.removeItem(LEGACY_ANALYTICS_KEY)
  } catch {
    // The consent choice still applies for this session if storage is unavailable.
  }

  if (memoryPreferences.analytics) initializeDataLayer()
  applyRetargetingPixelChoice(memoryPreferences.retargeting)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(CONSENT_CHANGE_EVENT))
  }
}

function subscribeToConsent(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined

  const onStorage = (event: StorageEvent) => {
    if (event.key === CONSENT_KEY || event.key === LEGACY_ANALYTICS_KEY) {
      memoryPreferences = parsePreferences(event.newValue)
      if (event.key === LEGACY_ANALYTICS_KEY) {
        memoryPreferences = event.newValue === 'granted'
          ? PREFERENCES.analytics
          : event.newValue === 'denied'
            ? PREFERENCES.neither
            : null
      }
      applyRetargetingPixelChoice(memoryPreferences?.retargeting === true)
      callback()
    }
  }

  window.addEventListener(CONSENT_CHANGE_EVENT, callback)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(CONSENT_CHANGE_EVENT, callback)
    window.removeEventListener('storage', onStorage)
  }
}

export function useConsentPreferences(): ConsentPreferences | null {
  return useSyncExternalStore(subscribeToConsent, getConsentPreferences, () => null)
}

function initializeDataLayer(): void {
  if (typeof window === 'undefined' || initialized) return

  const analyticsWindow = window as AnalyticsWindow
  analyticsWindow.dataLayer = analyticsWindow.dataLayer ?? []
  analyticsWindow.dataLayer.push({
    event: 'webplayer_datalayer_init',
    type: 'goldstream',
  })
  initialized = true
}

function getRetargetingPixelConfig(): Record<string, unknown> {
  try {
    const element = document.getElementById('appServerConfig')
    if (!element?.textContent) return {}
    const bytes = Uint8Array.from(atob(element.textContent.trim()), (char) => char.charCodeAt(0))
    const config: unknown = JSON.parse(new TextDecoder().decode(bytes))
    if (!config || typeof config !== 'object' || !('retargetingPixels' in config)) return {}
    const pixels = config.retargetingPixels
    return pixels && typeof pixels === 'object' ? pixels as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

export function applyRetargetingPixelChoice(enabled: boolean): void {
  if (typeof window === 'undefined') return
  const target = window as AnalyticsWindow
  const globals = [
    ['twitter', '__TWITTER_PIXEL_ID__'],
    ['pinterest', '__PINTEREST_PIXEL_ID__'],
    ['snapchat', '__SNAPCHAT_PIXEL_ID__'],
  ] as const

  if (!enabled) {
    delete target.__TWITTER_PIXEL_ID__
    delete target.__PINTEREST_PIXEL_ID__
    delete target.__SNAPCHAT_PIXEL_ID__
    return
  }

  const pixels = getRetargetingPixelConfig()
  for (const [platform, globalName] of globals) {
    const id = pixels[platform]
    if (typeof id === 'string' && id.trim()) {
      target[globalName] = id.trim()
    }
  }
}

export function trackPageView(page: View['type']): void {
  if (getConsentPreferences()?.analytics !== true) return

  initializeDataLayer()
  const dataLayer = (window as AnalyticsWindow).dataLayer
  dataLayer?.push({
    event: 'gtm.pageview',
    location: page,
  })
}

export function trackPlaybackRequest(): void {
  if (getConsentPreferences()?.analytics !== true) return

  initializeDataLayer()
  const dataLayer = (window as AnalyticsWindow).dataLayer
  dataLayer?.push({
    event: 'gtm.event',
    detail: {
      event_action: 'playback_requested',
    },
  })
}