import { useEffect, useRef, useState, type PointerEvent } from 'react'
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
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // MAGNETIC EFFECT LOGIC
  const handlePointerMove = (e: PointerEvent) => {
    if (!buttonRef.current || isMenuOpen) return
    
    const rect = buttonRef.current.getBoundingClientRect()
    const x = e.clientX - (rect.left + rect.width / 2)
    const y = e.clientY - (rect.top + rect.height / 2)
    
    // Limits the pull distance
    const distance = Math.sqrt(x * x + y * y)
    if (distance < 100) {
      buttonRef.current.style.setProperty('--magnet-x', `${x * 0.35}px`)
      buttonRef.current.style.setProperty('--magnet-y', `${y * 0.35}px`)
    } else {
      buttonRef.current.style.setProperty('--magnet-x', '0px')
      buttonRef.current.style.setProperty('--magnet-y', '0px')
    }
  }

  const handlePointerLeave = () => {
    if (buttonRef.current) {
      buttonRef.current.style.setProperty('--magnet-x', '0px')
      buttonRef.current.style.setProperty('--magnet-y', '0px')
    }
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-identity">
          <div className="identity-dot" />
          <span>ME</span>
        </div>
        
        <button
          ref={buttonRef}
          className={`index-trigger ${isMenuOpen ? 'is-active' : ''}`}
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          aria-label={isMenuOpen ? "关闭索引" : "打开索引"}
        >
          <div className="trigger-pill">
            <span className="trigger-label">{isMenuOpen ? 'CLOSE' : 'INDEX'}</span>
            <div className="trigger-icon">
              {isMenuOpen ? <X size={18} /> : <Menu size={18} />}
            </div>
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
              >
                <span className="link-number">0{index + 1}</span>
                <span className="link-label">{item.label}</span>
                <ArrowUpRight className="link-arrow" size={24} strokeWidth={1.5} />
              </a>
            ))}
          </nav>
          
          <div className="index-footer">
            <div className="footer-item">
              <span className="footer-label">LOCAL TIME</span>
              <span className="footer-value">
                {time.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
            <div className="footer-item">
              <span className="footer-label">STATUS</span>
              <span className="footer-value">COLLECTIVE MEMORY</span>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
