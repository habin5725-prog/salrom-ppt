import type { Settings, Slide } from '../types'
import { estimateLineWidthPt, fitSlideText } from './fit'

export interface SplitWarning {
  slideId: string
  slideIndex: number
  kind: 'long-line' | 'overflow'
  message: string
}

export interface RepeatCandidate {
  text: string
  slideIndices: number[]
}

export interface SplitResult {
  slides: Slide[]
  warnings: SplitWarning[]
  repeats: RepeatCandidate[]
}

const splitDefaults: Settings = {
  fontSize: 42,
  minFontSize: 26,
  maxLines: 2,
  safeMargin: 0.08,
  titleSlides: false,
  showCounter: false,
  clickToAdvance: false,
}

function stableHash(input: string): string {
  let hash = 2166136261
  for (const char of input) {
    hash ^= char.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function canonicalText(text: string): string {
  return text.normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/gu, ' ').trim()
}

/** Find exact repeated slide phrases; indices are zero based for card highlighting. */
export function detectRepeatedSlides(slides: Pick<Slide, 'text'>[]): RepeatCandidate[] {
  const grouped = new Map<string, number[]>()
  slides.forEach((slide, index) => {
    const key = canonicalText(slide.text)
    if (key) grouped.set(key, [...(grouped.get(key) ?? []), index])
  })
  return [...grouped.entries()]
    .filter(([, slideIndices]) => slideIndices.length > 1)
    .map(([, slideIndices]) => ({ text: slides[slideIndices[0]].text, slideIndices }))
}

/** Pure draft generation. Blank lines stay as paragraph boundaries; cards remain editable. */
export function splitLyrics(rawLyrics: string, overrides: Partial<Settings> = {}): SplitResult {
  const settings = { ...splitDefaults, ...overrides }
  const maxLines = Math.max(1, Math.floor(settings.maxLines))
  const paragraphs = rawLyrics
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n+/u)
    .map((paragraph) => paragraph.split('\n').map((line) => line.trim()).filter(Boolean))
    .filter((paragraph) => paragraph.length > 0)

  const textGroups: string[] = []
  for (const paragraph of paragraphs) {
    let current: string[] = []
    const flush = () => {
      if (current.length) textGroups.push(current.join('\n'))
      current = []
    }
    for (const line of paragraph) {
      const proposed = [...current, line]
      const fit = fitSlideText(proposed.join('\n'), settings)
      // Two dense lines can technically fit only after shrinking; separate them for legibility.
      const density = proposed.reduce((sum, value) => sum + estimateLineWidthPt(value, settings.fontSize), 0)
      const tooDense = proposed.length > 1 && density > fit.availableWidthPt * 1.7
      if (current.length >= maxLines || (current.length > 0 && (!fit.fits || tooDense))) flush()
      current.push(line)
    }
    flush()
  }

  const slides: Slide[] = textGroups.map((text, index) => ({ id: `draft-${index + 1}-${stableHash(text)}`, text }))
  const warnings: SplitWarning[] = slides.flatMap((slide, slideIndex) => {
    const fit = fitSlideText(slide.text, settings)
    if (fit.fits) return []
    return [{
      slideId: slide.id,
      slideIndex,
      kind: slide.text.includes('\n') ? 'overflow' : 'long-line',
      message: fit.warning ?? '가사가 안전 영역을 넘을 수 있습니다.',
    }]
  })
  return { slides, warnings, repeats: detectRepeatedSlides(slides) }
}
