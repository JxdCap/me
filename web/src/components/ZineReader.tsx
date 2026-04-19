import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ArrowRight } from 'lucide-react'
import { ContentImage } from './ContentImage'
import { type StillAliveCard } from '../lib/constants'

interface ZineReaderProps {
  isOpen: boolean
  onClose: () => void
  activeMemoId: string | null
  memos: StillAliveCard[]
}

function formatEntryNumber(id: string) {
  const number = id.split('-')[1] || id
  return `记录 ${number.padStart(2, '0')}`
}

export function ZineReader({ isOpen, onClose, activeMemoId, memos }: ZineReaderProps) {
  const [scrollProgress, setScrollProgress] = useState(0)
  const [isScrolled, setIsScrolled] = useState(false)
  const [areControlsReceded, setAreControlsReceded] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const lastScrollTopRef = useRef(0)

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget
    const scrollableDistance = container.scrollHeight - container.clientHeight
    const progress = scrollableDistance > 0 ? container.scrollTop / scrollableDistance : 0
    const delta = container.scrollTop - lastScrollTopRef.current

    setScrollProgress(progress)
    setIsScrolled(container.scrollTop > 28)
    if (container.scrollTop < 28) {
      setAreControlsReceded(false)
    } else if (delta > 2) {
      setAreControlsReceded(true)
    } else if (delta < -2) {
      setAreControlsReceded(false)
    }
    lastScrollTopRef.current = container.scrollTop
  }

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      setScrollProgress(0)
      setIsScrolled(false)
      setAreControlsReceded(false)
      lastScrollTopRef.current = 0
      if (containerRef.current) containerRef.current.scrollTop = 0
      closeButtonRef.current?.focus()
    } else {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!activeMemoId) return null

  const startIndex = memos.findIndex(m => m.id === activeMemoId)
  const orderedMemos = [...memos.slice(startIndex), ...memos.slice(0, startIndex)]

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          className={`zine-reader ${isScrolled ? 'is-scrolled' : ''} ${areControlsReceded ? 'controls-receded' : ''}`}
          initial={{ opacity: 0, clipPath: 'inset(10% 10% 10% 10% round 40px)' }}
          animate={{ opacity: 1, clipPath: 'inset(0% 0% 0% 0% round 0px)' }}
          exit={{ opacity: 0, clipPath: 'inset(10% 10% 10% 10% round 40px)' }}
          transition={{ type: 'spring', damping: 30, stiffness: 200 }}
        >
          {/* TOP PROGRESS BAR */}
          <motion.div className="scroll-progress-bar" style={{ scaleX: scrollProgress }} />

          {/* UNIFIED iOS CLOSE BUTTON */}
          <div className="zine-fixed-controls">
            <button ref={closeButtonRef} className="nav-btn-circle is-active" onClick={onClose} aria-label="关闭">
              <X size={20} />
            </button>
          </div>

          <div className="zine-scroll-container" onScroll={handleScroll} ref={containerRef}>
            {orderedMemos.map((memo, index) => (
              <article key={memo.id} className="zine-article">
                <header className="zine-article-header sticky-header">
                  <div className="header-glass-bg" />
                  <div className="header-content">
                    <span className="zine-article-meta">{memo.location} · {memo.time}</span>
                    <h1 className="zine-article-id">{formatEntryNumber(memo.id)}</h1>
                  </div>
                </header>
                
                <div className="article-inner-content">
                  {memo.images.length > 0 && (
                    <div className={`zine-image-grid images-${Math.min(memo.images.length, 9)}`}>
                      {memo.images.map((image, i) => (
                        <ContentImage key={image.src} image={image} className="zine-image-item" />
                      ))}
                    </div>
                  )}

                  <div className="zine-article-body">
                    <p>{memo.text}</p>
                  </div>
                </div>

                {index < orderedMemos.length - 1 && (
                  <div className="zine-article-divider">
                    <div className="divider-line" />
                    <span className="divider-text">下一则</span>
                    <ArrowRight size={14} />
                  </div>
                )}
              </article>
            ))}
            
            <div className="zine-end-cap">
              <p>已经到底了</p>
              <button className="back-to-top" onClick={onClose}>回到首页</button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
