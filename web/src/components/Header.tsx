import { useEffect, useRef, useState } from 'react'
import {
  Menu,
  X,
  ArrowUpRight,
  Sun,
  Moon,
  User,
  Sparkles
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
  isHiddenFromAssistiveTech?: boolean
}

export function Header({
  isMenuOpen,
  setIsMenuOpen,
  theme,
  toggleTheme,
  isReceded = false,
  isHiddenFromAssistiveTech = false,
}: HeaderProps) {
  const [time, setTime] = useState(new Date())
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const firstIndexLinkRef = useRef<HTMLAnchorElement>(null)
  const indexContentRef = useRef<HTMLDivElement>(null)
  const hasOpenedMenuRef = useRef(false)

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isMenuOpen) return

      if (e.key === 'Escape') {
        setIsMenuOpen(false)
        return
      }

      if (e.key !== 'Tab') return

      const focusable = indexContentRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      if (!focusable || focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isMenuOpen, setIsMenuOpen])

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
      <header
        className={`ios-nav-container ${isReceded && !isMenuOpen ? 'is-context-receded' : ''}`}
        aria-hidden={isHiddenFromAssistiveTech}
      >
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
                <span className="pill-text">深色</span>
              </>
            ) : (
              <>
                <Sun size={16} />
                <span className="pill-text">浅色</span>
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
        role="dialog"
        aria-modal="true"
        aria-label="站点导航"
        aria-hidden={!isMenuOpen}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) setIsMenuOpen(false)
        }}
      >
        <div className="index-content" ref={indexContentRef}>
          <div className="index-kicker" aria-hidden="true">
            <Sparkles size={15} />
            <span>导航</span>
          </div>

          <nav className="index-nav" aria-label="站点导航">
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
              <span className="footer-label">当前时间</span>
              <span className="footer-value">
                {time.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
            <div className="footer-item">
              <span className="footer-label">当前位置</span>
              <span className="footer-value">个人主页</span>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
