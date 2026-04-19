import { useState, useEffect, useCallback } from 'react'
import { Header } from '../components/Header'
import { Hero } from '../components/Hero'
import { StillAlive } from '../components/StillAlive'
import { ZineReader } from '../components/ZineReader'
import { getPublishedMemos } from '../lib/memos'
import '../styles/home.css'
import '../styles/animations.css'

const memos = getPublishedMemos()
type ThemePreference = 'system' | 'light' | 'dark'
type ResolvedTheme = 'light' | 'dark'

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function HomePage() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => {
    const saved = localStorage.getItem('me-theme')
    if (saved === 'light' || saved === 'dark') return saved
    return 'system'
  })
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => getSystemTheme())
  const [activeSkillId, setActiveSkillId] = useState<string | null>(null)
  const [activeMemoId, setActiveMemoId] = useState<string | null>(null)
  const [isMemoInteracting, setIsMemoInteracting] = useState(false)
  const resolvedTheme = themePreference === 'system' ? systemTheme : themePreference

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

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => setSystemTheme(media.matches ? 'dark' : 'light')

    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme)
  }, [resolvedTheme])

  const toggleTheme = () => {
    const nextTheme = resolvedTheme === 'light' ? 'dark' : 'light'
    localStorage.setItem('me-theme', nextTheme)
    setThemePreference(nextTheme)
  }

  const isPushedBack = isMenuOpen || !!activeMemoId

  return (
    <main className="page-shell">
      <Header 
        isMenuOpen={isMenuOpen} 
        setIsMenuOpen={setIsMenuOpen} 
        theme={resolvedTheme}
        toggleTheme={toggleTheme}
        isReceded={isMemoInteracting}
      />
      
      <div className={`main-content-container ${isPushedBack ? 'is-pushed-back' : ''}`}>
        <Hero activeSkillId={activeSkillId} setActiveSkillId={setActiveSkillId} />
        <StillAlive
          memos={memos}
          onOpenMemo={(id) => setActiveMemoId(id)}
          onInteractionChange={setIsMemoInteracting}
        />
      </div>

      <ZineReader 
        isOpen={!!activeMemoId} 
        onClose={() => setActiveMemoId(null)} 
        activeMemoId={activeMemoId}
        memos={memos}
      />

      <footer className={`page-footer ${activeSkillId || isPushedBack ? 'is-hidden' : ''}`}>
        一些做过的界面，和还在路上的记录。
      </footer>
    </main>
  )
}
