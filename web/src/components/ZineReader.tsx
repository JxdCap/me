import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ArrowRight } from 'lucide-react'
import { type StillAliveCard } from './StillAlive'

interface ZineReaderProps {
  isOpen: boolean
  onClose: () => void
  activeMemoId: string | null
  memos: StillAliveCard[]
}

/**
 * Simplified ZineImage: Removed complex double-blur to fix the "flash" issue.
 * Now uses a simple, clean opacity fade-in.
 */
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
        animate={{ opacity: isLoaded ? 1 : 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      />
    </div>
  )
}

export function ZineReader({ isOpen, onClose, activeMemoId, memos }: ZineReaderProps) {
  const [scrollProgress, setScrollProgress] = useState(0)

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget
    const progress = container.scrollTop / (container.scrollHeight - container.clientHeight)
    setScrollProgress(progress)
  }

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      setScrollProgress(0)
    } else {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!activeMemoId) return null

  const startIndex = memos.findIndex(m => m.id === activeMemoId)
  const orderedMemos = [...memos.slice(startIndex), ...memos.slice(0, startIndex)]

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          className="zine-reader"
          initial={{ opacity: 0, scale: 0.98, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 20 }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        >
          <motion.div className="scroll-progress-bar" style={{ scaleX: scrollProgress }} />

          <div className="zine-header">
            <button className="simple-menu-trigger is-active" onClick={onClose}>
              <span className="trigger-text">关闭</span>
              <div className="trigger-icon-wrap">
                <X size={22} />
              </div>
            </button>
          </div>

          <div className="zine-scroll-container" onScroll={handleScroll}>
            {orderedMemos.map((memo, index) => (
              <article key={memo.id} className="zine-article">
                <header className="zine-article-header">
                  <span className="zine-article-meta">{memo.location} // {memo.time}</span>
                  <h1 className="zine-article-id">ENTRY.{memo.id.split('-')[1]}</h1>
                </header>
                
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
              <p>END OF LOGS</p>
              <button className="back-to-top" onClick={onClose}>回到首页</button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
