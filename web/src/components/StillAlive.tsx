import { StackedCards } from './StackedCards'

export function StillAlive() {
  return (
    <section className="status-section">
      <div className="section-heading">
        <p className="section-kicker">我还在</p>
        <h2>一些还没来得及整理，但确实正在发生的片段。</h2>
      </div>
      <StackedCards />
    </section>
  )
}
