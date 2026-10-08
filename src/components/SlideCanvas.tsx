import { useEffect, useRef, useState } from 'react'
import type { Settings } from '../types'
import { fitSlideText } from '../lib/fit'
import { cssFontFamily, ensureFontLoaded } from '../lib/fonts'

interface Props {
  text: string
  settings: Settings
  className?: string
  label?: string
}

export default function SlideCanvas({ text, settings, className = '', label }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(960)
  const [, setFontRevision] = useState(0)
  useEffect(() => {
    if (!ref.current) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    let active = true
    const remeasure = () => {
      if (active) setFontRevision(revision => revision + 1)
    }
    void ensureFontLoaded(settings.fontFamily).then(remeasure).catch(remeasure)
    if (document.fonts) {
      void document.fonts.ready.then(remeasure)
      document.fonts.addEventListener('loadingdone', remeasure)
    }
    return () => {
      active = false
      document.fonts?.removeEventListener('loadingdone', remeasure)
    }
  }, [settings.fontFamily])
  const fit = fitSlideText(text, settings)
  const fontSize = fit.fontSize * width / 960
  const margin = Math.max(0.02, Math.min(0.3, settings.safeMargin))
  return (
    <div ref={ref} className={`slide-canvas ${className}`} aria-label={label ?? '슬라이드 미리보기'}>
      <div className="slide-canvas__text" style={{
        fontFamily: cssFontFamily(settings.fontFamily),
        fontSize: `${fontSize}px`,
        padding: `${width * 9 / 16 * margin}px ${width * margin}px`,
      }}>{text || '\u00a0'}</div>
    </div>
  )
}
