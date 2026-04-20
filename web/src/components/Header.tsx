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
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const firstIndexLinkRef = useRef<HTMLAnchorElement>(null)
  const indexContentRef = useRef<HTMLDivElement>(null)
  const hasOpenedMenuRef = useRef(false)

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
        className={`ios-nav-container ${isReceded && !isMenuOpen ? 'is-context-receded' : ''} ${isMenuOpen ? 'is-menu-open' : ''}`}
        aria-hidden={isHiddenFromAssistiveTech}
      >
        <div className="nav-cluster nav-cluster-left nav-cluster-controls">
          <button 
            ref={menuButtonRef}
            className={`nav-btn-segment nav-btn-menu ${isMenuOpen ? 'is-active' : ''}`}
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label="菜单"
            aria-expanded={isMenuOpen}
            aria-controls="site-index"
          >
            {isMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
          
          <button 
            className="nav-btn-segment nav-btn-theme"
            onClick={toggleTheme}
            aria-label="切换主题"
          >
            {theme === 'light' ? (
              <Moon size={21} />
            ) : (
              <Sun size={21} />
            )}
          </button>
        </div>

        <div className="nav-cluster nav-cluster-right">
          <button className="nav-btn-circle nav-btn-utility" aria-label="个人中心">
            <User size={21} />
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
                <span className="link-label">{item.label}</span>
                <ArrowUpRight className="link-arrow" size={20} strokeWidth={1.4} />
              </a>
            ))}
          </nav>
          
          <p className="index-footer-note">这里放着一些页面，也放着还没写完的部分。</p>
        </div>
      </div>
    </>
  )
}
