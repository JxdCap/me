import { useState } from 'react'
import { Header } from '../components/Header'
import { Hero } from '../components/Hero'
import { StillAlive } from '../components/StillAlive'
import '../styles/home.css'

export function HomePage() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  return (
    <main className="page-shell">
      <Header isMenuOpen={isMenuOpen} setIsMenuOpen={setIsMenuOpen} />
      
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
