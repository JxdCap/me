import {
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'

export type StillAliveCard = {
  id: string
  time: string
  location: string
  text: string
  images: string[]
}

export const cards: StillAliveCard[] = [
  {
    id: 'stillalive-1',
    time: '24H内',
    location: '杭州',
    text: '最近还没来得及整理成完整段落，但这些零碎现场已经足够说明，我这阵子一直在路上。',
    images: [
      '/images/stillalive-1-a.svg',
      '/images/stillalive-1-b.svg',
      '/images/stillalive-1-c.svg',
    ],
  },
  {
    id: 'stillalive-2',
    time: '12天前',
    location: '上海',
    text: '把最近路上的几个小片段收在一起，像给这段时间留一个轻一点的记号。',
    images: ['/images/stillalive-2-a.svg', '/images/stillalive-2-b.svg'],
  },
  {
    id: 'stillalive-3',
    time: '2026.04.10',
    location: '武汉',
    text: '有些东西先不急着讲完整，先让它们留在这里，等以后回头再慢慢辨认。',
    images: ['/images/stillalive-3-a.svg'],
  },
  {
    id: 'stillalive-4',
    time: '2026.03.15',
    location: '苏州',
    text: '一些过去的痕迹，埋在深处。一切都在变，但我还在。',
    images: [],
  },
]

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

          // DYNAMIC SHADOW & PARALLAX CALCULATIONS
          const shadowBlur = isTop ? Math.max(40, 40 + Math.abs(dragY) * 0.2) : 20
          const shadowOpacity = isTop ? Math.min(0.08, 0.08 - Math.abs(dragY) * 0.0002) : 0.04
          const textParallax = isTop ? dragY * 0.05 : 0

          const style: CSSProperties = {
            zIndex: 100 - index,
            transform: isTop 
              ? `translate3d(0, ${dragY}px, 0) scale(1) rotate(${dragY * 0.015}deg)`
              : isExiting 
                ? `translate3d(0, -250px, 100px) scale(1.1) rotateX(15deg) rotate(-8deg)`
                : `translate3d(0, ${slotIndex * 14}px, ${-slotIndex * 25}px) scale(${1 - slotIndex * 0.045}) rotateX(${slotIndex * -2}deg)`,
            
            opacity: isExiting ? 0 : slotIndex >= 3 ? 0 : 1 - slotIndex * 0.18,
            filter: `blur(${slotIndex * 0.5}px)`,
            boxShadow: `0 ${shadowBlur}px ${shadowBlur * 2}px rgba(0,0,0,${shadowOpacity})`,
            
            transition: (isTop && isDragging) 
              ? 'none' 
              : `transform 600ms cubic-bezier(0.23, 1, 0.32, 1), 
                 opacity 500ms ease-out, 
                 filter 500ms ease,
                 box-shadow 500ms ease`,
            
            scale: bloomScale,
            pointerEvents: index === 0 ? 'auto' : 'none'
          }

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
