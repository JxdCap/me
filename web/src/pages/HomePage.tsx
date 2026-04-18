import { useState, useEffect, useCallback } from 'react'
import { Header } from '../components/Header'
import { Hero } from '../components/Hero'
import { StillAlive } from '../components/StillAlive'
import '../styles/home.css'

export function HomePage() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  // PARALLAX EFFECT FOR DOT MATRIX
  const handlePointerMove = useCallback((e: React.PointerEvent | PointerEvent) => {
    const { clientX, clientY } = e
    const x = (clientX / window.innerWidth - 0.5) * 2 // -1 to 1
    const y = (clientY / window.innerHeight - 0.5) * 2 // -1 to 1
    
    document.documentElement.style.setProperty('--mouse-x', x.toString())
    document.documentElement.style.setProperty('--mouse-y', y.toString())
  }, [])

  useEffect(() => {
    window.addEventListener('pointermove', handlePointerMove)
    return () => window.removeEventListener('pointermove', handlePointerMove)
  }, [handlePointerMove])

  // THEME INITIALIZATION & SYNC
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
        <Hero />
        <StillAlive />
      </div>

      <footer className="page-footer">
        *This is my zine. I write about "shit" I care about.
      </footer>
    </main>
  )
}
