import {
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'

type StillAliveCard = {
  id: string
  time: string
  text: string
  image?: string
}

const SECTION_TITLE = '正在录入 / LIVE'
const MAX_VISIBLE_CARDS = 3

const cards: StillAliveCard[] = [
  {
    id: 'stillalive-1',
    time: '24H内',
    text: '最近还没来得及整理成完整段落，但这些零碎现场已经足够说明，我这阵子一直在路上。',
    image: '/images/stillalive-1-a.svg',
  },
  {
    id: 'stillalive-2',
    time: '12天前',
    text: '把最近路上的几个小片段收在一起，像给这段时间留一个轻一点的记号。',
    image: '/images/stillalive-2-a.svg',
  },
  {
    id: 'stillalive-3',
    time: '2026.04.10',
    text: '有些东西先不急着讲完整，先让它们留在这里，等以后回头再慢慢辨认。',
    image: '/images/stillalive-3-a.svg',
  },
  {
    id: 'stillalive-4',
    time: '2026.03.15',
    text: '一些过去的痕迹，埋在深处。',
  },
]

function ProgressiveImage({ src, alt }: { src: string; alt: string }) {
  const [isLoaded, setIsLoaded] = useState(false)
  return (
    <div className={`progressive-image-wrap ${isLoaded ? 'is-loaded' : ''}`}>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={() => setIsLoaded(true)}
        className="main-img"
      />
      {!isLoaded && <div className="img-placeholder" />}
    </div>
  )
}

export function StillAlive() {
  const [cardsArray, setCardsArray] = useState(cards)
  const [dragY, setDragY] = useState(0)
  const [isSwipingOut, setIsSwipingOut] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const swipeStartYRef = useRef<number | null>(null)

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (isSwipingOut) return
    swipeStartYRef.current = e.clientY
    setIsDragging(true)
    setDragY(0)
  }

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!isDragging || swipeStartYRef.current === null) return
    
    const deltaY = e.clientY - swipeStartYRef.current
    if (deltaY < 0) {
      setDragY(deltaY * 0.85)
    } else {
      setDragY(0)
    }
  }

  const handlePointerUp = () => {
    if (!isDragging) return
    setIsDragging(false)
    
    const threshold = -60
    if (dragY < threshold) {
      setIsSwipingOut(true)
      setTimeout(() => {
        setCardsArray((prev) => {
          const next = [...prev]
          const first = next.shift()!
          next.push(first)
          return next
        })
        setIsSwipingOut(false)
        setDragY(0)
      }, 400)
    } else {
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
        className="stacked-cards ios-style"
        role="list"
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onPointerCancel={() => {
          setIsDragging(false)
          setDragY(0)
          swipeStartYRef.current = null
        }}
      >
        {cardsArray.slice(0, MAX_VISIBLE_CARDS).map((card, index) => {
          const isTopCard = index === 0
          
          const dragStyle: CSSProperties = isTopCard ? {
            transform: `translateY(calc(var(--card-index) * 14px + ${dragY}px)) scale(calc(1 - var(--card-index) * 0.04)) rotate(${dragY * 0.02}deg)`,
            // Spring transition when NOT dragging
            transition: !isDragging ? 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.4s ease' : 'none',
            opacity: isSwipingOut ? 0 : undefined,
          } : {}

          return (
            <article
              key={card.id}
              className={`ios-card ${isTopCard && isSwipingOut ? 'swiping-out' : ''}`}
              data-card-index={index}
              style={{ 
                '--card-index': index,
                ...dragStyle
              } as CSSProperties}
            >
              <div className="ios-card-content">
                <div className="ios-card-text-area">
                  <p className="ios-card-time">记录 // {card.time}</p>
                  <p className="ios-card-text">{card.text}</p>
                </div>
                {card.image && (
                  <div className="ios-card-thumbnail">
                    <ProgressiveImage src={card.image} alt="" />
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
