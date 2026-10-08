import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CustomFont } from '../types'
import { FONT_PRESETS, cleanFontName, cssFontFamily, customFontFamily, ensureFontLoaded, fontDisplayName, importFontFile, isFontAvailable, listLocalFonts, supportsLocalFontAccess } from '../lib/fonts'
import './FontPicker.css'

interface Props {
  value: string
  customFonts: CustomFont[]
  onChange: (family: string) => void
  onAddFont: (font: CustomFont) => void
  onRemoveFont?: (id: string) => void
  onError: (message: string) => void
  compact?: boolean
}

const SAMPLE = '주님을 찬양합니다'

export default function FontPicker({ value, customFonts, onChange, onAddFont, onRemoveFont, onError, compact = false }: Props) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [fontName, setFontName] = useState(value)
  const [fontSearch, setFontSearch] = useState('')
  const [localFonts, setLocalFonts] = useState<Array<{ family: string; label: string }>>([])
  const [localLoaded, setLocalLoaded] = useState(false)
  const [loadingLocal, setLoadingLocal] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [notice, setNotice] = useState('')
  const [pptxName, setPptxName] = useState('')
  const [position, setPosition] = useState({ top: 0, left: 0, maxHeight: 600 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const onErrorRef = useRef(onError)
  const reportedFontFailures = useRef(new Set<string>())
  const activeCustomFont = customFonts.find(font => customFontFamily(font) === value)
  const selectedName = fontDisplayName(value, customFonts)
  const localSupported = supportsLocalFontAccess()
  onErrorRef.current = onError

  useEffect(() => {
    setFontName(activeCustomFont?.family ?? value)
    setPptxName(activeCustomFont?.family ?? '')
  }, [value, activeCustomFont?.family])

  useEffect(() => {
    if (compact && !open) return
    let active = true
    // Waiting one microtask lets the parent register any newly imported fonts.
    void Promise.resolve().then(() => {
      if (!active) return
      for (const font of customFonts) {
        const family = customFontFamily(font)
        void ensureFontLoaded(family).catch(reason => {
          if (!active || family !== value || reportedFontFailures.current.has(font.id)) return
          reportedFontFailures.current.add(font.id)
          onErrorRef.current(reason instanceof Error ? reason.message : '선택한 글꼴을 열지 못했습니다. 글꼴 파일을 다시 추가해 주세요.')
        })
      }
    })
    return () => { active = false }
  }, [compact, open, customFonts, value])

  useEffect(() => {
    if (!compact || !open) return
    const placePanel = () => {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      const width = Math.min(520, window.innerWidth - 24)
      const remainingBelow = window.innerHeight - rect.bottom - 20
      const top = remainingBelow >= 300 ? rect.bottom + 8 : 12
      setPosition({
        top,
        left: Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)),
        maxHeight: Math.max(200, window.innerHeight - top - 12),
      })
    }
    placePanel()
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      triggerRef.current?.focus()
    }
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !panelRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) setOpen(false)
    }
    const initialFocus = window.setTimeout(() => panelRef.current?.querySelector<HTMLButtonElement>('.font-picker__preset[aria-pressed="true"], .font-picker__preset')?.focus(), 0)
    document.addEventListener('keydown', onEscape, true)
    document.addEventListener('pointerdown', closeOutside)
    window.addEventListener('resize', placePanel)
    window.addEventListener('scroll', placePanel, true)
    return () => {
      window.clearTimeout(initialFocus)
      document.removeEventListener('keydown', onEscape, true)
      document.removeEventListener('pointerdown', closeOutside)
      window.removeEventListener('resize', placePanel)
      window.removeEventListener('scroll', placePanel, true)
    }
  }, [compact, open])

  const selectFont = (family: string) => {
    onChange(family)
    setNotice(isFontAvailable(family) ? '글꼴을 적용했습니다.' : '이 기기에서 찾을 수 없는 글꼴입니다. 글꼴 파일을 올리면 정확하게 표시됩니다.')
  }

  const applyName = () => {
    const entered = cleanFontName(cleanFontName(fontName).replace(/^['"]|['"]$/g, ''))
    if (!entered) { onError('사용할 글꼴 이름을 입력해 주세요.'); return }
    const uploaded = customFonts.find(font => font.family.toLocaleLowerCase() === entered.toLocaleLowerCase() || font.name.toLocaleLowerCase() === entered.toLocaleLowerCase())
    const preset = FONT_PRESETS.find(font => [font.family, font.label].some(name => name.toLocaleLowerCase() === entered.toLocaleLowerCase()))
    const family = uploaded ? customFontFamily(uploaded) : preset?.family ?? entered
    onChange(family)
    setNotice(isFontAvailable(family) ? '글꼴을 적용했습니다.' : '이 기기에서 찾을 수 없는 글꼴입니다. 글꼴 파일을 올리면 정확하게 표시됩니다.')
  }

  const loadLocal = async () => {
    setLoadingLocal(true)
    try {
      const fonts = await listLocalFonts()
      setLocalFonts(fonts)
      setLocalLoaded(true)
      setNotice(fonts.length ? `이 PC의 글꼴 ${fonts.length}개를 불러왔습니다.` : '불러올 글꼴이 없습니다. 글꼴 이름을 입력하거나 파일을 올려 주세요.')
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : '내 PC 글꼴을 불러오지 못했습니다. 브라우저의 글꼴 접근을 허용해 주세요.')
    } finally { setLoadingLocal(false) }
  }

  const upload = async (file?: File) => {
    if (!file || uploading) return
    if (customFonts.length >= 30) {
      onError('글꼴은 최대 30개까지 추가할 수 있습니다. 사용하지 않는 글꼴을 삭제한 뒤 다시 추가해 주세요.')
      if (fileRef.current) fileRef.current.value = ''
      return
    }
    setUploading(true)
    try {
      const font = await importFontFile(file)
      onAddFont(font)
      onChange(customFontFamily(font))
      setNotice(`‘${font.name}’을 추가하고 적용했습니다.`)
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : '글꼴 파일을 열지 못했습니다. 다른 파일로 다시 시도해 주세요.')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const remove = (font: CustomFont) => {
    if (!onRemoveFont || !window.confirm(`추가한 글꼴 ‘${font.name}’을 삭제할까요?`)) return
    if (customFontFamily(font) === value && FONT_PRESETS[0]) onChange(FONT_PRESETS[0].family)
    onRemoveFont(font.id)
    setNotice('추가한 글꼴을 삭제했습니다.')
  }

  const savePptxName = () => {
    if (!activeCustomFont) return
    const family = cleanFontName(pptxName)
    if (!family) { onError('PowerPoint에서 사용할 글꼴 이름을 입력해 주세요.'); return }
    onAddFont({ ...activeCustomFont, family })
    setNotice('PowerPoint 글꼴 이름을 저장했습니다.')
  }

  const visibleLocalFonts = localFonts.filter(font => `${font.label} ${font.family}`.toLocaleLowerCase().includes(fontSearch.toLocaleLowerCase()))

  const content = <div
    className={`font-picker${compact ? ' font-picker--dropdown' : ''}`}
    ref={panelRef}
    id={`${id}-panel`}
    role={compact ? 'dialog' : undefined}
    aria-label={compact ? '가사 글꼴 선택' : undefined}
    style={compact ? { top: position.top, left: position.left, maxHeight: position.maxHeight } : undefined}
  >
    <div className="font-picker__header">
      <div><span className="font-picker__eyebrow">LYRIC FONT</span><h3>가사 글꼴</h3></div>
      {compact && <button className="font-picker__close" type="button" aria-label="글꼴 선택 닫기" onClick={() => { setOpen(false); triggerRef.current?.focus() }}>×</button>}
    </div>
    <p className="font-picker__intro">미리보기, 예배 화면, PPT에 같은 글꼴을 사용합니다.</p>
    {!compact && <div className="font-picker__stage" aria-label={`선택한 글꼴 미리보기: ${selectedName}`}>
      <div style={{ fontFamily: cssFontFamily(value) }}>{SAMPLE}<br />우리의 마음을 모아</div>
      <span>{selectedName}</span>
    </div>}
    <div className="font-picker__presets" aria-label="추천 글꼴">
      {FONT_PRESETS.map(font => <button
        className={`font-picker__preset${value === font.family ? ' is-selected' : ''}`}
        key={font.family}
        type="button"
        aria-pressed={value === font.family}
        onClick={() => selectFont(font.family)}
      >
        <span className="font-picker__preset-top"><strong>{font.label}</strong><span className="font-picker__check" aria-hidden="true">{value === font.family ? '✓' : ''}</span></span>
        <span className="font-picker__sample" style={{ fontFamily: cssFontFamily(font.family) }}>{SAMPLE}</span>
        <small>{font.description ?? ('bundled' in font && font.bundled ? '어느 기기에서나 같은 모습' : '이 기기에 설치된 글꼴')}</small>
      </button>)}
    </div>

    <div className="font-picker__section">
      <div className="font-picker__section-head"><h4>원하는 글꼴 직접 사용하기</h4></div>
      <form className="font-picker__input-row" onSubmit={event => { event.preventDefault(); applyName() }}>
        <label className="font-picker__sr-only" htmlFor={`${id}-name`}>사용할 글꼴 이름</label>
        <input id={`${id}-name`} value={fontName} onChange={event => setFontName(event.target.value)} placeholder="예: 맑은 고딕, 나눔스퀘어" />
        <button className="font-picker__button" type="submit">적용</button>
      </form>
      <p className="font-picker__help">PC에 설치된 글꼴의 정확한 이름을 입력하세요. 다른 PC에서도 쓰려면 글꼴 파일을 추가해 주세요.</p>
      {localSupported && <button className="font-picker__button font-picker__button--wide" type="button" onClick={() => void loadLocal()} disabled={loadingLocal}>
        {loadingLocal ? '글꼴을 불러오는 중…' : localLoaded ? '내 PC 글꼴 다시 불러오기' : '내 PC 글꼴에서 고르기'}
      </button>}
      {localLoaded && <div className="font-picker__local">
        <label className="font-picker__sr-only" htmlFor={`${id}-search`}>내 PC 글꼴 검색</label>
        <input id={`${id}-search`} placeholder="글꼴 검색" value={fontSearch} onChange={event => setFontSearch(event.target.value)} />
        <div className="font-picker__local-list" aria-label="내 PC 글꼴 목록">
          {visibleLocalFonts.map(font => <button type="button" key={font.family} aria-pressed={value === font.family} className={value === font.family ? 'is-selected' : ''} onClick={() => selectFont(font.family)}>
            <span>{font.label}</span><span style={{ fontFamily: cssFontFamily(font.family) }}>가나다 찬양</span><span aria-hidden="true">{value === font.family ? '✓' : ''}</span>
          </button>)}
          {visibleLocalFonts.length === 0 && <p className="font-picker__empty">일치하는 글꼴이 없습니다.</p>}
        </div>
      </div>}
    </div>

    <div className="font-picker__section">
      <div className="font-picker__section-head"><h4>내 글꼴 파일 추가</h4><span>TTF · OTF · WOFF · WOFF2</span></div>
      <input className="font-picker__file" ref={fileRef} type="file" accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2" aria-label="글꼴 파일 선택" onChange={event => void upload(event.target.files?.[0])} />
      <button className="font-picker__upload" type="button" disabled={uploading} onClick={() => fileRef.current?.click()}><span aria-hidden="true">＋</span>{uploading ? '글꼴을 추가하는 중…' : '글꼴 파일 선택'}</button>
      <p className="font-picker__help">사용할 권한이 있는 글꼴 파일을 추가하세요. 이 브라우저에 저장되며 JSON 백업에도 포함됩니다.</p>
      {customFonts.length > 0 && <div className="font-picker__uploaded" aria-label="추가한 글꼴 목록">
        {customFonts.map(font => <div className={`font-picker__uploaded-row${customFontFamily(font) === value ? ' is-selected' : ''}`} key={font.id}>
          <button type="button" className="font-picker__uploaded-select" aria-pressed={customFontFamily(font) === value} onClick={() => selectFont(customFontFamily(font))}>
            <span><strong>{font.name}</strong><small>{font.fileName}</small></span><span style={{ fontFamily: cssFontFamily(customFontFamily(font)) }}>가나다</span><span className="font-picker__check" aria-hidden="true">{customFontFamily(font) === value ? '✓' : ''}</span>
          </button>
          {onRemoveFont && <button type="button" className="font-picker__remove" aria-label={`글꼴 ${font.name} 삭제`} onClick={() => remove(font)}>삭제</button>}
        </div>)}
      </div>}
      {activeCustomFont && <details className="font-picker__pptx">
        <summary>PowerPoint 글꼴 이름 확인</summary>
        <p className="font-picker__help">PPT를 여는 PC에도 이 글꼴을 설치해 주세요. 이름이 다르게 인식될 때만 아래 이름을 바꾸세요.</p>
        <form className="font-picker__input-row" onSubmit={event => { event.preventDefault(); savePptxName() }}>
          <label className="font-picker__sr-only" htmlFor={`${id}-pptx`}>PowerPoint 글꼴 이름</label>
          <input id={`${id}-pptx`} value={pptxName} onChange={event => setPptxName(event.target.value)} placeholder="PowerPoint에 표시되는 글꼴 이름" />
          <button className="font-picker__button" type="submit">저장</button>
        </form>
      </details>}
    </div>
    <p className="font-picker__notice" role="status" aria-live="polite">{notice || `현재 글꼴 · ${selectedName}`}</p>
    <p className="font-picker__help">PPT를 여는 PC에도 선택한 글꼴이 설치되어 있어야 같은 모습으로 표시됩니다.</p>
  </div>

  if (!compact) return content
  return <>
    <button ref={triggerRef} type="button" className="font-picker__trigger" aria-label={`가사 글꼴: ${selectedName}`} aria-expanded={open} aria-controls={`${id}-panel`} aria-haspopup="dialog" onClick={() => setOpen(current => !current)}>
      <span className="font-picker__trigger-symbol" aria-hidden="true">가</span><span>{selectedName}</span><span className="font-picker__trigger-chevron" aria-hidden="true">⌄</span>
    </button>
    {open && createPortal(content, document.body)}
  </>
}
