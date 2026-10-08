import { openDB, type DBSchema } from 'idb'
import type { AppData, Backup, Settings, Song, Week } from '../types'

const DB_NAME = 'salrom-ppt'
const DB_VERSION = 1
const STATE_KEY = 'app-data'
const FALLBACK_KEY = 'salrom-ppt-emergency-state'

interface SalromDB extends DBSchema {
  state: { key: string; value: AppData }
}

export const DEFAULT_SETTINGS: Settings = {
  fontSize: 42,
  minFontSize: 26,
  maxLines: 2,
  safeMargin: 0.08,
  titleSlides: false,
  showCounter: false,
  clickToAdvance: false,
}

export function createEmptyData(): AppData {
  return { songs: [], weeks: [], settings: { ...DEFAULT_SETTINGS }, backups: [] }
}

export function normalizeTitle(title: string): string {
  return title.normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/[^\p{L}\p{N}]/gu, '')
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function string(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function finite(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}

function normalizeSettings(value: unknown): Settings {
  const source = record(value) ? value : {}
  const fontSize = finite(source.fontSize, DEFAULT_SETTINGS.fontSize, 12, 120)
  return {
    fontSize,
    minFontSize: Math.min(fontSize, finite(source.minFontSize, DEFAULT_SETTINGS.minFontSize, 12, 120)),
    maxLines: Math.round(finite(source.maxLines, DEFAULT_SETTINGS.maxLines, 1, 12)),
    safeMargin: finite(source.safeMargin, DEFAULT_SETTINGS.safeMargin, 0.02, 0.3),
    titleSlides: typeof source.titleSlides === 'boolean' ? source.titleSlides : DEFAULT_SETTINGS.titleSlides,
    showCounter: typeof source.showCounter === 'boolean' ? source.showCounter : DEFAULT_SETTINGS.showCounter,
    clickToAdvance: typeof source.clickToAdvance === 'boolean' ? source.clickToAdvance : DEFAULT_SETTINGS.clickToAdvance,
  }
}

function normalizeSlides(value: unknown): Song['slides'] {
  if (!Array.isArray(value)) return []
  return value.filter(record).map((slide, index) => ({
    id: string(slide.id) || `slide-${index + 1}`,
    text: string(slide.text),
    ...(typeof slide.section === 'string' && slide.section ? { section: slide.section } : {}),
  }))
}

function normalizeSongs(value: unknown): Song[] {
  if (!Array.isArray(value)) return []
  const now = new Date().toISOString()
  return value.filter(record).map((song, index) => {
    const title = string(song.title, `제목 없는 찬양 ${index + 1}`)
    return {
      id: string(song.id) || `song-${index + 1}`,
      title,
      normalizedTitle: normalizeTitle(title),
      rawLyrics: string(song.rawLyrics),
      slides: normalizeSlides(song.slides),
      createdAt: string(song.createdAt, now),
      updatedAt: string(song.updatedAt, now),
      ...(typeof song.lastUsedAt === 'string' ? { lastUsedAt: song.lastUsedAt } : {}),
      version: finite(song.version, 1, 1, 100000),
    }
  })
}

function normalizeWeeks(value: unknown): Week[] {
  if (!Array.isArray(value)) return []
  const now = new Date().toISOString()
  return value.filter(record).map((week, index) => ({
    id: string(week.id) || `week-${index + 1}`,
    date: string(week.date),
    name: string(week.name, '예배'),
    items: Array.isArray(week.items) ? week.items.filter(record).map((item, itemIndex) => ({
      id: string(item.id) || `item-${itemIndex + 1}`,
      type: item.type === 'general' ? 'general' as const : 'song' as const,
      title: string(item.title),
      ...(typeof item.songId === 'string' ? { songId: item.songId } : {}),
      slides: normalizeSlides(item.slides),
      ...(item.sourceMode === 'original' || item.sourceMode === 'copy' ? { sourceMode: item.sourceMode } : {}),
    })) : [],
    createdAt: string(week.createdAt, now),
    updatedAt: string(week.updatedAt, now),
    ...(typeof week.exportedAt === 'string' ? { exportedAt: week.exportedAt } : {}),
  }))
}

/** Validate and migrate a backup without mutating the supplied value. */
export function normalizeAppData(value: unknown): AppData {
  if (!record(value)) throw new Error('복원 파일의 데이터 형식이 올바르지 않습니다.')
  if (!Array.isArray(value.songs) || !Array.isArray(value.weeks)) {
    throw new Error('복원 파일에 찬양 또는 주간 자료 목록이 없습니다.')
  }
  const backups: Backup[] = Array.isArray(value.backups)
    ? value.backups.filter(record).filter((backup) => record(backup.data)).map((backup, index) => {
      const data = backup.data as Record<string, unknown>
      return {
        id: string(backup.id) || `backup-${index + 1}`,
        createdAt: string(backup.createdAt, new Date().toISOString()),
        data: {
          songs: normalizeSongs(data.songs),
          weeks: normalizeWeeks(data.weeks),
          settings: normalizeSettings(data.settings),
        },
      }
    }) : []
  return {
    songs: normalizeSongs(value.songs),
    weeks: normalizeWeeks(value.weeks),
    settings: normalizeSettings(value.settings),
    backups,
    ...(typeof value.lastBackupAt === 'string' ? { lastBackupAt: value.lastBackupAt } : {}),
  }
}

async function database() {
  return openDB<SalromDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('state')) db.createObjectStore('state')
    },
  })
}

