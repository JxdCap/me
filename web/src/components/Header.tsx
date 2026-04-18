import { useEffect, useState } from 'react'
import {
  Menu,
  X,
  ArrowUpRight,
} from 'lucide-react'

const menuItems = [
  { label: '首页', path: '/' },
  { label: '关于', path: '/about' },
  { label: '作品', path: '/works' },
  { label: '随笔', path: '/notes' },
]

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Close menu on ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMenuOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <>
      <header className="topbar">
        <div className="topbar-identity">
          <div className="identity-dot" />
          <span>ME</span>
        </div>
        
        <button
          className={`simple-menu-trigger ${isMenuOpen ? 'is-active' : ''}`}
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          aria-label={isMenuOpen ? "关闭" : "菜单"}
        >
          <span className="trigger-text">{isMenuOpen ? '关闭' : '菜单'}</span>
          <div className="trigger-icon-wrap">
            {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </div>
        </button>
      </header>

      <div className={`index-overlay ${isMenuOpen ? 'is-open' : ''}`}>
        <div className="index-content">
          <nav className="index-nav">
            {menuItems.map((item, index) => (
              <a 
                key={item.label} 
                href={item.path} 
                className="index-link"
                style={{ '--index': index } as React.CSSProperties}
                onClick={() => setIsMenuOpen(false)}
              >
                <span className="link-number">0{index + 1}</span>
                <span className="link-label">{item.label}</span>
                <ArrowUpRight className="link-arrow" size={28} strokeWidth={1.2} />
              </a>
            ))}
          </nav>
          
          <div className="index-footer">
            <div className="footer-item">
              <span className="footer-label">当前时间 / LOCAL TIME</span>
              <span className="footer-value">
                {time.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
            <div className="footer-item">
              <span className="footer-label">系统状态 / STATUS</span>
              <span className="footer-value">正常运行 / COLLECTIVE MEMORY</span>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
