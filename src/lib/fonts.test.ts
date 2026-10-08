import { readFileSync } from 'node:fs'
import { Buffer } from 'node:buffer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CustomFont } from '../types'
import {
  cleanFontName, cssFontFamily, customFontFamily, DEFAULT_FONT_FAMILY,
  fontDisplayName, getPptxFontFamily, getPptxFontWeight, importFontFile, registerCustomFonts,
} from './fonts'
import { createBackup, createEmptyData, exportDataJson, normalizeAppData, parseImportedData } from './storage'

const uploaded: CustomFont = {
  id: 'my-font', name: '예배 글꼴 Bold', family: 'Worship Sans', fileName: 'worship-bold.ttf',
  dataUrl: 'data:font/ttf;base64,AAEAAA==', createdAt: '2026-10-08T00:00:00.000Z', weight: 700,
}

describe('글꼴 저장과 이름', () => {
  afterEach(() => {
    registerCustomFonts([])
    vi.unstubAllGlobals()
  })

  it('업로드 별칭은 화면에, 실제 family와 굵기는 PPTX에 사용한다', () => {
    registerCustomFonts([uploaded])
    const family = customFontFamily(uploaded)
    const settings = { ...createEmptyData().settings, fontFamily: family }
    expect(family).toBe('SalromUpload-my-font')
    expect(fontDisplayName(family, [uploaded])).toBe('예배 글꼴 Bold')
    expect(getPptxFontFamily(settings)).toBe('Worship Sans')
    expect(getPptxFontWeight(settings)).toBe(700)
    expect(cssFontFamily(family)).toContain('"SalromUpload-my-font"')
    expect(cleanFontName('  My\u0000 Font\n  ')).toBe('My Font')
  })

  it('실제 TTF의 내부 family와 weight를 파일 이름과 별도로 읽는다', async () => {
    class LoadedFontFace {
      load() { return Promise.resolve(this) }
    }
    class DataUrlReader {
      result = ''
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      readAsDataURL(file: Blob) {
        void file.arrayBuffer().then(buffer => {
          this.result = `data:font/ttf;base64,${Buffer.from(buffer).toString('base64')}`
          this.onload?.()
        }).catch(() => this.onerror?.())
      }
    }
    vi.stubGlobal('FontFace', LoadedFontFace)
    vi.stubGlobal('FileReader', DataUrlReader)
    const file = new File([new Uint8Array(readFileSync('public/fonts/NanumMyeongjo-Bold.ttf'))], 'renamed-worship-font.ttf')
    const font = await importFontFile(file)
    expect(font.family).toBe('NanumMyeongjo')
    expect(font.weight).toBe(700)
    expect(font.fileName).toBe('renamed-worship-font.ttf')
    expect(font.name).not.toBe('renamed-worship-font')
    expect(font.dataUrl).toMatch(/^data:font\/ttf;base64,/u)
  })

  it('글꼴 설정이 없는 이전 자료는 기본 글꼴로 복원한다', () => {
    const migrated = normalizeAppData({ songs: [], weeks: [], settings: { fontSize: 48 }, backups: [] })
    expect(migrated.settings.fontFamily).toBe(DEFAULT_FONT_FAMILY)
    expect(migrated.settings.fontSize).toBe(48)
    expect(migrated.customFonts).toEqual([])
  })

  it('JSON 백업에 업로드 글꼴 파일과 선택 설정 및 자동 백업을 보존한다', () => {
    const data = createEmptyData()
    data.customFonts = [uploaded]
    data.settings.fontFamily = customFontFamily(uploaded)
    data.backups = [createBackup(data)]
    const restored = parseImportedData(exportDataJson(data))
    expect(restored.settings.fontFamily).toBe('SalromUpload-my-font')
    expect(restored.customFonts).toEqual([uploaded])
    expect(restored.backups[0].data.customFonts).toEqual([uploaded])
    expect(restored.backups[0].data.settings.fontFamily).toBe('SalromUpload-my-font')
  })
})
