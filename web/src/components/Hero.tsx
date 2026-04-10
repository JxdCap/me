const keywords = ['写字', '记录', '设计', '前端', '留白']

export function Hero() {
  return (
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
  )
}
