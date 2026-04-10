import { useEffect, useRef, useState } from 'react'
import {
  House,
  Menu,
  Music2,
  Sparkles,
  User,
  UserRound,
} from 'lucide-react'

const menuItems = [
  { label: '首页', icon: House },
  { label: '关于', icon: UserRound },
  { label: '歌单', icon: Music2 },
  { label: '小玩意', icon: Sparkles },
]

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuAreaRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuAreaRef.current?.contains(event.target as Node)) {
        setIsMenuOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMenuOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  return (
    <header className="topbar">
      <div className="topbar-actions">
        <div className="menu-anchor" ref={menuAreaRef}>
          <button
            className="frost-control frost-control-menu"
            type="button"
            aria-label="打开菜单"
            aria-expanded={isMenuOpen}
            aria-controls="home-menu-panel"
            onClick={() => setIsMenuOpen((value) => !value)}
          >
            <Menu size={18} strokeWidth={1.9} />
            <span>菜单</span>
          </button>

          <div
            id="home-menu-panel"
            className={`menu-panel${isMenuOpen ? ' is-open' : ''}`}
            aria-hidden={!isMenuOpen}
          >
            <nav aria-label="首页菜单">
              <ul className="menu-list">
                {menuItems.map(({ label, icon: Icon }) => (
                  <li key={label}>
                    <button className="menu-item" type="button">
                      <Icon size={18} strokeWidth={1.9} />
                      <span>{label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </div>

        <button className="frost-control frost-control-login" type="button" aria-label="登录入口">
          <User size={18} strokeWidth={1.9} />
        </button>
      </div>
    </header>
  )
}
