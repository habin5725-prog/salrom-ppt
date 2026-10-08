import { afterEach, describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import type { Week } from '../types'
import { DEFAULT_SETTINGS } from './storage'
import { buildWeekPptx, getPptxFilename, getWeekPresentationSlides } from './pptx'
import { customFontFamily, registerCustomFonts } from './fonts'

const week: Week = {
  id: 'week-1', date: '2026-10-11', name: '주일예배',
  createdAt: '2026-10-08', updatedAt: '2026-10-08',
  items: [{
    id: 'item-1', type: 'song', title: '테스트 찬양', songId: 'song-1', sourceMode: 'copy',
    slides: [{ id: 'slide-1', text: '주님을 찬양합니다\n오늘도 노래합니다' }],
  }],
}

describe('PPTX 내보내기', () => {
  afterEach(() => registerCustomFonts([]))
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

  it('선택한 글꼴을 슬라이드와 PowerPoint 테마에 기록한다', async () => {
    const deck = await buildWeekPptx(week, { ...DEFAULT_SETTINGS, fontFamily: 'Arial' })
    const result = await deck.write({ outputType: 'base64' })
    const zip = await JSZip.loadAsync(result as string, { base64: true })
    const slideXml = await zip.file('ppt/slides/slide1.xml')!.async('string')
    const themeXml = await zip.file('ppt/theme/theme1.xml')!.async('string')
    expect(slideXml).toContain('typeface="Arial"')
    expect(themeXml).toContain('typeface="Arial"')
    expect(slideXml).not.toContain('typeface="Paperlogy"')
  }, 30000)

  it('업로드 글꼴의 웹 별칭 대신 실제 글꼴 이름과 굵기를 PPTX에 기록한다', async () => {
    const uploaded = {
      id: 'uploaded-font', name: 'My Worship Sans Bold', family: 'My Worship Sans',
      fileName: 'my-worship-bold.ttf', dataUrl: 'data:font/ttf;base64,AAEAAA==',
      createdAt: '2026-10-08', weight: 700,
    }
    registerCustomFonts([uploaded])
    const deck = await buildWeekPptx(week, { ...DEFAULT_SETTINGS, fontFamily: customFontFamily(uploaded) })
    const result = await deck.write({ outputType: 'base64' })
    const zip = await JSZip.loadAsync(result as string, { base64: true })
    const slideXml = await zip.file('ppt/slides/slide1.xml')!.async('string')
    const themeXml = await zip.file('ppt/theme/theme1.xml')!.async('string')
    expect(slideXml).toContain('typeface="My Worship Sans"')
    expect(slideXml).toMatch(/<a:rPr[^>]* b="1"/u)
    expect(themeXml).toContain('typeface="My Worship Sans"')
    expect(slideXml).not.toContain('SalromUpload-')
  }, 30000)
})
