import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react'
import { type StillAliveCard } from './StillAlive'

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
      <div className="skeleton-loader" />
      <motion.img
        src={src}
        alt=""
        loading="lazy"
        onLoad={() => setIsLoaded(true)}
        initial={{ filter: 'blur(20px)', opacity: 0 }}
        animate={isLoaded ? { filter: 'blur(0px)', opacity: 1 } : {}}
        transition={{ duration: 0.8 }}
      />
    </div>
  )
}

export function ZineReader({ isOpen, onClose, activeMemoId, memos }: ZineReaderProps) {
  const [lightboxData, setLightboxData] = useState<{ images: string[], index: number } | null>(null)
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
          initial={{ opacity: 0, y: 100, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 100, scale: 0.95 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
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
                      <div key={i} onClick={() => setLightboxData({ images: memo.images, index: i })}>
                        <ZineImage src={img} />
                      </div>
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

          <AnimatePresence>
            {lightboxData && (
              <Lightbox 
                images={lightboxData.images}
                initialIndex={lightboxData.index}
                onClose={() => setLightboxData(null)} 
              />
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Lightbox({ images, initialIndex, onClose }: { images: string[], initialIndex: number, onClose: () => void }) {
  const [index, setIndex] = useState(initialIndex)

  return (
    <motion.div 
      className="lightbox-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div 
        key={index}
        className="lightbox-content"
        initial={{ x: 300, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: -300, opacity: 0 }}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.2}
        onDragEnd={(_, info) => {
          if (info.offset.x < -100 && index < images.length - 1) {
            setIndex(index + 1)
          } else if (info.offset.x > 100 && index > 0) {
            setIndex(index - 1)
          }
        }}
      >
        <img src={images[index]} alt="" onClick={(e) => e.stopPropagation()} draggable={false} />
        
        <div className="lightbox-controls" onClick={e => e.stopPropagation()}>
          {index > 0 && <button onClick={() => setIndex(index - 1)}><ChevronLeft /></button>}
          <span className="idx-indicator">{index + 1} / {images.length}</span>
          {index < images.length - 1 && <button onClick={() => setIndex(index + 1)}><ChevronRight /></button>}
        </div>
        <div className="lightbox-hint">左右滑动切换 · 下拉关闭</div>
      </motion.div>

      {/* Background click to close - specifically for the overlay */}
      <div className="lightbox-swipe-close-zone" 
           style={{ position: 'absolute', inset: 0, zIndex: -1 }} 
           onClick={onClose} 
      />
    </motion.div>
  )
}