function emergencyData(): AppData | null {
  try {
    const raw = localStorage.getItem(FALLBACK_KEY)
    return raw ? normalizeAppData(JSON.parse(raw) as unknown) : null
  } catch {
    return null
  }
}

/** Optional read-only deployment snapshot at public/data/published.json. */
export async function loadPublishedData(): Promise<AppData | null> {
  if (typeof fetch === 'undefined' || typeof document === 'undefined') return null
  try {
    const basePath = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? './'
    const url = new URL('data/published.json', new URL(basePath, document.baseURI))
    const response = await fetch(url, { cache: 'no-cache' })
    if (!response.ok) return null
    return parseImportedData(await response.text())
  } catch {
    return null
  }
}

export async function loadAppData(): Promise<AppData> {
  const emergency = emergencyData()
  if (emergency) return emergency
  let stored: AppData | undefined
  try {
    const db = await database()
    stored = await db.get('state', STATE_KEY)
  } catch { /* use deployment snapshot or an empty local library */ }
  if (stored) return normalizeAppData(stored)
  return (await loadPublishedData()) ?? createEmptyData()
}

/** Resolves only after the IndexedDB transaction commits. */
export async function saveAppData(data: AppData): Promise<void> {
  const normalized = normalizeAppData(data)
  try {
    const db = await database()
    await db.put('state', normalized, STATE_KEY)
    try { localStorage.removeItem(FALLBACK_KEY) } catch { /* storage might be disabled */ }
  } catch (error) {
    try {
      localStorage.setItem(FALLBACK_KEY, JSON.stringify(normalized))
    } catch {
      throw new Error('로컬 저장에 실패했습니다. JSON 백업을 내려받아 데이터를 보관하세요.', { cause: error })
    }
  }
}

export async function clearAppData(): Promise<void> {
  // An explicit empty record prevents the published read-only seed from reappearing.
  await saveAppData(createEmptyData())
}

export function createBackup(data: AppData): Backup {
  const createdAt = new Date().toISOString()
  return {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `backup-${Date.now()}`,
    createdAt,
    data: structuredClone({ songs: data.songs, weeks: data.weeks, settings: data.settings }),
  }
}

export function exportDataJson(data: AppData): string {
  return JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), data: normalizeAppData(data) }, null, 2)
}

export function parseImportedData(json: string): AppData {
  let parsed: unknown
  try { parsed = JSON.parse(json) as unknown }
  catch { throw new Error('JSON 파일을 읽을 수 없습니다. 올바른 백업 파일인지 확인하세요.') }
  const payload = record(parsed) && 'data' in parsed ? parsed.data : parsed
  return normalizeAppData(payload)
}

export const dataRepository = {
  load: loadAppData,
  save: saveAppData,
  clear: clearAppData,
  loadPublished: loadPublishedData,
}
