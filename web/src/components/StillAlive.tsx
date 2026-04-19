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
  const velocityRef = useRef<number>(0)

  useEffect(() => {
    setMemoStack(memos)
  }, [memos])

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (exitCardId) return
    e.currentTarget.setPointerCapture(e.pointerId)
    swipeStartXRef.current = e.clientX
    swipeStartYRef.current = e.clientY
    pointerDownTimeRef.current = Date.now()
    lastTimeRef.current = pointerDownTimeRef.current
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
    if (dt > 0) {
      velocityRef.current = (e.clientY - (swipeStartYRef.current + dragY)) / dt
    }
    lastTimeRef.current = now
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
      setExitCardId(topMemo.id)
      
      setTimeout(() => {
        setMemoStack(prev => {
          const next = [...prev]
          const first = next.shift()!
          next.push(first)
          return next
        })
        setExitCardId(null)
        setDragY(0)
        velocityRef.current = 0
        onInteractionChange?.(false)
      }, 500)
    } else {
      if (distance < TAP_MAX_DISTANCE && duration < TAP_MAX_DURATION) onOpenMemo(memoStack[0].id)
      setDragY(0)
    }
    swipeStartXRef.current = null
    swipeStartYRef.current = null
  }

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    onOpenMemo(memoStack[0].id)
  }

  return (
    <section className="status-section" aria-labelledby="stillalive-title">
      <div className="section-heading-compact" style={{ 
        opacity: isDragging ? 0.3 : 1, 
        filter: isDragging ? 'blur(2px)' : 'none',
        transition: 'all 0.4s ease'
      }}>
        <div className="presence-indicator">
          <div className="live-dot" />
          <h2 id="stillalive-title" className="typewriter">{SECTION_TITLE}</h2>
        </div>
        <span className="status-hint">
          {dragY < THRESHOLD ? '松手进入下一则' : '继续上滑浏览'}
        </span>
      </div>
      
      <div
        className="stacked-cards ios-style apple-momentum"
        ref={ref}
        role="button"
        tabIndex={0}
        aria-label="打开最新记录"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          setIsDragging(false)
          onInteractionChange?.(false)
          setDragY(0)
          swipeStartXRef.current = null
          swipeStartYRef.current = null
        }}
        onKeyDown={handleKeyDown}
      >
        {memoStack.map((memo, index) => {
          const isExiting = memo.id === exitCardId
          const isTop = index === 0 && !isExiting
          const slotIndex = exitCardId && !isExiting ? index - 1 : index
          
          const isHandingOff = isDragging && dragY < THRESHOLD
          const handoffScale = (isHandingOff && slotIndex === 0 && !isTop) ? 1.012 : 1

          const shadowBlur = isTop ? Math.max(30, 30 + Math.abs(dragY) * 0.08) : 14
          const shadowOpacity = isTop ? Math.max(0.04, 0.07 - Math.abs(dragY) * 0.00018) : 0.028
          const textParallax = isTop ? dragY * 0.018 : 0

          const ty = slotIndex * 10
          const tz = slotIndex * -10
          const sc = 1 - slotIndex * 0.022
          const bl = slotIndex * 0.22

          const style: CSSProperties = {
            zIndex: 100 - index,
            '--ty': `${ty}px`,
            '--tz': `${tz}px`,
            '--sc': sc,
            '--bl': `${bl}px`,
            
            animation: `card-entrance 0.8s cubic-bezier(0.22, 1, 0.36, 1) ${0.4 + index * 0.1}s backwards`,
            
            transform: isTop 
              ? `translate3d(0, ${dragY}px, 0) scale(${Math.max(0.985, 1 - Math.abs(dragY) * 0.00012)})`
              : isExiting 
                ? `translate3d(0, -188px, 54px) scale(1.02)`
                : `translate3d(0, ${ty}px, ${tz}px) scale(${sc})`,
            
            opacity: isExiting ? 0 : slotIndex >= 3 ? 0 : 1 - slotIndex * 0.24,
            filter: `blur(${bl}px)`,
            boxShadow: `0 ${shadowBlur}px ${shadowBlur * 2}px rgba(0,0,0,${shadowOpacity})`,
            
            transition: (isTop && isDragging) 
              ? 'none' 
              : `transform 600ms cubic-bezier(0.23, 1, 0.32, 1), 
                 opacity 500ms ease-out, 
                 filter 500ms ease,
                 box-shadow 500ms ease`,
            
            scale: handoffScale,
            pointerEvents: index === 0 ? 'auto' : 'none'
          } as any

          return (
            <article key={memo.id} className={`ios-card ${memo.images.length === 0 ? 'has-no-image' : ''}`} style={style}>
              <div className="ios-card-content" style={{ transform: `translate3d(0, ${textParallax}px, 0)` }}>
                <div className="ios-card-text-area">
                  <p className="ios-card-time">{memo.location} // {memo.time}</p>
                  <p className="ios-card-text">{memo.text}</p>
                </div>
                {memo.images.length > 0 && (
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
