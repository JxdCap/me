import { useState } from 'react'

const SKILLS = [
  { id: 'design', label: '做界面', content: '追求像素级完美的 UI 设计与动效，用克制的手法传达高级感。' },
  { id: 'code', label: '前端', content: '熟练使用 React 及其生态，让设计不仅停留在画板，而是完美落地为可交互的产品。' },
  { id: 'write', label: '写字', content: '时不时记录一些随想和总结，把路上的风景变成属于自己的文字。' },
]

export function Hero() {
  const [activeSkill, setActiveSkill] = useState<string | null>(null)

  return (
    <section className="hero">
      <div className="hero-compact-header">
        <div className="hero-avatar-placeholder" />
        <div className="hero-copy">
          <h1>我把做过的界面、写下的话，慢慢放回这里。</h1>
        </div>
      </div>

      <div className="hero-skills">
        <div className="skill-tags">
          {SKILLS.map((skill) => (
            <button
              key={skill.id}
              className={`skill-tag ${activeSkill === skill.id ? 'active' : ''}`}
              onClick={() => setActiveSkill(activeSkill === skill.id ? null : skill.id)}
            >
              {skill.label}
            </button>
          ))}
        </div>
        <div className={`skill-content-container ${activeSkill ? 'expanded' : ''}`}>
          <div className="skill-content-inner">
            <p>{activeSkill ? SKILLS.find((s) => s.id === activeSkill)?.content : ''}</p>
          </div>
        </div>
      </div>
    </section>
  )
}
