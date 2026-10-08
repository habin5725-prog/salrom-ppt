import type { CustomFont, Settings } from '../types'

export const DEFAULT_FONT_FAMILY = 'Pretendard'
export const FONT_PRESETS = [
  { family: 'Pretendard', label: 'Pretendard', description: '깔끔하고 편안한 고딕', bundled: true, pptxFamily: 'Pretendard' },
  { family: 'Nanum Myeongjo', label: '나눔명조', description: '차분하고 부드러운 명조', bundled: true, pptxFamily: 'NanumMyeongjo' },
  { family: 'Paperlogy', label: 'Paperlogy', description: '기존 글꼴 · 또렷한 고딕', bundled: true, pptxFamily: 'Paperlogy' },
  { family: 'Malgun Gothic', label: '맑은 고딕', description: '이 PC에 설치된 글꼴', pptxFamily: 'Malgun Gothic' },
  { family: 'Gulim', label: '굴림', description: '이 PC에 설치된 글꼴', pptxFamily: 'Gulim' },
  { family: 'Batang', label: '바탕', description: '이 PC에 설치된 글꼴', pptxFamily: 'Batang' },
  { family: 'Arial', label: 'Arial', description: '영문 고딕', pptxFamily: 'Arial' },
  { family: 'Georgia', label: 'Georgia', description: '영문 명조', pptxFamily: 'Georgia' },
]

const customFonts = new Map<string, CustomFont>()
const loadedFaces = new Map<string, { dataUrl: string; face: FontFace; ready: Promise<void> }>()
const FALLBACK = "'Malgun Gothic', Arial, sans-serif"
const FONT_SAMPLE = '찬양과 예배 함께 걸어갑니다 ABCabc0123'

export function cleanFontName(name: string): string {
  return name.replace(/[\u0000-\u001f\u007f]/gu, '').trim().slice(0, 160)
}

export function customFontFamily(font: Pick<CustomFont, 'id'>): string {
  return `SalromUpload-${font.id}`
}

export function cssFontFamily(name: string): string {
  return `${JSON.stringify(cleanFontName(name) || DEFAULT_FONT_FAMILY)}, ${FALLBACK}`
}

export function fontDisplayName(family: string, fonts: CustomFont[] = []): string {
  return fonts.find(font => customFontFamily(font) === family)?.name
    ?? FONT_PRESETS.find(font => font.family === family)?.label
    ?? family
}

export function registerCustomFonts(fonts: CustomFont[]): void {
  customFonts.clear()
  for (const font of fonts) customFonts.set(customFontFamily(font), font)
  for (const [family, loaded] of loadedFaces) {
    if (customFonts.get(family)?.dataUrl !== loaded.dataUrl) {
      if (typeof document !== 'undefined') document.fonts.delete(loaded.face)
      loadedFaces.delete(family)
    }
  }
}

export function getPptxFontFamily(settings: Settings): string {
  const family = settings.fontFamily || DEFAULT_FONT_FAMILY
  return customFonts.get(family)?.family ?? FONT_PRESETS.find(font => font.family === family)?.pptxFamily ?? family
}

export function getPptxFontWeight(settings: Settings): number {
  return customFonts.get(settings.fontFamily)?.weight ?? 400
}

export async function ensureFontLoaded(family: string): Promise<void> {
  if (typeof document === 'undefined' || typeof FontFace === 'undefined') return
  const uploaded = customFonts.get(family)
  if (uploaded) {
    if (!uploaded.dataUrl) throw new Error('글꼴 파일을 찾지 못했습니다. 글꼴을 다시 추가해 주세요.')
    let loaded = loadedFaces.get(family)
    if (!loaded) {
      const face = new FontFace(family, `url(${JSON.stringify(uploaded.dataUrl)})`, { display: 'swap' })
      const ready = face.load().then(() => { document.fonts.add(face) })
      loaded = { face, ready, dataUrl: uploaded.dataUrl }
      loadedFaces.set(family, loaded)
      void ready.catch(() => loadedFaces.delete(family))
    }
    await loaded.ready
    return
  }
  await Promise.all([400, 700].map(weight => document.fonts.load(`${weight} 42px ${JSON.stringify(cleanFontName(family) || DEFAULT_FONT_FAMILY)}`, FONT_SAMPLE)))
}

export function supportsLocalFontAccess(): boolean {
  return typeof window !== 'undefined' && typeof (window as Window & { queryLocalFonts?: unknown }).queryLocalFonts === 'function'
}

