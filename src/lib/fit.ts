import type { Settings } from '../types'

/** Dimensions in PDF/PPT points. The exported deck uses a 13.333 × 7.5 inch canvas. */
export const SLIDE_WIDTH_PT = 960
export const SLIDE_HEIGHT_PT = 540

export interface TextFit {
  fontSize: number
  lineCount: number
  availableWidthPt: number
  availableHeightPt: number
  widestLinePt: number
  estimatedHeightPt: number
  fits: boolean
  needsSplit: boolean
  warning?: string
}

/** safeMargin is a fraction of each side (0.08 means 8%). */
export function marginFraction(value: number): number {
  return Number.isFinite(value) ? Math.min(0.3, Math.max(0.02, value)) : 0.08
}

function glyphWidth(char: string): number {
  if (/\s/u.test(char)) return 0.3
  if (/[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af\u3000-\u9fff]/u.test(char)) return 0.98
  if (/[ilI1.,'`:;|!]/u.test(char)) return 0.29
  if (/[mwMW@#%&]/u.test(char)) return 0.88
  if (/[A-Z0-9]/u.test(char)) return 0.65
  if (/[a-z]/u.test(char)) return 0.53
  return 0.58
}

/** Conservative, deterministic Paperlogy width estimate shared by screen and PPTX. */
export function estimateLineWidthPt(line: string, fontSize: number): number {
  return [...line].reduce((total, char) => total + glyphWidth(char) * fontSize, 0)
}

export function fitSlideText(text: string, settings: Settings): TextFit {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const margin = marginFraction(settings.safeMargin)
  const availableWidthPt = SLIDE_WIDTH_PT * (1 - margin * 2)
  const availableHeightPt = SLIDE_HEIGHT_PT * (1 - margin * 2)
  const maxFont = Math.max(12, Number.isFinite(settings.fontSize) ? settings.fontSize : 42)
  const minFont = Math.max(12, Math.min(maxFont, Number.isFinite(settings.minFontSize) ? settings.minFontSize : 26))
  const widthUnits = Math.max(0, ...lines.map((line) => estimateLineWidthPt(line, 1)))
  const widthLimit = widthUnits > 0 ? availableWidthPt / widthUnits : maxFont
  const heightLimit = lines.length > 0 ? availableHeightPt / (lines.length * 1.32) : maxFont
  const idealFont = Math.floor(Math.min(maxFont, widthLimit, heightLimit))
  const fontSize = Math.max(minFont, idealFont)
  const widestLinePt = widthUnits * fontSize
  const estimatedHeightPt = lines.length * fontSize * 1.32
  const fits = widestLinePt <= availableWidthPt + 0.5 && estimatedHeightPt <= availableHeightPt + 0.5
  const needsSplit = !fits || lines.length > Math.max(1, settings.maxLines)
  const warning = !fits
    ? '최소 글자 크기에서도 안전 영역을 넘을 수 있습니다. 슬라이드 분리를 권장합니다.'
    : lines.length > Math.max(1, settings.maxLines)
      ? `기본 최대 ${settings.maxLines}줄을 넘었습니다. 슬라이드 분리를 권장합니다.`
      : undefined

  return { fontSize, lineCount: lines.length, availableWidthPt, availableHeightPt, widestLinePt, estimatedHeightPt, fits, needsSplit, warning }
}
