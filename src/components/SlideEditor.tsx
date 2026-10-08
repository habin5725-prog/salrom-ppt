import { useEffect, useRef, useState } from 'react'
import type { DragEvent, KeyboardEvent, MouseEvent as ReactMouseEvent } from 'react'
import type { Slide } from '../types'
import './SlideEditor.css'

export interface SlideEditorProps {
  slides: Slide[]
  onChange: (slides: Slide[]) => void
  maxLines: number
  selectedId?: string
  onSelect?: (id: string) => void
}

type Snapshot = { slides: Slide[]; selectedIds: string[]; activeId?: string }
type DropPosition = { id: string; side: 'before' | 'after' } | null

const SECTION_SUGGESTIONS = ['Verse', 'Pre-Chorus', 'Chorus', 'Bridge', 'Ending', 'Intro', 'Outro']
const RECOMMENDED_LINE_LENGTH = 27
const HISTORY_LIMIT = 100
const TYPING_WINDOW_MS = 800

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `slide-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function sameSlides(a: Slide[], b: Slide[]): boolean {
  return a === b || (a.length === b.length && a.every((slide, index) =>
    slide.id === b[index].id && slide.text === b[index].text && slide.section === b[index].section))
}

function linesOf(text: string): string[] {
  return text.replace(/\r\n?/g, '\n').split('\n')
}

function longLineCount(text: string): number {
  return linesOf(text).filter((line) => Array.from(line).length > RECOMMENDED_LINE_LENGTH).length
}

function wrapLine(line: string): string[] {
  const result: string[] = []
  let remaining = line.trim()

  while (Array.from(remaining).length > RECOMMENDED_LINE_LENGTH) {
    const characters = Array.from(remaining)
    const first = characters.slice(0, RECOMMENDED_LINE_LENGTH).join('')
    const lastSpace = first.lastIndexOf(' ')
    const splitAt = lastSpace > Math.floor(RECOMMENDED_LINE_LENGTH * 0.55)
      ? lastSpace
      : RECOMMENDED_LINE_LENGTH
    result.push(characters.slice(0, splitAt).join('').trimEnd())
    remaining = characters.slice(splitAt).join('').trimStart()
  }

  result.push(remaining)
  return result
}

function autoSplit(text: string, maxLines: number): string[] {
  const wrapped = linesOf(text).flatMap(wrapLine)
  const chunks: string[] = []
  for (let index = 0; index < wrapped.length; index += maxLines) {
    chunks.push(wrapped.slice(index, index + maxLines).join('\n'))
  }
  return chunks.length ? chunks : ['']
}

export function SlideEditor({ slides, onChange, maxLines, selectedId, onSelect }: SlideEditorProps) {
  const limit = Math.max(1, Math.floor(Number.isFinite(maxLines) ? maxLines : 4))
  const initialId = selectedId && slides.some((slide) => slide.id === selectedId)
    ? selectedId
    : slides[0]?.id
  const [selectedIds, setSelectedIds] = useState<string[]>(initialId ? [initialId] : [])
  const [, setActiveId] = useState<string | undefined>(initialId)
  const [dropPosition, setDropPosition] = useState<DropPosition>(null)
  const [, refreshHistory] = useState(0)

  const slidesRef = useRef(slides)
  const selectionRef = useRef(selectedIds)
  const activeRef = useRef(initialId)
  const anchorRef = useRef<string | undefined>(initialId)
  const historyRef = useRef<{ past: Snapshot[]; future: Snapshot[] }>({ past: [], future: [] })
  const typingRef = useRef<{ id: string; at: number } | null>(null)
  const draggedIdsRef = useRef<string[]>([])
  const textareasRef = useRef(new Map<string, HTMLTextAreaElement>())
  const cardsRef = useRef(new Map<string, HTMLDivElement>())

  const setSelection = (ids: string[], primary?: string, notify = true) => {
    const valid = Array.from(new Set(ids)).filter((id) => slidesRef.current.some((slide) => slide.id === id))
    const nextActive = primary && valid.includes(primary) ? primary : valid[0]
    selectionRef.current = valid
    activeRef.current = nextActive
    setSelectedIds(valid)
    setActiveId(nextActive)
    if (notify && nextActive) onSelect?.(nextActive)
  }

  const focusText = (id: string, caret?: number) => {
    requestAnimationFrame(() => {
      const element = textareasRef.current.get(id)
      element?.focus()
      if (element && caret !== undefined) element.setSelectionRange(caret, caret)
    })
  }

  const snapshot = (): Snapshot => ({
    slides: slidesRef.current,
    selectedIds: [...selectionRef.current],
    activeId: activeRef.current,
  })

  const commit = (
    next: Slide[],
    options: { typingId?: string; selection?: string[]; primary?: string; focus?: { id: string; caret?: number } } = {},
  ) => {
    if (sameSlides(slidesRef.current, next)) return
    const now = Date.now()
    const coalesce = options.typingId && typingRef.current?.id === options.typingId
      && now - typingRef.current.at < TYPING_WINDOW_MS

    if (!coalesce) {
      historyRef.current.past.push(snapshot())
      if (historyRef.current.past.length > HISTORY_LIMIT) historyRef.current.past.shift()
    }
    historyRef.current.future = []
    typingRef.current = options.typingId ? { id: options.typingId, at: now } : null
    slidesRef.current = next
    if (options.selection) setSelection(options.selection, options.primary)
    else setSelection(selectionRef.current, activeRef.current, false)
    onChange(next)
    refreshHistory((value) => value + 1)
    if (options.focus) focusText(options.focus.id, options.focus.caret)
  }

  const undo = () => {
    const previous = historyRef.current.past.pop()
    if (!previous) return
    historyRef.current.future.push(snapshot())
    typingRef.current = null
    slidesRef.current = previous.slides
    setSelection(previous.selectedIds, previous.activeId)
    onChange(previous.slides)
    refreshHistory((value) => value + 1)
  }

  const redo = () => {
    const next = historyRef.current.future.pop()
    if (!next) return
    historyRef.current.past.push(snapshot())
    typingRef.current = null
    slidesRef.current = next.slides
    setSelection(next.selectedIds, next.activeId)
    onChange(next.slides)
    refreshHistory((value) => value + 1)
  }

  useEffect(() => {
    if (!sameSlides(slides, slidesRef.current)) {
      slidesRef.current = slides
      historyRef.current = { past: [], future: [] }
      typingRef.current = null
      refreshHistory((value) => value + 1)
      const valid = selectionRef.current.filter((id) => slides.some((slide) => slide.id === id))
      const fallback = valid.length ? valid : (slides[0] ? [slides[0].id] : [])
      setSelection(fallback, activeRef.current, false)
    }
  }, [slides])

  useEffect(() => {
    if (selectedId && selectedId !== activeRef.current && slidesRef.current.some((slide) => slide.id === selectedId)) {
      anchorRef.current = selectedId
      setSelection([selectedId], selectedId, false)
    }
  }, [selectedId])

  const chooseCard = (id: string, event?: Pick<ReactMouseEvent, 'shiftKey' | 'metaKey' | 'ctrlKey'>) => {
    typingRef.current = null
    if (event?.shiftKey && anchorRef.current) {
      const start = slidesRef.current.findIndex((slide) => slide.id === anchorRef.current)
      const end = slidesRef.current.findIndex((slide) => slide.id === id)
      if (start >= 0 && end >= 0) {
        setSelection(slidesRef.current.slice(Math.min(start, end), Math.max(start, end) + 1).map((slide) => slide.id), id)
        return
      }
    }
    if (event?.metaKey || event?.ctrlKey) {
      const next = selectionRef.current.includes(id)
        ? selectionRef.current.filter((value) => value !== id)
        : [...selectionRef.current, id]
      anchorRef.current = id
      setSelection(next, next.includes(id) ? id : next[0])
      return
    }
    anchorRef.current = id
    setSelection([id], id)
  }

  const addSlide = (afterIndex: number) => {
    const source = slidesRef.current[afterIndex]
    const created: Slide = { id: newId(), text: '', section: source?.section }
    const next = [...slidesRef.current]
    next.splice(afterIndex + 1, 0, created)
    commit(next, { selection: [created.id], primary: created.id, focus: { id: created.id, caret: 0 } })
    anchorRef.current = created.id
  }

  const splitAtCursor = (slideId: string, element: HTMLTextAreaElement) => {
    const index = slidesRef.current.findIndex((slide) => slide.id === slideId)
    if (index < 0) return
    const slide = slidesRef.current[index]
    const before = slide.text.slice(0, element.selectionStart)
    const after = slide.text.slice(element.selectionStart)
    const created: Slide = { id: newId(), text: after, section: slide.section }
    const next = [...slidesRef.current]
    next.splice(index, 1, { ...slide, text: before }, created)
    commit(next, { selection: [created.id], primary: created.id, focus: { id: created.id, caret: 0 } })
    anchorRef.current = created.id
  }

  const cloneSlides = (ids: string[]) => {
    const idSet = new Set(ids)
    const createdIds: string[] = []
    const next = slidesRef.current.flatMap((slide) => {
      if (!idSet.has(slide.id)) return [slide]
      const copy = { ...slide, id: newId() }
      createdIds.push(copy.id)
      return [slide, copy]
    })
    if (!createdIds.length) return
    commit(next, { selection: createdIds, primary: createdIds[0], focus: { id: createdIds[0] } })
    anchorRef.current = createdIds[0]
  }

  const deleteSlides = (ids: string[]) => {
    const idSet = new Set(ids)
    const count = slidesRef.current.filter((slide) => idSet.has(slide.id)).length
    if (!count) return
    const message = count === 1
      ? '선택한 슬라이드를 삭제할까요? 이 작업은 실행 취소할 수 있습니다.'
      : `선택한 슬라이드 ${count}개를 삭제할까요? 이 작업은 실행 취소할 수 있습니다.`
    if (!window.confirm(message)) return
    const firstIndex = slidesRef.current.findIndex((slide) => idSet.has(slide.id))
    const next = slidesRef.current.filter((slide) => !idSet.has(slide.id))
    const fallback = next[Math.min(firstIndex, next.length - 1)]?.id
    commit(next, { selection: fallback ? [fallback] : [], primary: fallback })
    anchorRef.current = fallback
  }

  const mergeWithNext = (id: string) => {
    const index = slidesRef.current.findIndex((slide) => slide.id === id)
    if (index < 0 || index === slidesRef.current.length - 1) return
    const current = slidesRef.current[index]
    const following = slidesRef.current[index + 1]
    const separator = current.text && following.text ? '\n' : ''
    const merged = { ...current, text: current.text + separator + following.text }
    const next = [...slidesRef.current]
    next.splice(index, 2, merged)
    commit(next, { selection: [id], primary: id, focus: { id, caret: merged.text.length } })
  }

  const splitAutomatically = (id: string) => {
    const index = slidesRef.current.findIndex((slide) => slide.id === id)
    if (index < 0) return
    const slide = slidesRef.current[index]
    const chunks = autoSplit(slide.text, limit)
    if (chunks.length === 1 && chunks[0] === slide.text) return
    const replacements = chunks.map((text, chunkIndex) => ({
      ...slide,
      id: chunkIndex ? newId() : slide.id,
      text,
    }))
    const next = [...slidesRef.current]
    next.splice(index, 1, ...replacements)
    commit(next, { selection: replacements.map((part) => part.id), primary: replacements[0].id })
  }

  const transferLine = (id: string, direction: 'previous' | 'next') => {
    const index = slidesRef.current.findIndex((slide) => slide.id === id)
    const neighborIndex = direction === 'previous' ? index - 1 : index + 1
    if (index < 0 || neighborIndex < 0 || neighborIndex >= slidesRef.current.length) return
    const source = slidesRef.current[index]
    const lines = linesOf(source.text)
    if (lines.length <= 1) return
    const moved = direction === 'previous' ? lines.shift()! : lines.pop()!
    const neighbor = slidesRef.current[neighborIndex]
    const neighborText = direction === 'previous'
      ? (neighbor.text ? `${neighbor.text}\n${moved}` : moved)
      : (neighbor.text ? `${moved}\n${neighbor.text}` : moved)
    const next = [...slidesRef.current]
    next[index] = { ...source, text: lines.join('\n') }
    next[neighborIndex] = { ...neighbor, text: neighborText }
    commit(next, { selection: [neighbor.id], primary: neighbor.id, focus: { id: neighbor.id } })
  }

  const handleEditorKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const key = event.key.toLowerCase()
    const command = event.ctrlKey || event.metaKey
    const target = event.target as HTMLElement
    const editing = target.matches('textarea, input, select, [contenteditable="true"]')

    if (command && key === 'z') {
      event.preventDefault()
      if (event.shiftKey) redo()
      else undo()
      return
    }
    if (command && key === 'y') {
      event.preventDefault()
      redo()
      return
    }
    if (command && key === 'd') {
      event.preventDefault()
      cloneSlides(selectionRef.current.length ? selectionRef.current : activeRef.current ? [activeRef.current] : [])
      return
    }
    if (!editing && command && key === 'a') {
      event.preventDefault()
      setSelection(slidesRef.current.map((slide) => slide.id), activeRef.current)
      return
    }
    if (!editing && (event.key === 'Delete' || event.key === 'Backspace')) {
      event.preventDefault()
      deleteSlides(selectionRef.current)
      return
    }
    if (!editing && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault()
      const index = slidesRef.current.findIndex((slide) => slide.id === activeRef.current)
      const next = slidesRef.current[index + (event.key === 'ArrowUp' ? -1 : 1)]
      if (next) {
        chooseCard(next.id, event)
        cardsRef.current.get(next.id)?.focus()
      }
    }
  }

  const handleDragStart = (event: DragEvent<HTMLElement>, id: string) => {
    draggedIdsRef.current = selectionRef.current.includes(id) ? selectionRef.current : [id]
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', id)
  }

  const handleDragOver = (event: DragEvent<HTMLDivElement>, id: string) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    const rect = event.currentTarget.getBoundingClientRect()
    setDropPosition({ id, side: event.clientY < rect.top + rect.height / 2 ? 'before' : 'after' })
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>, targetId: string) => {
    event.preventDefault()
    const movingIds = draggedIdsRef.current
    const rect = event.currentTarget.getBoundingClientRect()
    const side = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
    setDropPosition(null)
    draggedIdsRef.current = []
    if (!movingIds.length || movingIds.includes(targetId)) return
    const movingSet = new Set(movingIds)
    const moving = slidesRef.current.filter((slide) => movingSet.has(slide.id))
    const remaining = slidesRef.current.filter((slide) => !movingSet.has(slide.id))
    const targetIndex = remaining.findIndex((slide) => slide.id === targetId)
    if (targetIndex < 0) return
    remaining.splice(targetIndex + (side === 'after' ? 1 : 0), 0, ...moving)
    commit(remaining, { selection: moving.map((slide) => slide.id), primary: moving[0]?.id })
  }

  const selectedCount = selectedIds.length
  const hasWarnings = slides.some((slide) => linesOf(slide.text).length > limit || longLineCount(slide.text) > 0)

  return (
    <section className="se-editor" aria-label="슬라이드 편집기" onKeyDown={handleEditorKeyDown}>
      <div className="se-toolbar">
        <div className="se-toolbar-heading">
          <div className="se-title-row">
            <h2>슬라이드 편집</h2>
            <span className="se-count">{slides.length}장</span>
          </div>
        </div>
        <div className="se-toolbar-actions">
          <button type="button" className="se-btn se-btn-quiet" onClick={undo} disabled={!historyRef.current.past.length} title="실행 취소 (Ctrl+Z)">↶ <span>실행 취소</span></button>
          <button type="button" className="se-btn se-btn-quiet" onClick={redo} disabled={!historyRef.current.future.length} title="다시 실행 (Ctrl+Shift+Z)">↷ <span>다시 실행</span></button>
          <button type="button" className="se-btn se-btn-primary" onClick={() => addSlide(slides.length - 1)}>＋ 슬라이드 추가</button>
        </div>
      </div>

      <div className="se-status-row">
        <span className="se-status"><span className="se-status-dot" /> 최대 {limit}줄 · 줄당 권장 {RECOMMENDED_LINE_LENGTH}자</span>
        {hasWarnings && <span className="se-status-warning">긴 줄 또는 줄 수 초과 항목이 있습니다</span>}
      </div>

      {selectedCount > 1 && (
        <div className="se-bulk-bar" role="group" aria-label="선택한 슬라이드 작업">
          <strong>{selectedCount}장 선택됨</strong>
          <button type="button" onClick={() => cloneSlides(selectedIds)}>선택 복제</button>
          <button type="button" className="se-danger-text" onClick={() => deleteSlides(selectedIds)}>선택 삭제</button>
          <button type="button" onClick={() => setSelection([], undefined, false)}>선택 해제</button>
        </div>
      )}

      {slides.length === 0 ? (
        <div className="se-empty">
          <div className="se-empty-icon">＋</div>
          <h3>첫 슬라이드를 만들어 보세요</h3>
          <p>가사를 입력하면 이곳에서 바로 장면을 확인할 수 있습니다.</p>
          <button type="button" className="se-btn se-btn-primary" onClick={() => addSlide(-1)}>슬라이드 추가</button>
        </div>
      ) : (
        <div className="se-list">
          {slides.map((slide, index) => {
            const lineCount = linesOf(slide.text).length
            const longLines = longLineCount(slide.text)
            const tooManyLines = lineCount > limit
            const warning = tooManyLines || longLines > 0
            const selected = selectedIds.includes(slide.id)
            return (
              <div className="se-list-item" key={slide.id}>
                <div
                  ref={(element) => { if (element) cardsRef.current.set(slide.id, element); else cardsRef.current.delete(slide.id) }}
                  className={`se-card${selected ? ' is-selected' : ''}${dropPosition?.id === slide.id ? ` drop-${dropPosition.side}` : ''}`}
                  tabIndex={0}
                  onClick={(event) => {
                    if ((event.target as HTMLElement).closest('button, input, textarea, select')) return
                    chooseCard(slide.id, event)
                  }}
                  onDragOver={(event) => handleDragOver(event, slide.id)}
                  onDrop={(event) => handleDrop(event, slide.id)}
                  onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropPosition(null) }}
                  aria-label={`${index + 1}번 슬라이드${selected ? ', 선택됨' : ''}`}
                >
                  <div className="se-card-head">
                    <div className="se-card-identity">
                      <input
                        type="checkbox"
                        className="se-checkbox"
                        checked={selected}
                        aria-label={`${index + 1}번 슬라이드 선택`}
                        onChange={(event) => chooseCard(slide.id, { shiftKey: Boolean((event.nativeEvent as MouseEvent).shiftKey), metaKey: true, ctrlKey: true })}
                      />
                      <span className="se-slide-number">{String(index + 1).padStart(2, '0')}</span>
                      <span className="se-head-divider" />
                      <input
                        className="se-section-input"
                        value={slide.section ?? ''}
                        placeholder="구간 이름"
                        list="se-section-options"
                        aria-label={`${index + 1}번 슬라이드 구간 이름`}
                        onFocus={() => chooseCard(slide.id)}
                        onChange={(event) => {
                          const next = [...slidesRef.current]
                          next[index] = { ...next[index], section: event.target.value || undefined }
                          commit(next, { typingId: `${slide.id}:section` })
                        }}
                      />
                    </div>
                    <div className="se-card-head-actions">
                      <span className={`se-line-badge${warning ? ' is-warning' : ''}`}>{lineCount}/{limit}줄</span>
                      <button
                        type="button"
                        className="se-drag-handle"
                        draggable
                        onDragStart={(event) => handleDragStart(event, slide.id)}
                        onDragEnd={() => { draggedIdsRef.current = []; setDropPosition(null) }}
                        aria-label={`${index + 1}번 슬라이드 순서 이동`}
                        title="끌어서 순서 변경"
                      >⋮⋮</button>
                    </div>
                  </div>

                  <div className="se-card-body">
                    <div className="se-text-area-wrap">
                      <label className="se-field-label" htmlFor={`se-text-${slide.id}`}>가사</label>
                      <textarea
                        id={`se-text-${slide.id}`}
                        ref={(element) => { if (element) textareasRef.current.set(slide.id, element); else textareasRef.current.delete(slide.id) }}
                        className="se-textarea"
                        value={slide.text}
                        rows={Math.max(3, Math.min(5, lineCount))}
                        placeholder="이 슬라이드에 표시할 가사를 입력하세요"
                        spellCheck={false}
                        onFocus={() => chooseCard(slide.id)}
                        onChange={(event) => {
                          const next = [...slidesRef.current]
                          next[index] = { ...next[index], text: event.target.value }
                          commit(next, { typingId: `${slide.id}:text` })
                        }}
                        onKeyDown={(event) => {
                          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                            event.preventDefault()
                            splitAtCursor(slide.id, event.currentTarget)
                          }
                        }}
                      />
                      <div className="se-field-footer">
                        <span>Enter 줄바꿈 · Ctrl+Enter 커서에서 분할</span>
                        <span>{slide.text.length}자</span>
                      </div>
                    </div>
                  </div>

                  {warning && (
                    <div className="se-warning" role="status">
                      <span className="se-warning-icon">!</span>
                      <span>{tooManyLines ? `권장 줄 수를 ${lineCount - limit}줄 초과했습니다.` : ''}{tooManyLines && longLines ? ' ' : ''}{longLines ? `긴 줄 ${longLines}개가 있습니다.` : ''}</span>
                      <button type="button" onClick={() => splitAutomatically(slide.id)}>자동 정리</button>
                    </div>
                  )}

                  <div className="se-card-actions">
                    <button type="button" onClick={() => addSlide(index)} title="이 슬라이드 다음에 추가">＋ 다음 장</button>
                    <button type="button" onClick={() => cloneSlides([slide.id])} title="이 슬라이드 복제 (Ctrl+D)">⧉ 복제</button>
                    <button type="button" onClick={() => mergeWithNext(slide.id)} disabled={index === slides.length - 1} title="다음 슬라이드와 합치기">⇥ 다음 장과 합치기</button>
                    <span className="se-actions-spacer" />
                    <button type="button" className="se-line-transfer" onClick={() => transferLine(slide.id, 'previous')} disabled={index === 0 || lineCount <= 1} title="첫 줄을 앞 슬라이드로 이동">↑ 첫 줄</button>
                    <button type="button" className="se-line-transfer" onClick={() => transferLine(slide.id, 'next')} disabled={index === slides.length - 1 || lineCount <= 1} title="마지막 줄을 다음 슬라이드로 이동">↓ 끝 줄</button>
                    <button type="button" className="se-delete" onClick={() => deleteSlides([slide.id])} title="슬라이드 삭제">삭제</button>
                  </div>
                </div>
                {index < slides.length - 1 && (
                  <div className="se-insert-row">
                    <span />
                    <button type="button" onClick={() => addSlide(index)} aria-label={`${index + 1}번과 ${index + 2}번 슬라이드 사이에 추가`} title="슬라이드 사이에 추가">＋</button>
                    <span />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      <datalist id="se-section-options">{SECTION_SUGGESTIONS.map((section) => <option key={section} value={section} />)}</datalist>
      {!!slides.length && <p className="se-shortcuts">팁: 슬라이드를 끌어 순서를 바꾸고, Shift 또는 Ctrl을 눌러 여러 장을 선택할 수 있습니다. Ctrl+Z 실행 취소 · Ctrl+D 복제</p>}
    </section>
  )
}

export default SlideEditor
