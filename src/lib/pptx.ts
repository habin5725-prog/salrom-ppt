import type pptxgen from 'pptxgenjs'
import type { Settings, Week } from '../types'
import { fitSlideText, marginFraction } from './fit'

const WIDTH_IN = 13.333333
const HEIGHT_IN = 7.5

export interface PresentationSlide {
  id: string
  text: string
  title?: string
  kind: 'title' | 'lyrics' | 'general'
}

/** Same ordered snapshot is used for full preview, browser presentation, and export. */
export function getWeekPresentationSlides(week: Week, settings: Settings): PresentationSlide[] {
  return week.items.flatMap((item) => {
    const titleSlide: PresentationSlide[] = settings.titleSlides && item.type === 'song'
      ? [{ id: `${item.id}-title`, text: item.title, title: item.title, kind: 'title' }]
      : []
    const slides: PresentationSlide[] = item.slides.map((slide) => ({
      id: `${item.id}-${slide.id}`,
      text: slide.text,
      title: item.title,
      kind: item.type === 'general' ? 'general' : 'lyrics',
    }))
    return [...titleSlide, ...slides]
  })
}

export function getPptxFilename(week: Pick<Week, 'date' | 'name'>): string {
  const date = /^\d{4}-\d{2}-\d{2}$/u.test(week.date) ? week.date : new Date().toISOString().slice(0, 10)
  const name = week.name.trim().replace(/[\\/:*?"<>|\x00-\x1f]/gu, '_').replace(/\s+/gu, '_').slice(0, 80) || '예배'
  return `${date}_${name}_찬양.pptx`
}

export async function buildWeekPptx(week: Week, settings: Settings): Promise<pptxgen> {
  // Loading the generator only when exporting keeps presentation startup light.
  const { default: PptxGenJS } = await import('pptxgenjs')
  const deck = new PptxGenJS()
  deck.defineLayout({ name: 'SALROM_WIDE', width: WIDTH_IN, height: HEIGHT_IN })
  deck.layout = 'SALROM_WIDE'
  deck.author = 'SALROM PPT'
  deck.subject = `${week.name} 찬양 슬라이드`
  deck.title = `${week.date} ${week.name}`
  deck.company = 'SALROM'
  deck.theme = {
    headFontFace: 'Paperlogy',
    bodyFontFace: 'Paperlogy',
  }

  const margin = marginFraction(settings.safeMargin)
  const x = WIDTH_IN * margin
  const y = HEIGHT_IN * margin
  const w = WIDTH_IN * (1 - margin * 2)
  const h = HEIGHT_IN * (1 - margin * 2)
  for (const presentationSlide of getWeekPresentationSlides(week, settings)) {
    const slide = deck.addSlide()
    slide.background = { color: '000000' }
    const fit = fitSlideText(presentationSlide.text, settings)
    slide.addText(presentationSlide.text, {
      x, y, w, h,
      fontFace: 'Paperlogy',
      fontSize: fit.fontSize,
      color: 'FFFFFF',
      bold: presentationSlide.kind === 'title',
      align: 'center',
      valign: 'middle',
      margin: 0,
      breakLine: false,
    })
  }
  return deck
}

/** Browser-side .pptx download. Generation errors surface to the UI in Korean. */
export async function exportWeekPptx(week: Week, settings: Settings): Promise<string> {
  const slides = getWeekPresentationSlides(week, settings)
  if (slides.length === 0) throw new Error('내보낼 슬라이드가 없습니다. 찬양이나 일반 슬라이드를 추가하세요.')
  const fileName = getPptxFilename(week)
  try {
    const deck = await buildWeekPptx(week, settings)
    await deck.writeFile({ fileName })
    return fileName
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`PPTX 생성에 실패했습니다. ${detail}`, { cause: error })
  }
}
