import type { CSSProperties } from 'react'

const cards = [
  {
    id: 'stillalive-1',
    time: '一天前',
    text: '最近还没来得及整理成完整段落，但这些零碎现场已经足够说明，我这阵子一直在路上。',
    location: '杭州',
    images: ['/images/stillalive-1.jpg'],
  },
  {
    id: 'stillalive-2',
    time: '12 天前',
    text: '把最近路上的几个小片段收在一起，像给这段时间留一个轻一点的记号。',
    location: '上海',
    images: ['/images/stillalive-2.jpg'],
  },
  {
    id: 'stillalive-3',
    time: '2026.04.10',
    text: '有些东西先不急着讲完整，先让它们留在这里，等以后回头再慢慢辨认。',
    location: '苏州',
    images: ['/images/stillalive-3.jpg'],
  },
]

export function StillAlive() {
  return (
    <section className="status-section">
      <div className="section-heading">
        <p className="section-kicker">我还在</p>
        <h2>一些还没来得及整理，但确实正在发生的片段。</h2>
      </div>
      <div className="stacked-cards" aria-label="我还在状态记录">
        {cards.map((card, index) => (
          <article
            key={card.id}
            className={`status-card ${index === 0 ? 'status-card-main' : 'status-card-layer'}`}
            style={{ '--card-index': index } as CSSProperties}
            aria-hidden={index === 0 ? undefined : 'true'}
          >
            <p className="status-card-time">{card.time}</p>
            <p className="status-card-text">{card.text}</p>
            {card.location ? <p className="status-card-location">{card.location}</p> : null}
          </article>
        ))}
      </div>
    </section>
  )
}
