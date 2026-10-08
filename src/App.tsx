import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppData, CustomFont, Slide, Song, Week, WeekItem } from './types'
import { createEmptyData, loadAppData, normalizeTitle, saveAppData } from './lib/storage'
import { isAdminAuthenticated, isEditorAuthenticated, lockEditor, unlockAdmin, unlockEditor } from './lib/auth'
import { splitLyrics } from './lib/split'
import { exportWeekPptx, getWeekPresentationSlides } from './lib/pptx'
import { fitSlideText } from './lib/fit'
import { createSerializedSaveQueue } from './lib/saveQueue'
import SlideCanvas from './components/SlideCanvas'
import SlideEditor from './components/SlideEditor'
import Presentation from './components/Presentation'
import AdminPanel from './components/AdminPanel'
import FontPicker from './components/FontPicker'
import { customFontFamily, DEFAULT_FONT_FAMILY, fontDisplayName, getPptxFontFamily, registerCustomFonts } from './lib/fonts'

type View = 'home' | 'week' | 'library' | 'history' | 'admin'
type Modal = 'editor' | 'admin' | 'song' | 'picker' | 'overview' | null

const newId = () => crypto.randomUUID()
const iso = () => new Date().toISOString()
const cloneSlides = (slides: Slide[]) => slides.map(slide => ({ ...slide, id: newId() }))
const dateLabel = (date: string) => date ? new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date(`${date}T12:00:00`)) : '날짜 미정'
function nextSunday() {
  const day = new Date()
  day.setDate(day.getDate() + (7 - day.getDay()) % 7)
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
}
function downloadText(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function App() {
  const [data, setData] = useState<AppData | null>(null)
  const [loadMessage, setLoadMessage] = useState('')
  const [view, setView] = useState<View>('home')
  const [editing, setEditing] = useState(isEditorAuthenticated)
  const [admin, setAdmin] = useState(isAdminAuthenticated)
  const [modal, setModal] = useState<Modal>(null)
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [weekId, setWeekId] = useState<string | null>(null)
  const [itemId, setItemId] = useState<string | null>(null)
  const [slideId, setSlideId] = useState<string | null>(null)
  const [songId, setSongId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [songTitle, setSongTitle] = useState('')
  const [songLyrics, setSongLyrics] = useState('')
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved')
  const [notice, setNotice] = useState('')
  const [presentation, setPresentation] = useState<Slide[] | null>(null)
  const [error, setError] = useState('')
  const saveSkip = useRef(true)
  const dataRef = useRef<AppData | null>(null)
  const saveGeneration = useRef(0)
  const saveQueue = useRef(createSerializedSaveQueue(saveAppData))
  const requestedView = useRef<View>('week')
  const dragItem = useRef<string | null>(null)

  const enqueueSave = useCallback((snapshot: AppData, generation: number) => {
    void saveQueue.current(snapshot, generation).then(() => {
      if (generation === saveGeneration.current) setSaveState('saved')
    }).catch(reason => {
      if (generation !== saveGeneration.current) return
      setSaveState('error')
      setError(reason instanceof Error ? reason.message : '자동 저장에 실패했습니다. JSON 백업을 내려받아 주세요.')
    })
  }, [])

  useEffect(() => {
    let active = true
    const blocked = () => setLoadMessage('다른 탭의 SALROM PPT를 닫거나 새로고침해 주세요. 기존 자료를 안전하게 불러오기 위해 기다리고 있습니다.')
    window.addEventListener('salrom-storage-blocked', blocked)
    loadAppData().then(result => {
      if (!active) return
      setData(result)
      dataRef.current = result
      setWeekId([...result.weeks].sort((a, b) => b.date.localeCompare(a.date))[0]?.id ?? null)
    }).catch(reason => {
      if (!active) return
      setError(reason instanceof Error ? reason.message : '자료를 열지 못했습니다. JSON 백업으로 복원해 주세요.')
      setData(createEmptyData())
    })
    return () => { active = false; window.removeEventListener('salrom-storage-blocked', blocked) }
  }, [])

  useEffect(() => {
    if (!data) return
    dataRef.current = data
    if (saveSkip.current) { saveSkip.current = false; return }
    const generation = ++saveGeneration.current
    setSaveState('saving')
    const timer = window.setTimeout(() => enqueueSave(data, generation), 450)
    return () => window.clearTimeout(timer)
  }, [data, enqueueSave])

  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (saveState === 'saved') return
      event.preventDefault()
      event.returnValue = ''
    }
    const flush = () => {
      if (document.visibilityState === 'hidden' && dataRef.current && saveState !== 'saved') {
        enqueueSave(dataRef.current, saveGeneration.current)
      }
    }
    window.addEventListener('beforeunload', unload)
    document.addEventListener('visibilitychange', flush)
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('visibilitychange', flush) }
  }, [saveState, enqueueSave])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 4000)
    return () => window.clearTimeout(timer)
  }, [notice])

  if (!data) return <div className="loading-screen"><span className="brand-mark">✦</span><strong>SALROM PPT</strong><p role="status">{loadMessage || '자료를 불러오는 중입니다.'}</p></div>

  registerCustomFonts(data.customFonts ?? [])
  const selectedFontName = fontDisplayName(data.settings.fontFamily, data.customFonts)

  const weeks = [...data.weeks].sort((a, b) => b.date.localeCompare(a.date))
  const week = data.weeks.find(candidate => candidate.id === weekId) ?? weeks[0]
  const item = week?.items.find(candidate => candidate.id === itemId) ?? week?.items[0]
  const song = data.songs.find(candidate => candidate.id === songId)
  const currentSlides = week ? getWeekPresentationSlides(week, data.settings) : []
  const focusedSlide = item?.slides.find(candidate => candidate.id === slideId) ?? item?.slides[0]
  const filteredSongs = data.songs.filter(candidate => normalizeTitle(candidate.title).includes(normalizeTitle(query)))
    .sort((a, b) => (b.lastUsedAt ?? b.updatedAt).localeCompare(a.lastUsedAt ?? a.updatedAt))
  const duplicate = songTitle.trim() ? data.songs.find(candidate => candidate.normalizedTitle === normalizeTitle(songTitle) || (normalizeTitle(songTitle).length > 3 && candidate.normalizedTitle.includes(normalizeTitle(songTitle)))) : undefined

  const update = (updater: (current: AppData) => AppData) => setData(current => current ? updater(current) : current)
  const changeFont = (family: string) => update(current => ({ ...current, settings: { ...current.settings, fontFamily: family } }))
  const addFont = (font: CustomFont) => update(current => ({ ...current, customFonts: [...(current.customFonts ?? []).filter(existing => existing.id !== font.id), font] }))
  const removeFont = (id: string) => update(current => ({
    ...current, customFonts: (current.customFonts ?? []).filter(font => font.id !== id),
    settings: current.settings.fontFamily === customFontFamily({ id }) ? { ...current.settings, fontFamily: DEFAULT_FONT_FAMILY } : current.settings,
  }))
  const fontPicker = <FontPicker compact value={data.settings.fontFamily} customFonts={data.customFonts ?? []} onChange={changeFont} onAddFont={addFont} onRemoveFont={removeFont} onError={setError} />
  const updateWeek = (updater: (current: Week) => Week) => {
    if (!week) return
    update(current => ({ ...current, weeks: current.weeks.map(candidate => candidate.id === week.id ? { ...updater(candidate), updatedAt: iso() } : candidate) }))
  }
  const newWeek = () => {
    const now = iso()
    const created: Week = { id: newId(), date: nextSunday(), name: '주일예배', items: [], createdAt: now, updatedAt: now }
    update(current => ({ ...current, weeks: [...current.weeks, created] }))
    setWeekId(created.id)
    setItemId(null)
    setView('week')
  }
  const needEditor = (next: View) => {
    if (!editing) { requestedView.current = next; setPassword(''); setAuthError(''); setModal('editor'); return }
    setView(next)
  }
  const submitPassword = () => {
    if (modal === 'editor') {
      if (!unlockEditor(password)) { setAuthError('비밀번호가 올바르지 않습니다.'); return }
      setEditing(true)
      setView(requestedView.current)
    } else if (modal === 'admin') {
      if (!unlockAdmin(password)) { setAuthError('비밀번호가 올바르지 않습니다.'); return }
      setAdmin(true)
      setView('admin')
    }
    setPassword('')
    setAuthError('')
    setModal(null)
  }
  const leaveEditor = () => {
    lockEditor()
    setEditing(false)
    setAdmin(false)
    setView('home')
  }
  const addSong = () => {
    if (!songTitle.trim() || !songLyrics.trim()) { setNotice('곡 제목과 전체 가사를 입력해 주세요.'); return }
    const split = splitLyrics(songLyrics, data.settings)
    if (!split.slides.length) { setNotice('가사를 확인해 주세요.'); return }
    const now = iso()
    const createdSong: Song = { id: newId(), title: songTitle.trim(), normalizedTitle: normalizeTitle(songTitle), rawLyrics: songLyrics.trim(), slides: split.slides, createdAt: now, updatedAt: now, lastUsedAt: now, version: 1 }
    const targetWeek = week ?? { id: newId(), date: nextSunday(), name: '주일예배', items: [], createdAt: now, updatedAt: now }
    const createdItem: WeekItem = { id: newId(), type: 'song', title: createdSong.title, songId: createdSong.id, slides: cloneSlides(createdSong.slides), sourceMode: 'copy' }
    update(current => ({ ...current, songs: [...current.songs, createdSong], weeks: current.weeks.some(candidate => candidate.id === targetWeek.id)
      ? current.weeks.map(candidate => candidate.id === targetWeek.id ? { ...candidate, items: [...candidate.items, createdItem], updatedAt: now } : candidate)
      : [...current.weeks, { ...targetWeek, items: [createdItem] }] }))
    setWeekId(targetWeek.id)
    setItemId(createdItem.id)
    setSlideId(createdItem.slides[0]?.id ?? null)
    setSongTitle(''); setSongLyrics(''); setModal(null); setView('week')
    const details = [split.warnings.length ? `${split.warnings.length}장에 긴 가사 경고` : '', split.repeats.length ? '반복 구절 후보 감지' : ''].filter(Boolean).join(' · ')
    setNotice(`${split.slides.length}장의 슬라이드 초안을 만들었습니다.${details ? ` ${details}` : ''}`)
  }
  const addExisting = (source: Song, mode: 'use' | 'copy' | 'original') => {
    const now = iso()
    const targetWeek = week ?? { id: newId(), date: nextSunday(), name: '주일예배', items: [], createdAt: now, updatedAt: now }
    const created: WeekItem = { id: newId(), type: 'song', title: source.title, songId: source.id, slides: cloneSlides(source.slides), sourceMode: mode === 'original' ? 'original' : 'copy' }
    update(current => ({ ...current,
      songs: current.songs.map(candidate => candidate.id === source.id ? { ...candidate, lastUsedAt: now } : candidate),
      weeks: current.weeks.some(candidate => candidate.id === targetWeek.id)
        ? current.weeks.map(candidate => candidate.id === targetWeek.id ? { ...candidate, items: [...candidate.items, created], updatedAt: now } : candidate)
        : [...current.weeks, { ...targetWeek, items: [created] }],
    }))
    setWeekId(targetWeek.id); setItemId(created.id); setSlideId(created.slides[0]?.id ?? null); setModal(null); setView('week')
    setNotice(mode === 'original' ? '원본 수정 방식으로 추가했습니다. 이 곡을 수정하면 보관함에도 반영됩니다.' : '찬양을 이번 주에 추가했습니다.')
  }
  const updateItemSlides = (slides: Slide[]) => {
    if (!week || !item) return
    update(current => ({ ...current,
      weeks: current.weeks.map(candidate => candidate.id === week.id ? { ...candidate, updatedAt: iso(), items: candidate.items.map(entry => entry.id === item.id ? { ...entry, slides } : entry) } : candidate),
      songs: item.sourceMode === 'original' && item.songId ? current.songs.map(candidate => candidate.id === item.songId ? { ...candidate, slides: cloneSlides(slides), updatedAt: iso(), version: candidate.version + 1 } : candidate) : current.songs,
    }))
    if (slideId && !slides.some(slide => slide.id === slideId)) setSlideId(slides[0]?.id ?? null)
  }
  const addGeneral = () => {
    const slide: Slide = { id: newId(), text: '' }
    const created: WeekItem = { id: newId(), type: 'general', title: '일반 슬라이드', slides: [slide] }
    updateWeek(current => ({ ...current, items: [...current.items, created] }))
    setItemId(created.id); setSlideId(slide.id)
  }
  const moveItem = (fromId: string, toId: string) => {
    if (fromId === toId) return
    updateWeek(current => {
      const items = [...current.items]
      const from = items.findIndex(entry => entry.id === fromId)
      const to = items.findIndex(entry => entry.id === toId)
      if (from < 0 || to < 0) return current
      items.splice(to, 0, items.splice(from, 1)[0])
      return { ...current, items }
    })
  }
  const previewPresentation = () => {
    if (!week || currentSlides.length === 0) { setNotice('먼저 슬라이드를 추가해 주세요.'); return }
    setPresentation(structuredClone(currentSlides))
  }
  const doExport = async () => {
    if (!week) return
    try {
      const name = await exportWeekPptx(week, data.settings)
      updateWeek(current => ({ ...current, exportedAt: iso() }))
      setNotice(`${name} 파일을 다운로드했습니다.`)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'PPTX 생성에 실패했습니다.') }
  }
  const selectHistoryWeek = (selected: Week) => { setWeekId(selected.id); setItemId(selected.items[0]?.id ?? null); setView(editing ? 'week' : 'home') }
  const cloneWeek = (source: Week) => {
    const now = iso()
    const created: Week = { ...structuredClone(source), id: newId(), name: `${source.name} 복사본`, items: source.items.map(entry => ({ ...entry, id: newId(), slides: cloneSlides(entry.slides), sourceMode: 'copy' })), createdAt: now, updatedAt: now, exportedAt: undefined }
    update(current => ({ ...current, weeks: [...current.weeks, created] }))
    setWeekId(created.id); setItemId(created.items[0]?.id ?? null); setView('week')
  }

  return <>
    {presentation && <Presentation slides={presentation} settings={data.settings} onClose={() => setPresentation(null)} />}
    <div className={presentation ? 'app-shell app-shell--hidden' : 'app-shell'}>
      <header className="topbar">
        <button className="brand" onClick={() => setView('home')} onDoubleClick={() => { if (editing) { setPassword(''); setAuthError(''); setModal('admin') } }} title="SALROM PPT"><span className="brand-mark">✦</span><span>SALROM <b>PPT</b></span></button>
        <nav aria-label="주요 메뉴" className="main-nav">
          <button className={view === 'week' ? 'active' : ''} onClick={() => needEditor('week')}>이번 주</button>
          <button className={view === 'library' ? 'active' : ''} onClick={() => needEditor('library')}>찬양 보관함</button>
          <button className={view === 'history' ? 'active' : ''} onClick={() => setView('history')}>지난 PPT</button>
          <button onClick={previewPresentation}>예배 화면</button>
        </nav>
        <div className="topbar-actions">
          {editing && <span className={`save-indicator save-indicator--${saveState}`} aria-live="polite">{saveState === 'saving' ? '저장 중' : saveState === 'error' ? '저장 오류' : '저장됨'}</span>}
          <button className="button button--small button--outline" onClick={editing ? leaveEditor : () => { requestedView.current = 'week'; setPassword(''); setAuthError(''); setModal('editor') }}>{editing ? '편집 종료' : '편집 시작'}</button>
        </div>
      </header>
      <main className="main-area">
        {view === 'home' && <section className="home-view">
          <div className="home-copy">
            <span className="eyebrow">예배 자료</span>
            <h1>{week ? week.name : '이번 주 예배를 준비하세요'}</h1>
            <p className="home-date">{week ? dateLabel(week.date) : '찬양 가사를 붙여넣으면 슬라이드 초안이 바로 만들어집니다.'}</p>
            {week && <div className="home-setlist"><span className="section-label">찬양 순서</span>{week.items.length ? week.items.map((entry, index) => <div className="home-song" key={entry.id}><span>{String(index + 1).padStart(2, '0')}</span><strong>{entry.title}</strong><small>{entry.slides.length}장</small></div>) : <p className="muted">아직 추가된 찬양이 없습니다.</p>}</div>}
            <div className="button-row"><button className="button" onClick={previewPresentation} disabled={!currentSlides.length}>예배 화면 열기</button><button className="button button--outline" onClick={() => needEditor('week')}>{editing ? '이번 주 편집' : '편집 시작'}</button></div>
            {!week && <p className="helper-text">현재 브라우저에 저장된 주간 자료가 없습니다. 편집 후 JSON 백업으로 다른 기기에 옮길 수 있습니다.</p>}
          </div>
          <div className="home-stage"><div className="stage-heading"><span>화면 미리보기</span><span>16:9</span></div><SlideCanvas text={currentSlides[0]?.text ?? '찬양 가사를 입력하면\n이곳에 예배 화면이 보입니다'} settings={data.settings} /><p>검정 배경 · 흰 글씨 · {selectedFontName}</p></div>
        </section>}

        {view === 'week' && <section className="week-view">
          <div className="page-heading"><div><span className="eyebrow">WEEKLY SETLIST</span><h1>이번 주</h1><p>곡을 고르고 가사를 바로 수정하세요.</p></div><div className="button-row"><button className="button button--outline" onClick={newWeek}>새 주간 자료</button><button className="button button--outline" onClick={() => setModal('overview')} disabled={!currentSlides.length}>전체 미리보기</button><button className="button" onClick={previewPresentation} disabled={!currentSlides.length}>예배 화면으로 보기</button></div></div>
          {!week ? <div className="empty-card"><div className="empty-icon">✦</div><h2>첫 예배 자료를 만들어 보세요</h2><p>날짜와 이름을 정한 뒤 찬양을 추가할 수 있습니다.</p><button className="button" onClick={newWeek}>이번 주 PPT 만들기</button></div> : <>
            <div className="week-meta"><label>예배 날짜<input type="date" value={week.date} onChange={event => updateWeek(current => ({ ...current, date: event.target.value }))} /></label><label>예배 이름<input value={week.name} onChange={event => updateWeek(current => ({ ...current, name: event.target.value }))} placeholder="예: 주일예배" /></label><div className="week-meta__count">{week.items.length}곡 · {currentSlides.length}장</div></div>
            <div className="workspace-grid">
              <div className="workspace-main">
                <div className="section-top"><h2>찬양 순서</h2><div className="button-row"><button className="button button--small button--outline" onClick={() => setModal('picker')}>보관함에서 추가</button><button className="button button--small" onClick={() => setModal('song')}>새 찬양 추가</button><button className="button button--small button--quiet" onClick={addGeneral}>일반 슬라이드</button></div></div>
                {week.items.length === 0 ? <div className="empty-list">찬양이 아직 없습니다. 가사 전체를 붙여넣어 첫 곡을 추가해 보세요.</div> : <div className="setlist">{week.items.map((entry, index) => <div key={entry.id} className={`setlist-item ${item?.id === entry.id ? 'setlist-item--active' : ''}`} draggable onDragStart={() => { dragItem.current = entry.id }} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (dragItem.current) moveItem(dragItem.current, entry.id); dragItem.current = null }}>
                    <button className="setlist-item__main" onClick={() => { setItemId(entry.id); setSlideId(entry.slides[0]?.id ?? null) }} aria-label={`${entry.title} 편집`}><span className="drag-handle" title="드래그하여 순서 변경">⠿</span><span className="setlist-number">{String(index + 1).padStart(2, '0')}</span><span className="setlist-title">{entry.title}</span><small>{entry.slides.length}장</small></button>
                    <div className="setlist-item__actions"><button title="위로" aria-label={`${entry.title} 위로`} disabled={index === 0} onClick={() => moveItem(entry.id, week.items[index - 1].id)}>↑</button><button title="아래로" aria-label={`${entry.title} 아래로`} disabled={index === week.items.length - 1} onClick={() => moveItem(entry.id, week.items[index + 1].id)}>↓</button><button title="삭제" aria-label={`${entry.title} 삭제`} onClick={() => { if (window.confirm(`‘${entry.title}’을(를) 이번 주에서 삭제할까요?`)) updateWeek(current => ({ ...current, items: current.items.filter(candidate => candidate.id !== entry.id) })) }}>×</button></div>
                  </div>)}</div>}
                {item && <div className="editor-section"><div className="section-top"><div><span className="eyebrow">SLIDE EDITOR</span><h2>{item.type === 'general' ? <input className="inline-title" value={item.title} aria-label="일반 슬라이드 제목" onChange={event => updateWeek(current => ({ ...current, items: current.items.map(entry => entry.id === item.id ? { ...entry, title: event.target.value } : entry) }))} /> : item.title}</h2></div><span className="muted">카드를 클릭해 바로 수정 · Ctrl+Enter로 분리</span></div><SlideEditor key={item.id} slides={item.slides} onChange={updateItemSlides} maxLines={data.settings.maxLines} selectedId={slideId ?? undefined} onSelect={setSlideId} /></div>}
              </div>
              <aside className="preview-panel"><div className="section-top"><h2>실시간 미리보기</h2><span>16:9</span></div><SlideCanvas text={focusedSlide?.text ?? '슬라이드를 선택하세요'} settings={data.settings} /><div className="preview-meta"><strong>{item?.title ?? '선택된 곡 없음'}</strong><span>{item && focusedSlide ? `${item.slides.findIndex(slide => slide.id === focusedSlide.id) + 1} / ${item.slides.length}` : ''}</span></div>{focusedSlide && fitSlideText(focusedSlide.text, data.settings).needsSplit && <p className="warning-text">가사가 안전 영역을 넘을 수 있습니다. 자동 분리를 검토하세요.</p>}<div className="preview-font"><span>가사 글꼴</span>{fontPicker}</div><p className="preview-tip">PPT를 여는 PC에도 {getPptxFontFamily(data.settings)} 글꼴을 설치해 주세요.</p><div className="preview-actions"><button className="button button--outline" onClick={() => setModal('overview')} disabled={!currentSlides.length}>전체 미리보기 · PPTX</button><button className="button" onClick={previewPresentation} disabled={!currentSlides.length}>예배 화면</button></div></aside>
            </div>
          </>}
        </section>}

        {view === 'library' && <section className="list-view"><div className="page-heading"><div><span className="eyebrow">SONG LIBRARY</span><h1>찬양 보관함</h1><p>한 번 만든 찬양을 다음 주에도 바로 사용하세요.</p></div><button className="button" onClick={() => setModal('song')}>새 찬양 추가</button></div><div className="search-row"><input type="search" placeholder="제목 검색 · 띄어쓰기 무관" aria-label="찬양 검색" value={query} onChange={event => setQuery(event.target.value)} /><span>{filteredSongs.length}곡</span></div><div className="library-layout"><div className="library-list">{filteredSongs.length ? filteredSongs.map(entry => <button key={entry.id} className={`library-card ${song?.id === entry.id ? 'library-card--active' : ''}`} onClick={() => setSongId(entry.id)}><strong>{entry.title}</strong><span>{entry.slides.length}장 · 버전 {entry.version}</span></button>) : <div className="empty-list">검색 결과가 없습니다. 새 찬양을 추가해 보세요.</div>}</div><div className="library-detail">{song ? <><div className="section-top"><div><span className="eyebrow">보관함 원본</span><h2>{song.title}</h2><p>수정하면 새로 추가하는 주간 자료에 반영됩니다. 기존 주간 자료는 그대로 유지됩니다.</p></div><button className="button button--small" onClick={() => addExisting(song, 'copy')}>이번 주에 추가</button></div><SlideEditor key={song.id} slides={song.slides} onChange={slides => update(current => ({ ...current, songs: current.songs.map(entry => entry.id === song.id ? { ...entry, slides, updatedAt: iso(), version: entry.version + 1 } : entry) }))} maxLines={data.settings.maxLines} /></> : <div className="empty-card empty-card--compact"><h2>찬양을 선택하세요</h2><p>가사 구성을 확인하거나 수정할 수 있습니다.</p></div>}</div></div></section>}

        {view === 'history' && <section className="list-view"><div className="page-heading"><div><span className="eyebrow">ARCHIVE</span><h1>지난 PPT</h1><p>저장된 주간 자료는 찬양 원본을 수정해도 바뀌지 않습니다.</p></div>{editing && <button className="button" onClick={newWeek}>새 주간 자료</button>}</div>{weeks.length ? <div className="history-grid">{weeks.map(entry => <article key={entry.id} className="history-card"><div className="history-card__date">{dateLabel(entry.date)}</div><h2>{entry.name}</h2><p>{entry.items.map(item => item.title).join(' · ') || '찬양 없음'}</p><div className="history-card__footer"><span>{entry.items.length}곡 · {getWeekPresentationSlides(entry, data.settings).length}장</span><div className="button-row"><button className="button button--small button--outline" onClick={() => selectHistoryWeek(entry)}>{editing ? '열기' : '보기'}</button>{editing && <button className="button button--small button--quiet" onClick={() => cloneWeek(entry)}>복제</button>}<button className="button button--small" onClick={() => { setWeekId(entry.id); const slides = getWeekPresentationSlides(entry, data.settings); if (slides.length) setPresentation(structuredClone(slides)); else setNotice('이 자료에는 슬라이드가 없습니다.') }}>송출</button></div></div></article>)}</div> : <div className="empty-card"><h2>저장된 지난 자료가 없습니다</h2><p>이번 주 PPT를 만들면 여기에 표시됩니다.</p></div>}</section>}

        {view === 'admin' && admin && <AdminPanel data={data} onChange={update} onOpenWeek={id => { setWeekId(id); setView('week') }} onOpenSong={id => { setSongId(id); setView('library') }} onNotice={setNotice} onError={setError} onAddFont={addFont} onRemoveFont={removeFont} />}
      </main>
      <footer className="site-footer"><span>SALROM PPT</span><span>자료는 이 브라우저에 자동 저장됩니다.</span></footer>
    </div>

    {modal && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setModal(null) }}><div className={`dialog dialog--${modal}`} role="dialog" aria-modal="true" aria-label={modal === 'editor' ? '편집 비밀번호' : modal === 'admin' ? '관리자 모드' : modal === 'song' ? '새 찬양 추가' : modal === 'picker' ? '찬양 보관함에서 추가' : '전체 미리보기'}>
      <div className="dialog-head"><h2>{modal === 'editor' ? '편집 시작' : modal === 'admin' ? '관리자 모드로 입장하시겠습니까?' : modal === 'song' ? '새 찬양 추가' : modal === 'picker' ? '찬양 보관함에서 추가' : '전체 미리보기'}</h2><button className="icon-button" onClick={() => setModal(null)} aria-label="닫기">×</button></div>
      {(modal === 'editor' || modal === 'admin') && <form onSubmit={event => { event.preventDefault(); submitPassword() }}><p className="muted">{modal === 'editor' ? '편집 비밀번호를 입력해 주세요.' : '관리자 비밀번호를 입력해 주세요.'}</p><input autoFocus type="password" inputMode="numeric" value={password} onChange={event => { setPassword(event.target.value); setAuthError('') }} aria-label="비밀번호" /><p className="form-error" role="alert">{authError}</p><div className="dialog-actions"><button type="button" className="button button--outline" onClick={() => setModal(null)}>취소</button><button className="button" type="submit">입장</button></div></form>}
      {modal === 'song' && <div className="song-form"><p className="muted">곡 제목과 전체 가사를 붙여넣으세요. 분할 후 바로 슬라이드 카드에서 고칠 수 있습니다.</p><label>곡 제목<input autoFocus value={songTitle} onChange={event => setSongTitle(event.target.value)} placeholder="곡 제목" /></label>{duplicate && <div className="duplicate-note">비슷한 찬양이 있습니다: <strong>{duplicate.title}</strong><button onClick={() => { setModal('picker'); setQuery(duplicate.title) }}>기존 찬양 보기</button></div>}<label>전체 가사<textarea value={songLyrics} onChange={event => setSongLyrics(event.target.value)} placeholder={'가사를 통째로 붙여넣으세요\n\n빈 줄은 절의 경계로 인식합니다.'} rows={12} /></label><div className="dialog-actions"><button className="button button--outline" onClick={() => setModal(null)}>취소</button><button className="button" onClick={addSong}>자동으로 슬라이드 나누기</button></div></div>}
      {modal === 'picker' && <><div className="search-row"><input autoFocus type="search" placeholder="찬양 제목 검색" value={query} onChange={event => setQuery(event.target.value)} aria-label="찬양 제목 검색" /><span>{filteredSongs.length}곡</span></div><div className="picker-list">{filteredSongs.length ? filteredSongs.map(entry => <div className="picker-row" key={entry.id}><div><strong>{entry.title}</strong><small>{entry.slides.length}장 · 버전 {entry.version}</small></div><div className="button-row"><button className="button button--small" onClick={() => addExisting(entry, 'use')}>그대로 사용</button><button className="button button--small button--outline" onClick={() => addExisting(entry, 'copy')}>이번 주만 수정</button><button className="button button--small button--quiet" onClick={() => addExisting(entry, 'original')}>원본도 수정</button></div></div>) : <p className="empty-list">보관함에 찬양이 없습니다.</p>}</div></>}
      {modal === 'overview' && <><p className="muted">{week?.date} {week?.name} · {currentSlides.length}장</p><div className="overview-grid">{currentSlides.map((slide, index) => <div key={slide.id} className="overview-card"><SlideCanvas text={slide.text} settings={data.settings} /><span>{String(index + 1).padStart(2, '0')} · {slide.title}</span></div>)}</div><div className="dialog-actions"><button className="button button--outline" onClick={() => { if (week) downloadText(JSON.stringify(week, null, 2), `${week.date}.json`) }}>주간 JSON</button><button className="button button--outline" onClick={previewPresentation}>예배 화면</button><button className="button" onClick={() => void doExport()}>PPTX 다운로드</button></div></>}
    </div></div>}
    {notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice('')} aria-label="알림 닫기">×</button></div>}
    {error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => setError('')}>닫기</button></div>}
  </>
}
