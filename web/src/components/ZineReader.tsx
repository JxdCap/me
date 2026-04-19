import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ArrowRight } from 'lucide-react'
import { type StillAliveCard } from '../lib/constants'

interface ZineReaderProps {
  isOpen: boolean
  onClose: () => void
  activeMemoId: string | null
  memos: StillAliveCard[]
}

function ZineImage({ src }: { src: string }) {
  const [isLoaded, setIsLoaded] = useState(false)
  
  return (
    <div className={`zine-image-item ${isLoaded ? 'is-loaded' : ''}`}>
      {!isLoaded && <div className="skeleton-loader" />}
      <motion.img
        src={src}
        alt=""
        loading="lazy"
        onLoad={() => setIsLoaded(true)}
        initial={{ opacity: 0 }}
        animate={isLoaded ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      />
    </div>
  )
}

export function ZineReader({ isOpen, onClose, activeMemoId, memos }: ZineReaderProps) {
  const [scrollProgress, setScrollProgress] = useState(0)
  const [isScrolled, setIsScrolled] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget
    const scrollableDistance = container.scrollHeight - container.clientHeight
    const progress = scrollableDistance > 0 ? container.scrollTop / scrollableDistance : 0
    setScrollProgress(progress)
    setIsScrolled(container.scrollTop > 28)
  }

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      setScrollProgress(0)
      setIsScrolled(false)
      // Ensure we start from the top of the container
      if (containerRef.current) containerRef.current.scrollTop = 0
    } else {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!activeMemoId) return null

  // Order: Clicked memo first, then others
  const startIndex = memos.findIndex(m => m.id === activeMemoId)
  const orderedMemos = [...memos.slice(startIndex), ...memos.slice(0, startIndex)]

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          className={`zine-reader ${isScrolled ? 'is-scrolled' : ''}`}
          initial={{ opacity: 0, clipPath: 'inset(10% 10% 10% 10% round 40px)' }}
          animate={{ opacity: 1, clipPath: 'inset(0% 0% 0% 0% round 0px)' }}
          exit={{ opacity: 0, clipPath: 'inset(10% 10% 10% 10% round 40px)' }}
          transition={{ type: 'spring', damping: 30, stiffness: 200 }}
        >
          {/* TOP PROGRESS BAR */}
          <motion.div className="scroll-progress-bar" style={{ scaleX: scrollProgress }} />

          {/* UNIFIED iOS CLOSE BUTTON */}
          <div className="zine-fixed-controls">
            <button className="nav-btn-circle is-active" onClick={onClose} aria-label="关闭">
              <X size={20} />
            </button>
          </div>

          <div className="zine-scroll-container" onScroll={handleScroll} ref={containerRef}>
            {orderedMemos.map((memo, index) => (
              <article key={memo.id} className="zine-article">
                <header className="zine-article-header sticky-header">
                  <div className="header-glass-bg" />
                  <div className="header-content">
                    <span className="zine-article-meta">{memo.location} // {memo.time}</span>
                    <h1 className="zine-article-id">ENTRY.{memo.id.split('-')[1]}</h1>
                  </div>
                </header>
                
                <div className="article-inner-content">
                  {memo.images.length > 0 && (
                    <div className={`zine-image-grid images-${Math.min(memo.images.length, 9)}`}>
                      {memo.images.map((img, i) => (
                        <ZineImage key={i} src={img} />
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
                    <span className="divider-text">NEXT LOG</span>
                    <ArrowRight size={14} />
                  </div>
                )}
              </article>
            ))}
            
            <div className="zine-end-cap">
              <p>THE END</p>
              <button className="back-to-top" onClick={onClose}>回到首页</button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
