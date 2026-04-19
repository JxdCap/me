import { useState, useEffect, useCallback } from 'react'
import { Header } from '../components/Header'
import { Hero } from '../components/Hero'
import { StillAlive } from '../components/StillAlive'
import { ZineReader } from '../components/ZineReader'
import { cards } from '../lib/constants'
import '../styles/home.css'
import '../styles/animations.css'

export function HomePage() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('me-theme')
    if (saved === 'light' || saved === 'dark') return saved
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  const [activeSkillId, setActiveSkillId] = useState<string | null>(null)
  const [activeMemoId, setActiveMemoId] = useState<string | null>(null)
  const [isMemoInteracting, setIsMemoInteracting] = useState(false)

  // PARALLAX EFFECT FOR DOT MATRIX
  const handlePointerMove = useCallback((e: React.PointerEvent | PointerEvent) => {
    const { clientX, clientY } = e
    const x = (clientX / window.innerWidth - 0.5) * 2
    const y = (clientY / window.innerHeight - 0.5) * 2
    
    document.documentElement.style.setProperty('--mouse-x', x.toString())
    document.documentElement.style.setProperty('--mouse-y', y.toString())
  }, [])

  useEffect(() => {
    window.addEventListener('pointermove', handlePointerMove)
    return () => window.removeEventListener('pointermove', handlePointerMove)
  }, [handlePointerMove])

  // THEME SYNC & PERSISTENCE
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('me-theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light')
  }

  const isPushedBack = isMenuOpen || !!activeMemoId

  return (
    <main className="page-shell">
      <Header 
        isMenuOpen={isMenuOpen} 
        setIsMenuOpen={setIsMenuOpen} 
        theme={theme}
        toggleTheme={toggleTheme}
        isReceded={isMemoInteracting}
      />
      
      <div className={`main-content-container ${isPushedBack ? 'is-pushed-back' : ''}`}>
        <Hero activeSkillId={activeSkillId} setActiveSkillId={setActiveSkillId} />
        <StillAlive
          onOpenMemo={(id) => setActiveMemoId(id)}
          onInteractionChange={setIsMemoInteracting}
        />
      </div>

      <ZineReader 
        isOpen={!!activeMemoId} 
        onClose={() => setActiveMemoId(null)} 
        activeMemoId={activeMemoId}
        memos={cards}
      />

      <footer className={`page-footer ${activeSkillId || isPushedBack ? 'is-hidden' : ''}`}>
        一些做过的界面，和还在路上的记录。
      </footer>
    </main>
  )
}
