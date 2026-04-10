import type { CSSProperties } from 'react'

const cards = [
  {
    title: '最近在整理',
    text: '把想做的内容先留成清晰的框架。',
  },
  {
    title: '最近在记录',
    text: '把零散的念头慢慢写成可以回看的东西。',
  },
  {
    title: '最近在等待',
    text: '给未来的功能预留足够克制的空间。',
  },
]

export function StackedCards() {
  return (
    <div className="stacked-cards" aria-label="我还在内容占位">
      {cards.map((card, index) => (
        <article
          key={card.title}
          className="status-card"
          style={{ '--card-index': index } as CSSProperties}
        >
          <p>{card.title}</p>
          <span>{card.text}</span>
        </article>
      ))}
    </div>
  )
}