export async function listLocalFonts(): Promise<Array<{ family: string; label: string }>> {
  const query = (window as Window & { queryLocalFonts?: () => Promise<Array<{ family: string }>> }).queryLocalFonts
  if (!query) throw new Error('이 브라우저에서는 PC 글꼴 목록을 불러올 수 없습니다. 글꼴 이름을 입력하거나 파일을 추가해 주세요.')
  try {
    const fonts = await query.call(window)
    return [...new Set(fonts.map(font => cleanFontName(font.family)).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'ko-KR')).map(family => ({ family, label: family }))
  } catch {
    throw new Error('PC 글꼴 접근이 허용되지 않았습니다. 글꼴 이름을 직접 입력하거나 파일을 추가할 수 있습니다.')
  }
}

export function isFontAvailable(family: string): boolean {
  if (customFonts.has(family) || FONT_PRESETS.some(font => font.family === family && 'bundled' in font && font.bundled)) return true
  if (typeof document === 'undefined') return true
  const context = document.createElement('canvas').getContext('2d')
  if (!context) return true
  return ['monospace', 'serif', 'sans-serif'].some(fallback => {
    context.font = `72px ${fallback}`
    const baseline = context.measureText(FONT_SAMPLE).width
    context.font = `72px ${JSON.stringify(cleanFontName(family))}, ${fallback}`
    return Math.abs(context.measureText(FONT_SAMPLE).width - baseline) > 0.01
  })
}

function readSfntNames(buffer: ArrayBuffer): { family?: string; name?: string; weight?: number } {
  const view = new DataView(buffer)
  const result: { family?: string; name?: string; weight?: number } = {}
  if (view.byteLength < 12) return result
  const signature = view.getUint32(0)
  if (signature !== 0x00010000 && signature !== 0x4f54544f && signature !== 0x74727565) return result
  const entries = view.getUint16(4)
  const decoder = new TextDecoder('utf-16be')
  for (let i = 0; i < entries && 12 + (i + 1) * 16 <= view.byteLength; i++) {
    const offset = 12 + i * 16
    const tag = view.getUint32(offset)
    const start = view.getUint32(offset + 8)
    const length = view.getUint32(offset + 12)
    if (start + length > view.byteLength) continue
    if (tag === 0x4f532f32 && length >= 6) result.weight = view.getUint16(start + 4)
    if (tag !== 0x6e616d65 || length < 6) continue
    const count = view.getUint16(start + 2)
    const stringsAt = start + view.getUint16(start + 4)
    const names = new Map<number, { text: string; priority: number }>()
    for (let n = 0; n < count; n++) {
      const record = start + 6 + n * 12
      if (record + 12 > start + length) break
      const platform = view.getUint16(record)
      const language = view.getUint16(record + 4)
      const nameId = view.getUint16(record + 6)
      const byteLength = view.getUint16(record + 8)
      const textAt = stringsAt + view.getUint16(record + 10)
      if (![1, 4, 16].includes(nameId) || textAt + byteLength > start + length) continue
      if (platform !== 0 && platform !== 3) continue
      const text = cleanFontName(decoder.decode(new Uint8Array(buffer, textAt, byteLength)))
      const priority = language === 0x0409 ? 3 : language === 0x0412 ? 2 : 1
      if (text && priority > (names.get(nameId)?.priority ?? 0)) names.set(nameId, { text, priority })
    }
    result.family = names.get(16)?.text ?? names.get(1)?.text
    result.name = names.get(4)?.text ?? result.family
  }
  return result
}

export async function importFontFile(file: File): Promise<CustomFont> {
  if (!/\.(ttf|otf|woff2?)$/iu.test(file.name)) throw new Error('TTF, OTF, WOFF, WOFF2 글꼴 파일을 선택해 주세요.')
  if (!file.size || file.size > 15 * 1024 * 1024) throw new Error('글꼴 파일은 15MB 이하로 추가해 주세요.')
  const buffer = await file.arrayBuffer()
  const metadata = readSfntNames(buffer)
  const fallbackName = cleanFontName(file.name.replace(/\.(ttf|otf|woff2?)$/iu, '')) || '내 글꼴'
  const font: CustomFont = {
    id: crypto.randomUUID(), name: metadata.name ?? fallbackName, family: metadata.family ?? fallbackName,
    fileName: file.name, dataUrl: '', createdAt: new Date().toISOString(), weight: metadata.weight ?? 400,
  }
  try {
    await new FontFace(customFontFamily(font), buffer).load()
  } catch { throw new Error('글꼴 파일을 읽을 수 없습니다. 정상적인 글꼴 파일인지 확인해 주세요.') }
  font.dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('글꼴 파일을 저장하지 못했습니다. 다시 추가해 주세요.'))
    reader.readAsDataURL(file)
  })
  return font
}
