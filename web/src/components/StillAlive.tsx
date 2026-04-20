import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { ContentImage } from './ContentImage'
import { type StillAliveCard } from '../lib/constants'

const SECTION_TITLE = '正在录入 / LIVE'
const THRESHOLD = -80
const TAP_MAX_DISTANCE = 8
const TAP_MAX_DURATION = 280

interface StillAliveProps {
  memos: StillAliveCard[]
  onOpenMemo: (id: string) => void
  onInteractionChange?: (isInteracting: boolean) => void
}

export const StillAlive = forwardRef<HTMLDivElement, StillAliveProps>(function StillAlive(
  { memos, onOpenMemo, onInteractionChange },
  ref
) {
  const [memoStack, setMemoStack] = useState(memos)
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [exitCardId, setExitCardId] = useState<string | null>(null)
  
  const swipeStartYRef = useRef<number | null>(null)
  const swipeStartXRef = useRef<number | null>(null)
  const pointerDownTimeRef = useRef<number>(0)
  const lastTimeRef = useRef<number>(0)
  const lastPointerYRef = useRef<number | null>(null)
  const velocityRef = useRef<number>(0)
  const pendingAdvanceRef = useRef(false)

  useEffect(() => {
    setMemoStack(memos)
  }, [memos])

  const finishAdvance = () => {
    if (!pendingAdvanceRef.current || !exitCardId) return

    pendingAdvanceRef.current = false
    setMemoStack((prev) => {
      const next = [...prev]
      const first = next.shift()
      if (first) next.push(first)
      return next
    })
    setExitCardId(null)
    setDragY(0)
    velocityRef.current = 0
    lastPointerYRef.current = null
    onInteractionChange?.(false)
  }

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (exitCardId) return
    e.currentTarget.setPointerCapture(e.pointerId)
    swipeStartXRef.current = e.clientX
    swipeStartYRef.current = e.clientY
    lastPointerYRef.current = e.clientY
    pointerDownTimeRef.current = Date.now()
    lastTimeRef.current = pointerDownTimeRef.current
    velocityRef.current = 0
    setIsDragging(true)
    onInteractionChange?.(true)
  }

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!isDragging || swipeStartYRef.current === null) return
    const deltaY = e.clientY - swipeStartYRef.current
    
    // Nonlinear resistance keeps the drag controlled without feeling rigid.
    const currentDrag = deltaY > 0 ? Math.pow(deltaY, 0.65) : deltaY * 0.8
    setDragY(currentDrag)

    const now = Date.now()
    const dt = now - lastTimeRef.current
    const lastPointerY = lastPointerYRef.current
    if (dt > 0 && lastPointerY !== null) {
      velocityRef.current = (e.clientY - lastPointerY) / dt
    }
    lastTimeRef.current = now
    lastPointerYRef.current = e.clientY
  }

  const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!isDragging) return
    setIsDragging(false)
    onInteractionChange?.(false)
    e.currentTarget.releasePointerCapture(e.pointerId)
    
    const deltaX = e.clientX - (swipeStartXRef.current || 0)
    const deltaY = e.clientY - (swipeStartYRef.current || 0)
    const distance = Math.hypot(deltaX, deltaY)
    const duration = Date.now() - pointerDownTimeRef.current
    
    if (dragY < THRESHOLD || velocityRef.current < -1.5) {
      const topMemo = memoStack[0]
      pendingAdvanceRef.current = true
      setExitCardId(topMemo.id)
    } else {
      if (distance < TAP_MAX_DISTANCE && duration < TAP_MAX_DURATION) onOpenMemo(memoStack[0].id)
      setDragY(0)
      velocityRef.current = 0
    }
    swipeStartXRef.current = null
    swipeStartYRef.current = null
    lastPointerYRef.current = null
  }

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    onOpenMemo(memoStack[0].id)
  }

  const thresholdProgress = Math.min(Math.max((-dragY / Math.abs(THRESHOLD)) || 0, 0), 1.18)
  const approachProgress = Math.min(thresholdProgress, 1)
  const isNearAdvance = approachProgress >= 0.72 && approachProgress < 1
  const isReadyToAdvance = thresholdProgress >= 1

  return (
    <section className="status-section" aria-labelledby="stillalive-title">
      <div className={`section-heading-compact ${isNearAdvance ? 'is-near-advance' : ''} ${isReadyToAdvance ? 'is-ready-advance' : ''}`}>
        <div className="presence-indicator">
          <div className="live-dot" />
          <h2 id="stillalive-title" className="typewriter">{SECTION_TITLE}</h2>
        </div>
        <span className="status-hint" aria-live="polite">
          {isReadyToAdvance
            ? '松手进入下一则'
            : isNearAdvance
              ? '即将进入下一则'
              : '继续上滑浏览'}
        </span>
      </div>
      
      <div
        className="stacked-cards ios-style"
        ref={ref}
        role="button"
        tabIndex={0}
        aria-label="打开最新记录"
        aria-describedby="stillalive-gesture-hint"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          setIsDragging(false)
          onInteractionChange?.(false)
          setDragY(0)
          pendingAdvanceRef.current = false
          setExitCardId(null)
          velocityRef.current = 0
          swipeStartXRef.current = null
          swipeStartYRef.current = null
          lastPointerYRef.current = null
        }}
        onKeyDown={handleKeyDown}
      >
        <span id="stillalive-gesture-hint" className="visually-hidden">
          点击打开当前记录，向上滑动浏览下一则。
        </span>
        {memoStack.map((memo, index) => {
          const isExiting = memo.id === exitCardId
          const isTop = index === 0 && !isExiting
          const slotIndex = exitCardId && !isExiting ? index - 1 : index
          
          const topProgress = isTop ? approachProgress : 0
          const incomingProgress = !isTop && slotIndex === 0 ? approachProgress : 0

          const shadowBlur = isTop ? Math.max(28, 28 + Math.abs(dragY) * 0.04) : slotIndex === 0 ? 24 : 14
          const shadowOpacity = isTop ? Math.max(0.05, 0.075 - Math.abs(dragY) * 0.00012) : slotIndex === 0 ? 0.042 : 0.026
          const textParallax = isTop ? dragY * 0.014 - topProgress * 4 : 0

          const ty = slotIndex * 12 - incomingProgress * 12
          const sc = 1 - slotIndex * 0.018 + incomingProgress * 0.012
          const bl = slotIndex === 0 ? 0 : slotIndex === 1 ? 0.18 : 0.4
          const showExcerpt = slotIndex <= 1
          const showThumbnail = memo.images.length > 0 && slotIndex <= 1
          const showMeta = slotIndex <= 2

          const style: CSSProperties = {
            zIndex: 100 - index,
            '--ty': `${ty}px`,
            '--sc': sc,
            '--bl': `${bl}px`,
            
            transform: isTop 
              ? `translate3d(0, ${dragY}px, 0) scale(${Math.max(0.985, 1 - Math.abs(dragY) * 0.0001 - topProgress * 0.008)})`
              : isExiting 
                ? `translate3d(0, -168px, 0) scale(1.008)`
                : `translate3d(0, ${ty}px, 0) scale(${sc})`,
            
            opacity: isExiting ? 0 : slotIndex >= 3 ? 0 : 1 - slotIndex * 0.22 + incomingProgress * 0.06,
            filter: `blur(${bl}px)`,
            boxShadow: `0 ${shadowBlur}px ${shadowBlur * 2}px rgba(0,0,0,${shadowOpacity})`,
            
            transition: (isTop && isDragging) 
              ? 'none' 
              : `transform 600ms cubic-bezier(0.23, 1, 0.32, 1), 
                 opacity 500ms ease-out, 
                 filter 500ms ease,
                 box-shadow 500ms ease`,
            
            pointerEvents: index === 0 ? 'auto' : 'none',
            animation: `card-entrance 0.8s cubic-bezier(0.22, 1, 0.36, 1) ${0.4 + index * 0.1}s backwards`
          } as any

          return (
            <article
              key={memo.id}
              className={`ios-card ${memo.images.length === 0 ? 'has-no-image' : ''}`}
              style={style}
              onTransitionEnd={(event) => {
                if (
                  isExiting &&
                  event.target === event.currentTarget &&
                  event.propertyName === 'opacity'
                ) {
                  finishAdvance()
                }
              }}
            >
              <div
                className={`ios-card-content ${slotIndex > 0 ? 'is-secondary' : ''}`}
                style={{
                  transform: `translate3d(0, ${textParallax}px, 0)`,
                  opacity: isTop ? 1 - topProgress * 0.08 : 1,
                }}
              >
                <div className="ios-card-text-area">
                  {showMeta && (
                    <p className="ios-card-time">
                      <span className="ios-card-category">{memo.category}</span>
                      <span className="ios-card-time-separator">{memo.location} // {memo.time}</span>
                    </p>
                  )}
                  {showExcerpt && <p className="ios-card-text">{memo.text}</p>}
                </div>
                {showThumbnail && (
                  <div className="ios-card-thumbnail">
                    <ContentImage image={memo.images[0]} />
                    {memo.images.length > 1 && <div className="photo-count-badge">+{memo.images.length - 1}</div>}
                  </div>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
})
