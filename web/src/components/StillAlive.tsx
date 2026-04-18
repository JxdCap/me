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
  const containerRef = useRef<HTMLDivElement>(null)

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (exitCardId) return
    e.currentTarget.setPointerCapture(e.pointerId)
    swipeStartYRef.current = e.clientY
    setIsDragging(true)
  }

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!isDragging || swipeStartYRef.current === null) return
    const deltaY = e.clientY - swipeStartYRef.current
    if (deltaY < 0) {
      setDragY(deltaY * 0.8)
    }
  }

  const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!isDragging) return
    setIsDragging(false)
    e.currentTarget.releasePointerCapture(e.pointerId)
    
    const deltaY = e.clientY - (swipeStartYRef.current || 0)
    
    if (dragY < -60) {
      // TRIGGER EXIT
      const topCard = cardsArray[0]
      setExitCardId(topCard.id)
      
      // The crucial part: The rest of the cards shift immediately in the state logic
      // But visually they will transition smoothly via CSS
      setTimeout(() => {
        setCardsArray(prev => {
          const next = [...prev]
          const first = next.shift()!
          next.push(first)
          return next
        })
        setExitCardId(null)
        setDragY(0)
      }, 400) // Match CSS transition duration
    } else {
      if (Math.abs(deltaY) < 5) onOpenMemo(cardsArray[0].id)
      setDragY(0)
    }
    swipeStartYRef.current = null
  }

  return (
    <section className="status-section" aria-labelledby="stillalive-title">
      <div className="section-heading-compact">
        <div className="presence-indicator">
          <div className="live-dot" />
          <h2 id="stillalive-title" className="typewriter">{SECTION_TITLE}</h2>
        </div>
        <span className="status-hint">上滑回溯. REWIND</span>
      </div>
      
      <div
        ref={containerRef}
        className="stacked-cards ios-style"
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
          
          // Determine visual slot
          // If a card is exiting, slots shift for everyone else immediately
          const slotIndex = exitCardId && !isExiting ? index - 1 : index
          
          const style: CSSProperties = {
            zIndex: 100 - index,
            // Use 3D transforms for iOS performance
            // We use standard slot positions, but top card follows the finger
            transform: isTop 
              ? `translate3d(0, ${dragY}px, 0) scale(1) rotate(${dragY * 0.02}deg)`
              : isExiting 
                ? `translate3d(0, -160px, 0) scale(1.05) rotate(-5deg)`
                : `translate3d(0, ${slotIndex * 14}px, ${-slotIndex * 20}px) scale(${1 - slotIndex * 0.04})`,
            
            opacity: isExiting 
              ? 0 
              : slotIndex >= 3 ? 0 : 1 - slotIndex * 0.15,
            
            // Interaction dynamics: No transition when dragging top card
            transition: (isTop && isDragging) 
              ? 'none' 
              : 'transform 500ms cubic-bezier(0.23, 1, 0.32, 1), opacity 400ms ease-out',
            
            pointerEvents: index === 0 ? 'auto' : 'none'
          }

          return (
            <article key={card.id} className="ios-card" style={style}>
              <div className="ios-card-content">
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
