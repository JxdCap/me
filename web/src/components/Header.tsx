import { useEffect, useState } from 'react'
import {
  Menu,
  X,
  ArrowUpRight,
  Sun,
  Moon,
  User
} from 'lucide-react'

const menuItems = [
  { label: '首页', path: '/' },
  { label: '关于', path: '/about' },
  { label: '作品', path: '/works' },
  { label: '随笔', path: '/notes' },
]

interface HeaderProps {
  isMenuOpen: boolean
  setIsMenuOpen: (open: boolean) => void
  theme: 'light' | 'dark'
  toggleTheme: () => void
}

export function Header({ isMenuOpen, setIsMenuOpen, theme, toggleTheme }: HeaderProps) {
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMenuOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setIsMenuOpen])

  return (
    <>
      <header className="ios-nav-container">
        {/* LEFT CLUSTER */}
        <div className="nav-cluster-left">
          <button 
            className={`nav-btn-circle ${isMenuOpen ? 'is-active' : ''}`}
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label="菜单"
          >
            {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          
          <button 
            className="nav-btn-pill theme-toggle-pill"
            onClick={toggleTheme}
            aria-label="切换主题"
          >
            {theme === 'light' ? (
              <>
                <Moon size={16} />
                <span className="pill-text">深夜模式</span>
              </>
            ) : (
              <>
                <Sun size={16} />
                <span className="pill-text">明亮模式</span>
              </>
            )}
          </button>
        </div>

        {/* RIGHT CLUSTER */}
        <div className="nav-cluster-right">
          <button className="nav-btn-circle" aria-label="个人中心">
            <User size={20} />
          </button>
        </div>
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
