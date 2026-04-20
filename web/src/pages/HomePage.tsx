import { useState, useEffect, useCallback, useRef } from 'react'
import { Header } from '../components/Header'
import { Hero } from '../components/Hero'
import { StillAlive } from '../components/StillAlive'
import { ZineReader } from '../components/ZineReader'
import { fetchPublishedMemos, getPublishedMemos } from '../lib/memos'
import '../styles/home.css'
import '../styles/animations.css'

type ThemePreference = 'system' | 'light' | 'dark'
type ResolvedTheme = 'light' | 'dark'

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function getDefaultSkillId(): string | null {
  return window.matchMedia('(min-width: 1080px)').matches ? 'design' : null
}

export function HomePage() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => {
    const saved = localStorage.getItem('me-theme')
    if (saved === 'light' || saved === 'dark') return saved
    return 'system'
  })
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => getSystemTheme())
  const [activeSkillId, setActiveSkillId] = useState<string | null>(() => getDefaultSkillId())
  const [activeMemoId, setActiveMemoId] = useState<string | null>(null)
  const [memos, setMemos] = useState(() => getPublishedMemos())
  const [isMemoInteracting, setIsMemoInteracting] = useState(false)
  const stillAliveRef = useRef<HTMLDivElement>(null)
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

  useEffect(() => {
    let isMounted = true

    fetchPublishedMemos().then((nextMemos) => {
      if (!isMounted || nextMemos.length === 0) return
      setMemos(nextMemos)
    })

    return () => {
      isMounted = false
    }
  }, [])

  const toggleTheme = () => {
    const nextTheme = resolvedTheme === 'light' ? 'dark' : 'light'
    localStorage.setItem('me-theme', nextTheme)
    setThemePreference(nextTheme)
  }

  const isPushedBack = isMenuOpen || !!activeMemoId
  const closeReader = () => {
    setActiveMemoId(null)
    window.requestAnimationFrame(() => {
      stillAliveRef.current?.focus()
    })
  }

  return (
    <main className="page-shell">
      <Header 
        isMenuOpen={isMenuOpen} 
        setIsMenuOpen={setIsMenuOpen} 
        theme={resolvedTheme}
        toggleTheme={toggleTheme}
        isReceded={isMemoInteracting}
        isHiddenFromAssistiveTech={!!activeMemoId}
      />
      
      <div
        className={`main-content-container ${isPushedBack ? 'is-pushed-back' : ''}`}
        aria-hidden={isPushedBack}
      >
        <Hero activeSkillId={activeSkillId} setActiveSkillId={setActiveSkillId} />
        <StillAlive
          ref={stillAliveRef}
          memos={memos}
          onOpenMemo={(id) => setActiveMemoId(id)}
          onInteractionChange={setIsMemoInteracting}
        />
      </div>

      <ZineReader 
        isOpen={!!activeMemoId} 
        onClose={closeReader} 
        activeMemoId={activeMemoId}
        memos={memos}
      />

      <footer
        className={`page-footer ${activeSkillId || isPushedBack ? 'is-hidden' : ''}`}
        aria-hidden={isPushedBack}
      >
        一些做过的界面，和还在路上的记录。
      </footer>
    </main>
  )
}
