import { useEffect, useRef, useState } from 'react'
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
  isReceded?: boolean
}

export function Header({ isMenuOpen, setIsMenuOpen, theme, toggleTheme, isReceded = false }: HeaderProps) {
  const [time, setTime] = useState(new Date())
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const firstIndexLinkRef = useRef<HTMLAnchorElement>(null)
  const hasOpenedMenuRef = useRef(false)

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

  useEffect(() => {
    if (isMenuOpen) {
      hasOpenedMenuRef.current = true
      firstIndexLinkRef.current?.focus()
    } else if (hasOpenedMenuRef.current) {
      menuButtonRef.current?.focus()
    }
  }, [isMenuOpen])

  return (
    <>
      <header className={`ios-nav-container ${isReceded && !isMenuOpen ? 'is-context-receded' : ''}`}>
        {/* LEFT CLUSTER */}
        <div className="nav-cluster-left">
          <button 
            ref={menuButtonRef}
            className={`nav-btn-circle ${isMenuOpen ? 'is-active' : ''}`}
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label="菜单"
            aria-expanded={isMenuOpen}
            aria-controls="site-index"
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

      <div
        id="site-index"
        className={`index-overlay ${isMenuOpen ? 'is-open' : ''}`}
        aria-hidden={!isMenuOpen}
      >
        <div className="index-content">
          <nav className="index-nav">
            {menuItems.map((item, index) => (
              <a 
                ref={index === 0 ? firstIndexLinkRef : undefined}
                key={item.label} 
                href={item.path} 
                className="index-link"
                tabIndex={isMenuOpen ? 0 : -1}
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
