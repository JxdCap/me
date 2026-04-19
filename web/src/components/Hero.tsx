import userLogo from '../assets/user-logo.png'

const SKILLS = [
  { id: 'design', label: '做界面', content: '追求像素级完美的 UI 设计与动效，用克制的手法传达高级感。' },
  { id: 'code', label: '前端', content: '熟练使用 React 及其生态，让设计不仅停留在画板，而是完美落地为可交互的产品。' },
  { id: 'write', label: '写字', content: '时不时记录一些随想和总结，把路上的风景变成属于自己的文字。' },
]

interface HeroProps {
  activeSkillId: string | null
  setActiveSkillId: (id: string | null) => void
}

export function Hero({ activeSkillId, setActiveSkillId }: HeroProps) {
  return (
    <section className="hero">
      <div className="hero-avatar-placeholder">
        <img src={userLogo} alt="ME" />
      </div>
      <div className="hero-copy">
        <h1>我把做过的界面、写下的话，慢慢放回这里。</h1>
      </div>

      <div className="hero-skills">
        <div className={`skill-tags ${activeSkillId ? 'has-active' : ''}`}>
          {SKILLS.map((skill) => (
            <button
              key={skill.id}
              className={`skill-tag ${activeSkillId === skill.id ? 'active' : ''}`}
              onClick={() => setActiveSkillId(activeSkillId === skill.id ? null : skill.id)}
              aria-pressed={activeSkillId === skill.id}
            >
              {skill.label}
            </button>
          ))}
        </div>
        <div className={`skill-content-container ${activeSkillId ? 'expanded' : ''}`}>
          <div className="skill-content-inner">
            <p>{activeSkillId ? SKILLS.find((s) => s.id === activeSkillId)?.content : ''}</p>
          </div>
        </div>
      </div>
    </section>
  )
}
