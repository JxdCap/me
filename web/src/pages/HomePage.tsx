import { FrostButton } from '../components/FrostButton'
import { StackedCards } from '../components/StackedCards'
import '../styles/home.css'

const keywords = ['写字', '记录', '设计', '前端', '留白']

export function HomePage() {
  return (
    <main className="page-shell">
      <header className="topbar">
        <FrostButton label="菜单" ariaLabel="打开菜单" />
        <FrostButton label="登录" ariaLabel="登录入口" />
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="hero-kicker">留一点空，给真实的自己。</p>
          <h1>这里先放一个安静的入口，慢慢长成我的个人主页。</h1>
          <p className="hero-description">
            当前阶段只保留最基础的静态结构，不急着把一切填满。
          </p>
          <ul className="keyword-list" aria-label="技能关键词">
            {keywords.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="avatar-block" aria-hidden="true">
          <div className="avatar-ring">
            <div className="avatar-core">头像</div>
          </div>
        </div>
      </section>

      <section className="status-section">
        <div className="section-heading">
          <p className="section-kicker">我还在</p>
          <h2>一些还没来得及整理，但确实正在发生的片段。</h2>
        </div>
        <StackedCards />
      </section>
    </main>
  )
}
