import {
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { cards } from '../lib/constants'

const SECTION_TITLE = '正在录入 / LIVE'
const THRESHOLD = -80

function ProgressiveImage({ images }: { images: string[] }) {
  const [isLoaded, setIsLoaded] = useState(false)
  const hasMultiple = images.length > 1
  const firstImage = images[0]
  if (!firstImage) return null

  return (
    <div className={`progressive-image-wrap ${isLoaded ? 'is-loaded' : ''}`}>
      <img
        src={firstImage}
        alt=""
        loading="lazy"
        onLoad={() => setIsLoaded(true)}
        className="main-img"
      />
      {!isLoaded && <div className="img-placeholder" />}
      {hasMultiple && <div className="photo-count-badge">+{images.length - 1}</div>}
    </div>
  )
}

interface StillAliveProps {
  onOpenMemo: (id: string) => void
}

export function StillAlive({ onOpenMemo }: StillAliveProps) {
  const [cardsArray, setCardsArray] = useState(cards)
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [exitCardId, setExitCardId] = useState<string | null>(null)
  
  const swipeStartYRef = useRef<number | null>(null)
  const lastTimeRef = useRef<number>(0)
  const velocityRef = useRef<number>(0)

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (exitCardId) return
    e.currentTarget.setPointerCapture(e.pointerId)
    swipeStartYRef.current = e.clientY
    lastTimeRef.current = Date.now()
    setIsDragging(true)
  }

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!isDragging || swipeStartYRef.current === null) return
    const deltaY = e.clientY - swipeStartYRef.current
    
    // Apple Tension Logic
    const currentDrag = deltaY > 0 ? Math.pow(deltaY, 0.65) : deltaY * 0.8
    setDragY(currentDrag)

    // Calculate Velocity
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
    e.currentTarget.releasePointerCapture(e.pointerId)
    
    const deltaY = e.clientY - (swipeStartYRef.current || 0)
    
    // Velocity-aware Exit
    if (dragY < THRESHOLD || velocityRef.current < -1.5) {
      const topCard = cardsArray[0]
      setExitCardId(topCard.id)
      
      setTimeout(() => {
        setCardsArray(prev => {
          const next = [...prev]
          const first = next.shift()!
          next.push(first)
          return next
        })
        setExitCardId(null)
        setDragY(0)
        velocityRef.current = 0
      }, 500)
    } else {
      if (Math.abs(deltaY) < 5) onOpenMemo(cardsArray[0].id)
      setDragY(0)
    }
    swipeStartYRef.current = null
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
          {dragY < THRESHOLD ? '可以放手了' : '上滑回溯. REWIND'}
        </span>
      </div>
      
      <div
        className="stacked-cards ios-style apple-momentum"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          setIsDragging(false)
          setDragY(0)
        }}
      >
        {cardsArray.map((card, index) => {
          const isExiting = card.id === exitCardId
          const isTop = index === 0 && !isExiting
          const slotIndex = exitCardId && !isExiting ? index - 1 : index
          
          const isCapturing = isDragging && dragY < THRESHOLD
          const bloomScale = (isCapturing && slotIndex === 0 && !isTop) ? 1.02 : 1

          const shadowBlur = isTop ? Math.max(34, 34 + Math.abs(dragY) * 0.12) : 18
          const shadowOpacity = isTop ? Math.max(0.04, 0.08 - Math.abs(dragY) * 0.0002) : 0.04
          const textParallax = isTop ? dragY * 0.025 : 0

          const ty = slotIndex * 12
          const tz = slotIndex * -18
          const sc = 1 - slotIndex * 0.035
          const bl = slotIndex * 0.35

          const style: CSSProperties = {
            zIndex: 100 - index,
            '--ty': `${ty}px`,
            '--tz': `${tz}px`,
            '--sc': sc,
            '--bl': `${bl}px`,
            
            animation: `card-entrance 0.8s cubic-bezier(0.22, 1, 0.36, 1) ${0.4 + index * 0.1}s backwards`,
            
            transform: isTop 
              ? `translate3d(0, ${dragY}px, 0) scale(1)`
              : isExiting 
                ? `translate3d(0, -210px, 80px) scale(1.04)`
                : `translate3d(0, ${ty}px, ${tz}px) scale(${sc})`,
            
            opacity: isExiting ? 0 : slotIndex >= 3 ? 0 : 1 - slotIndex * 0.18,
            filter: `blur(${bl}px)`,
            boxShadow: `0 ${shadowBlur}px ${shadowBlur * 2}px rgba(0,0,0,${shadowOpacity})`,
            
            transition: (isTop && isDragging) 
              ? 'none' 
              : `transform 600ms cubic-bezier(0.23, 1, 0.32, 1), 
                 opacity 500ms ease-out, 
                 filter 500ms ease,
                 box-shadow 500ms ease`,
            
            scale: bloomScale,
            pointerEvents: index === 0 ? 'auto' : 'none'
          } as any

          return (
            <article key={card.id} className="ios-card" style={style}>
              <div className="ios-card-content" style={{ transform: `translate3d(0, ${textParallax}px, 0)` }}>
                <div className="ios-card-text-area">
                  <p className="ios-card-time">{card.location} // {card.time}</p>
                  <p className="ios-card-text">{card.text}</p>
                </div>
                {card.images.length > 0 && (
                  <div className="ios-card-thumbnail">
                    <ProgressiveImage images={card.images} />
                  </div>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
