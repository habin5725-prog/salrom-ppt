import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { MouseEvent, PointerEvent, TouchEvent } from 'react'
import { fitSlideText, marginFraction } from '../lib/fit'
import { cssFontFamily, ensureFontLoaded } from '../lib/fonts'
import type { Settings, Slide } from '../types'
import './Presentation.css'

interface PresentationProps {
  slides: Slide[]
  settings: Settings
  onClose: () => void
}

interface FittedText {
  fontPx: number
  scale: number
}

const CONTROL_IDLE_MS = 2400
const SWIPE_MIN_PX = 60

/** A self-contained, in-memory deck. Changing a week while projecting cannot change these slides. */
export default function Presentation({ slides, settings, onClose }: PresentationProps) {
  const [deck] = useState<Slide[]>(() =>
    slides.map((slide) => ({ ...slide, text: slide.text.replace(/\r\n?/g, '\n') })),
  )
  const [index, setIndex] = useState(0)
  const [controlsVisible, setControlsVisible] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [fullscreenError, setFullscreenError] = useState('')
  const [fittedText, setFittedText] = useState<FittedText>({ fontPx: 56, scale: 1 })
  const rootRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const idleTimerRef = useRef<number | null>(null)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const ignoreClickUntilRef = useRef(0)
  const closingRef = useRef(false)

  const currentSlide = deck[index]
  const currentText = currentSlide?.text ?? ''
  const isTitleSlide = Boolean(currentSlide && 'kind' in currentSlide && currentSlide.kind === 'title')

  const previous = useCallback(() => setIndex((current) => Math.max(0, current - 1)), [])
  const next = useCallback(
    () => setIndex((current) => Math.max(0, Math.min(deck.length - 1, current + 1))),
    [deck.length],
  )

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current !== null) {
      window.clearTimeout(idleTimerRef.current)
      idleTimerRef.current = null
    }
  }, [])

  const wakeControls = useCallback(() => {
    setControlsVisible(true)
    clearIdleTimer()
    idleTimerRef.current = window.setTimeout(() => {
      setControlsVisible(false)
      idleTimerRef.current = null
    }, CONTROL_IDLE_MS)
  }, [clearIdleTimer])

  const close = useCallback(async () => {
    if (closingRef.current) return
    closingRef.current = true
    if (document.fullscreenElement === rootRef.current) {
      try {
        await document.exitFullscreen()
      } catch {
        // Closing the presentation still works if the browser already left fullscreen.
      }
    }
    onClose()
  }, [onClose])

  const toggleFullscreen = useCallback(async () => {
    const root = rootRef.current
    if (!root) return
    setFullscreenError('')
    try {
      if (document.fullscreenElement === root) {
        await document.exitFullscreen()
      } else if (root.requestFullscreen) {
        await root.requestFullscreen()
      } else {
        setFullscreenError('이 브라우저는 전체화면을 지원하지 않습니다.')
      }
    } catch {
      setFullscreenError('전체화면을 열 수 없습니다. 브라우저 설정을 확인해 주세요.')
      wakeControls()
    }
  }, [wakeControls])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    rootRef.current?.focus({ preventScroll: true })
    return () => {
      document.body.style.overflow = previousOverflow
      clearIdleTimer()
      if (document.fullscreenElement === rootRef.current) {
        void document.exitFullscreen().catch(() => undefined)
      }
    }
  }, [clearIdleTimer])

  useEffect(() => {
    const handleFullscreenChange = () => {
      const active = document.fullscreenElement === rootRef.current
      setIsFullscreen(active)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return
      const target = event.target
      const interactive = target instanceof Element && Boolean(target.closest('button, input, textarea, select, [contenteditable="true"]'))

      switch (event.key) {
        case 'ArrowRight':
        case 'PageDown':
          event.preventDefault()
          next()
          break
        case 'ArrowLeft':
        case 'PageUp':
          event.preventDefault()
          previous()
          break
        case ' ':
        case 'Spacebar':
          if (interactive) return
          event.preventDefault()
          next()
          break
        case 'Home':
          event.preventDefault()
          setIndex(0)
          break
        case 'End':
          event.preventDefault()
          setIndex(Math.max(0, deck.length - 1))
          break
        case 'f':
        case 'F':
          if (interactive) return
          event.preventDefault()
          void toggleFullscreen()
          break
        case 'Escape':
          event.preventDefault()
          if (event.repeat) return
          if (document.fullscreenElement === rootRef.current) {
            // Explicit exit also works in browsers that do not leave fullscreen automatically.
            void document.exitFullscreen().catch(() => {
              setFullscreenError('전체화면을 종료할 수 없습니다. 화면의 전체화면 버튼을 사용해 주세요.')
              wakeControls()
            })
            return
          }
          void close()
          break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [close, deck.length, next, previous, toggleFullscreen, wakeControls])

  useLayoutEffect(() => {
    const root = rootRef.current
    const text = textRef.current
    if (!root || !text || deck.length === 0) return

    let frame = 0
    let active = true
    const fit = () => {
      if (!active) return
      const width = root.clientWidth
      const height = root.clientHeight
      if (!width || !height) return

      const margin = marginFraction(settings.safeMargin)
      const availableWidth = width * (1 - 2 * margin)
      const availableHeight = height * (1 - 2 * margin)
      // The PPTX uses a 960 × 540 pt slide; this keeps text proportions identical.
      const viewportScale = Math.min(width / 960, height / 540)
      const pptFit = fitSlideText(currentText, settings, isTitleSlide ? 700 : 400)
      const preferredPx = Math.max(1, pptFit.fontSize * viewportScale)
      const minimumPx = Math.max(1, Math.min(preferredPx, settings.minFontSize * viewportScale))

      text.style.transform = 'none'
      const measure = (fontPx: number) => {
        text.style.fontSize = `${fontPx}px`
        const rect = text.getBoundingClientRect()
        return { width: rect.width, height: rect.height }
      }
      const fits = (fontPx: number) => {
        const size = measure(fontPx)
        return size.width <= availableWidth + 0.5 && size.height <= availableHeight + 0.5
      }

      let fontPx = preferredPx
      if (!fits(fontPx)) {
        if (fits(minimumPx)) {
          let low = minimumPx
          let high = preferredPx
          for (let step = 0; step < 12; step += 1) {
            const middle = (low + high) / 2
            if (fits(middle)) low = middle
            else high = middle
          }
          fontPx = low
        } else {
          fontPx = minimumPx
        }
      }

      const finalSize = measure(fontPx)
      // Preserve all text if a maker deliberately kept a slide beyond the configured minimum.
      const emergencyScale = Math.min(
        1,
        finalSize.width > 0 ? availableWidth / finalSize.width : 1,
        finalSize.height > 0 ? availableHeight / finalSize.height : 1,
      )
      const result = { fontPx, scale: Math.max(0.01, emergencyScale) }
      text.style.transform = `scale(${result.scale})`
      setFittedText(result)
    }
    const scheduleFit = () => {
      if (!active) return
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(fit)
    }

    fit()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleFit)
    observer?.observe(root)
    window.addEventListener('resize', scheduleFit)
    void ensureFontLoaded(settings.fontFamily).then(scheduleFit).catch(scheduleFit)
    if (document.fonts) {
      void document.fonts.ready.then(scheduleFit).catch(() => undefined)
      document.fonts.addEventListener('loadingdone', scheduleFit)
    }
    return () => {
      active = false
      observer?.disconnect()
      window.removeEventListener('resize', scheduleFit)
      document.fonts?.removeEventListener('loadingdone', scheduleFit)
      window.cancelAnimationFrame(frame)
    }
  }, [currentText, deck.length, isTitleSlide, settings])

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' || event.pointerType === 'pen') wakeControls()
  }

  const handleStageClick = (event: MouseEvent<HTMLDivElement>) => {
    if (Date.now() < ignoreClickUntilRef.current) return
    if (event.target instanceof Element && event.target.closest('.presentation__controls')) return
    if (settings.clickToAdvance) next()
    else wakeControls()
  }

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 1) return
    if (event.target instanceof Element && event.target.closest('.presentation__controls')) return
    touchStartRef.current = { x: event.touches[0].clientX, y: event.touches[0].clientY }
    wakeControls()
  }

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current
    touchStartRef.current = null
    if (!start || event.changedTouches.length !== 1) return
    const dx = event.changedTouches[0].clientX - start.x
    const dy = event.changedTouches[0].clientY - start.y
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.25) return
    ignoreClickUntilRef.current = Date.now() + 500
    if (dx < 0) next()
    else previous()
  }

  return (
    <div
      ref={rootRef}
      className={`presentation ${controlsVisible ? 'presentation--awake' : 'presentation--idle'}`}
      role="application"
      aria-label="예배 송출 화면. 방향키로 이동, F로 전체화면 전환, Escape로 종료"
      tabIndex={-1}
      onPointerMove={handlePointerMove}
      onClick={handleStageClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={() => { touchStartRef.current = null }}
    >
      {deck.length > 0 ? (
        <div className="presentation__slide" aria-live="polite" aria-atomic="true">
          <div className="presentation__text-position">
            <div
              ref={textRef}
              className="presentation__text"
              style={{
                fontFamily: cssFontFamily(settings.fontFamily),
                fontSize: `${fittedText.fontPx}px`,
                fontWeight: isTitleSlide ? 700 : 400,
                transform: `scale(${fittedText.scale})`,
              }}
            >
              {currentText}
            </div>
          </div>
        </div>
      ) : (
        <div className="presentation__empty">송출할 슬라이드가 없습니다.</div>
      )}

      {settings.showCounter && deck.length > 0 && (
        <div className="presentation__counter" aria-label={`슬라이드 ${index + 1} / ${deck.length}`}>
          {index + 1} / {deck.length}
        </div>
      )}

      <div className="presentation__controls" role="toolbar" aria-label="송출 조작" onClick={(event) => event.stopPropagation()}>
        <button type="button" onClick={previous} disabled={index <= 0} title="이전 슬라이드 (←)">
          이전
        </button>
        <span className="presentation__controls-count" aria-live="off">
          {deck.length > 0 ? `${index + 1} / ${deck.length}` : '0 / 0'}
        </span>
        <button type="button" onClick={next} disabled={index >= deck.length - 1} title="다음 슬라이드 (→ 또는 Space)">
          다음
        </button>
        <span className="presentation__controls-divider" aria-hidden="true" />
        <button type="button" onClick={() => void toggleFullscreen()} title="전체화면 전환">
          {isFullscreen ? '전체화면 종료' : '전체화면'}
        </button>
        <button type="button" onClick={() => void close()} title="송출 화면 닫기">
          송출 종료
        </button>
        {fullscreenError && <span className="presentation__error" role="status">{fullscreenError}</span>}
      </div>
    </div>
  )
}
