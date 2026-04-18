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

export function ZineReader({ isOpen, onClose, activeMemoId, memos }: ZineReaderProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [scrollProgress, setScrollProgress] = useState(0)

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget
    const progress = container.scrollTop / (container.scrollHeight - container.clientHeight)
    setScrollProgress(progress)
  }

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      setScrollProgress(0) // Reset progress on open
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
          initial={{ opacity: 0, y: 100, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 100, scale: 0.95 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        >
          {/* SCROLL PROGRESS BAR */}
          <motion.div 
            className="scroll-progress-bar" 
            style={{ scaleX: scrollProgress }} 
          />

          {/* UNIFIED CLOSE BUTTON */}
          <div className="zine-header">
            <button className="simple-menu-trigger is-active" onClick={onClose}>
              <span className="trigger-text">关闭</span>
              <div className="trigger-icon-wrap">
                <X size={20} />
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
                    {memo.images.slice(0, 9).map((img, i) => (
                      <motion.div 
                        key={i} 
                        className="zine-image-item"
                        whileHover={{ scale: 0.98 }}
                        onClick={() => setSelectedImage(img)}
                      >
                        <img src={img} alt="" loading="lazy" />
                      </motion.div>
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

          {/* LIGHTBOX OVERLAY */}
          <AnimatePresence>
            {selectedImage && (
              <Lightbox 
                src={selectedImage} 
                onClose={() => setSelectedImage(null)} 
              />
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <motion.div 
      className="lightbox-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div 
        className="lightbox-content"
        initial={{ scale: 0.8 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.8 }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        onDragEnd={(_, info) => {
          if (Math.abs(info.offset.y) > 100) {
            onClose()
          }
        }}
      >
        <img src={src} alt="" onClick={(e) => e.stopPropagation()} />
        <div className="lightbox-hint">向下滑动关闭</div>
      </motion.div>
    </motion.div>
  )
}
