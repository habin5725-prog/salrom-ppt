import { useEffect, useRef, useState } from 'react'
import type { Settings } from '../types'
import { fitSlideText } from '../lib/fit'

interface Props {
  text: string
  settings: Settings
  className?: string
  label?: string
}

export default function SlideCanvas({ text, settings, className = '', label }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(960)
  useEffect(() => {
    if (!ref.current) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])
  const fit = fitSlideText(text, settings)
  const fontSize = fit.fontSize * width / 960
  const margin = Math.max(0.02, Math.min(0.3, settings.safeMargin))
  return (
    <div ref={ref} className={`slide-canvas ${className}`} aria-label={label ?? '슬라이드 미리보기'}>
      <div className="slide-canvas__text" style={{
        fontSize: `${fontSize}px`,
        padding: `${width * 9 / 16 * margin}px ${width * margin}px`,
      }}>{text || '\u00a0'}</div>
    </div>
  )
}
