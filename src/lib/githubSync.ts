import type { AppData, Week } from '../types'

export interface GitHubSyncStatus {
  available: boolean
  mode: 'unavailable' | 'connected'
  lastSyncedAt?: string
  lastError?: string
  message: string
}

export interface GitHubSyncResult {
  ok: boolean
  message: string
  syncedAt?: string
}

export interface GitHubSyncService {
  getStatus(): GitHubSyncStatus
  syncData(data: AppData): Promise<GitHubSyncResult>
  syncWeek(week: Week): Promise<GitHubSyncResult>
}

const unavailableMessage = 'GitHub 자동 동기화가 연결되지 않았습니다. 현재 데이터는 이 브라우저의 IndexedDB에 저장됩니다. 관리자 화면에서 JSON 백업을 내려받으세요.'
let lastError: string | undefined

/** Stable future layout, without placing credentials in the browser bundle. */
export function githubPathsForWeek(week: Pick<Week, 'date' | 'name'>): { json: string; pptx: string } {
  const year = /^\d{4}/u.test(week.date) ? week.date.slice(0, 4) : 'unknown'
  const date = /^\d{4}-\d{2}-\d{2}$/u.test(week.date) ? week.date : 'undated'
  const name = week.name.trim().replace(/[\\/:*?"<>|]/gu, '_').replace(/\s+/gu, '_') || '예배'
  return {
    json: `data/weeks/${year}/${date}.json`,
    pptx: `exports/${year}/${date}_${name}_찬양.pptx`,
  }
}

export function getGitHubSyncStatus(): GitHubSyncStatus {
  return {
    available: false,
    mode: 'unavailable',
    message: unavailableMessage,
    ...(lastError ? { lastError } : {}),
  }
}

async function unavailableSync(): Promise<GitHubSyncResult> {
  lastError = '안전한 GitHub 인증 연결이 아직 설정되지 않았습니다.'
  return { ok: false, message: unavailableMessage }
}

export const githubSyncService: GitHubSyncService = {
  getStatus: getGitHubSyncStatus,
  syncData: unavailableSync,
  syncWeek: unavailableSync,
}
