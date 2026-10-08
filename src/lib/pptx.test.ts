import { describe, expect, it } from 'vitest'
import type { Week } from '../types'
import { DEFAULT_SETTINGS } from './storage'
import { buildWeekPptx, getPptxFilename, getWeekPresentationSlides } from './pptx'

const week: Week = {
  id: 'week-1', date: '2026-10-11', name: '주일예배',
  createdAt: '2026-10-08', updatedAt: '2026-10-08',
  items: [{
    id: 'item-1', type: 'song', title: '테스트 찬양', songId: 'song-1', sourceMode: 'copy',
    slides: [{ id: 'slide-1', text: '주님을 찬양합니다\n오늘도 노래합니다' }],
  }],
}

describe('PPTX 내보내기', () => {
  it('주간 Snapshot으로 16:9 PPTX ZIP 파일을 생성한다', async () => {
    expect(getPptxFilename(week)).toBe('2026-10-11_주일예배_찬양.pptx')
    expect(getWeekPresentationSlides(week, DEFAULT_SETTINGS)).toHaveLength(1)
    const deck = await buildWeekPptx(week, DEFAULT_SETTINGS)
    const result = await deck.write({ outputType: 'base64' })
    expect(typeof result).toBe('string')
    expect((result as string).startsWith('UEsDB')).toBe(true)
    const zipBytes = atob(result as string)
    expect(zipBytes).toContain('[Content_Types].xml')
    expect(zipBytes).toContain('ppt/slides/slide1.xml')
  }, 30000)
})
