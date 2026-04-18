import { useState, useEffect, useCallback } from 'react'
import { Header } from '../components/Header'
import { Hero } from '../components/Hero'
import { StillAlive } from '../components/StillAlive'
import '../styles/home.css'
import '../styles/animations.css'

export function HomePage() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [activeSkillId, setActiveSkillId] = useState<string | null>(null)

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

  // THEME SYNC
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light')
  }

  return (
    <main className="page-shell">
      <Header 
        isMenuOpen={isMenuOpen} 
        setIsMenuOpen={setIsMenuOpen} 
        theme={theme}
        toggleTheme={toggleTheme}
      />
      
      <div className={`main-content-container ${isMenuOpen ? 'is-pushed-back' : ''}`}>
        <Hero activeSkillId={activeSkillId} setActiveSkillId={setActiveSkillId} />
        <StillAlive />
      </div>

      <footer className={`page-footer ${activeSkillId ? 'is-hidden' : ''}`}>
        *This is my zine. I write about "shit" I care about.
      </footer>
    </main>
  )
}
