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

const SECTION_TITLE = '我还在！'
const MAX_VISIBLE_CARDS = 3

const cards: StillAliveCard[] = [
  {
    id: 'stillalive-1',
    time: '一天前',
    text: '最近还没来得及整理成完整段落，但这些零碎现场已经足够说明，我这阵子一直在路上。',
    image: '/images/stillalive-1-a.svg',
  },
  {
    id: 'stillalive-2',
    time: '12 天前',
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

export function StillAlive() {
  const [cardsArray, setCardsArray] = useState(cards)
  const [swiping, setSwiping] = useState(false)
  const swipeStartYRef = useRef<number | null>(null)

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    swipeStartYRef.current = e.clientY
  }

  const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (swipeStartYRef.current === null) return
    const deltaY = e.clientY - swipeStartYRef.current
    if (deltaY < -36) {
      setSwiping(true)
      setTimeout(() => {
        setCardsArray((prev) => {
          const next = [...prev]
          const first = next.shift()!
          next.push(first)
          return next
        })
        setSwiping(false)
      }, 300)
    }
    swipeStartYRef.current = null
  }

  return (
    <section className="status-section" aria-labelledby="stillalive-title">
      <div className="section-heading-compact">
        <h2 id="stillalive-title">{SECTION_TITLE}</h2>
        <span className="status-hint">↑ 向上滑动翻看</span>
      </div>
      <div
        className="stacked-cards ios-style"
        role="list"
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          swipeStartYRef.current = null
        }}
      >
        {cardsArray.slice(0, MAX_VISIBLE_CARDS).map((card, index) => {
          const isTopCard = index === 0
          return (
            <article
              key={card.id}
              className={`ios-card ${isTopCard && swiping ? 'swiping-up' : ''}`}
              data-card-index={index}
              style={{ '--card-index': index } as CSSProperties}
            >
              <div className="ios-card-content">
                <div className="ios-card-text-area">
                  <p className="ios-card-time">{card.time}</p>
                  <p className="ios-card-text">{card.text}</p>
                </div>
                {card.image && (
                  <div className="ios-card-thumbnail">
                    <img src={card.image} alt="" loading="lazy" />
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
