import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, createBackup, createEmptyData, exportDataJson, parseImportedData } from './storage'
import { fitSlideText } from './fit'
import { splitLyrics } from './split'

describe('가사 초안과 데이터 보존', () => {
  it('빈 줄을 절 경계로 유지하고 반복 구간을 찾는다', () => {
    const result = splitLyrics('첫 줄\n둘째 줄\n\n첫 줄\n둘째 줄', DEFAULT_SETTINGS)
    expect(result.slides.map((slide) => slide.text)).toEqual(['첫 줄\n둘째 줄', '첫 줄\n둘째 줄'])
    expect(result.repeats[0].slideIndices).toEqual([0, 1])
  })

  it('촘촘한 두 줄은 분리하고 긴 한 줄은 경고한다', () => {
    expect(splitLyrics(`${'가'.repeat(17)}\n${'나'.repeat(17)}`, DEFAULT_SETTINGS).slides).toHaveLength(2)
    const longLine = '가'.repeat(80)
    expect(fitSlideText(longLine, DEFAULT_SETTINGS).needsSplit).toBe(true)
    expect(splitLyrics(longLine, DEFAULT_SETTINGS).warnings[0].kind).toBe('long-line')
  })

  it('백업은 원본 수정과 분리되고 JSON 복원이 가능하다', () => {
    const data = createEmptyData()
    data.songs.push({
      id: 'song-1', title: '테스트', normalizedTitle: '테스트', rawLyrics: '원본',
      slides: [{ id: 'slide-1', text: '원본' }], createdAt: '2026-10-08', updatedAt: '2026-10-08', version: 1,
    })
    const backup = createBackup(data)
    data.songs[0].slides[0].text = '수정'
    expect(backup.data.songs[0].slides[0].text).toBe('원본')
    expect(parseImportedData(exportDataJson(data)).songs[0].slides[0].text).toBe('수정')
    expect(() => parseImportedData('{broken')).toThrow(/JSON/)
  })
})
