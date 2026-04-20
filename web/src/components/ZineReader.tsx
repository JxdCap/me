import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { ContentImage } from './ContentImage'
import { type StillAliveCard } from '../lib/constants'
import { orderMemosForReader } from '../lib/memos'

interface ZineReaderProps {
  isOpen: boolean
  onClose: () => void
  activeMemoId: string | null
  memos: StillAliveCard[]
}

export function ZineReader({ isOpen, onClose, activeMemoId, memos }: ZineReaderProps) {
  const [scrollProgress, setScrollProgress] = useState(0)
  const [areControlsReceded, setAreControlsReceded] = useState(false)
  const [currentMemoId, setCurrentMemoId] = useState<string | null>(activeMemoId)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const lastScrollTopRef = useRef(0)

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget
    const scrollableDistance = container.scrollHeight - container.clientHeight
    const progress = scrollableDistance > 0 ? container.scrollTop / scrollableDistance : 0
    const delta = container.scrollTop - lastScrollTopRef.current

    setScrollProgress(progress)

    const focusLine = container.scrollTop + 140
    const articles = Array.from(container.querySelectorAll<HTMLElement>('[data-memo-id]'))
    const currentArticle = articles.reduce<HTMLElement | null>((closest, article) => {
      if (article.offsetTop > focusLine) return closest
      if (!closest) return article
      return article.offsetTop > closest.offsetTop ? article : closest
    }, null)
    const nextMemoId = currentArticle?.dataset.memoId
    if (nextMemoId) setCurrentMemoId(nextMemoId)

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
      setAreControlsReceded(false)
      setCurrentMemoId(activeMemoId)
      setActiveCategory(null)
      lastScrollTopRef.current = 0
      if (containerRef.current) containerRef.current.scrollTop = 0
      closeButtonRef.current?.focus()
    } else {
      document.body.style.overflow = ''
    }
  }, [isOpen, activeMemoId])

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!activeMemoId) return null

  const filteredMemos = activeCategory
    ? memos.filter((memo) => memo.category === activeCategory)
    : memos
  const filterSourceId =
    activeCategory && currentMemoId && filteredMemos.some((memo) => memo.id === currentMemoId)
      ? currentMemoId
      : activeMemoId
  const orderedMemos = orderMemosForReader(filterSourceId, filteredMemos)
  const activeMemo = orderedMemos.find((memo) => memo.id === currentMemoId) || orderedMemos[0]

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          className={`zine-reader ${areControlsReceded ? 'controls-receded' : ''}`}
          role="dialog"
          aria-modal="true"
          aria-label="阅读记录"
          initial={{ opacity: 0, clipPath: 'inset(10% 10% 10% 10% round 40px)' }}
          animate={{ opacity: 1, clipPath: 'inset(0% 0% 0% 0% round 0px)' }}
          exit={{ opacity: 0, clipPath: 'inset(10% 10% 10% 10% round 40px)' }}
          transition={{ type: 'spring', damping: 30, stiffness: 200 }}
        >
          <div className="reader-bar">
            <div className="reader-bar-copy" key={activeMemo?.id || 'reader'}>
              <span className="reader-bar-label">{activeMemo ? `${activeMemo.location} · ${activeMemo.time}` : '阅读记录'}</span>
              <button
                type="button"
                className={`reader-bar-title ${activeCategory ? 'is-filter-active' : ''}`}
                onClick={() => setActiveCategory(null)}
                aria-label={activeCategory ? '清除分类筛选' : '当前为全部记录'}
              >
                {activeCategory || '个人记录'}
              </button>
            </div>
            <button ref={closeButtonRef} className="reader-close-button" onClick={onClose} aria-label="关闭阅读器">
              <X size={18} />
            </button>
            <motion.div className="reader-progress-edge" style={{ scaleX: scrollProgress }} />
          </div>

          <div className="zine-scroll-container" onScroll={handleScroll} ref={containerRef}>
            {orderedMemos.map((memo, index) => (
              <article
                key={memo.id}
                className={`zine-article ${memo.images.length === 0 ? 'has-no-media' : ''}`}
                data-memo-id={memo.id}
                aria-labelledby={`memo-title-${memo.id}`}
              >
                <header className="zine-entry-header">
                  <span id={`memo-title-${memo.id}`} className="zine-entry-index">
                    <button
                      type="button"
                      className={`zine-entry-category ${activeCategory === memo.category ? 'is-active' : ''}`}
                      onClick={() => {
                        setActiveCategory((current) => current === memo.category ? null : memo.category)
                        setCurrentMemoId(memo.id)
                      }}
                      aria-pressed={activeCategory === memo.category}
                    >
                      <span className="zine-entry-category-label">{memo.category}</span>
                      <span className="zine-entry-category-id">{memo.id}</span>
                    </button>
                  </span>
                  <span className="zine-entry-meta">{memo.location} · {memo.time}</span>
                </header>

                <div className="zine-article-body">
                  <p>{memo.text}</p>
                </div>

                {memo.images.length > 0 && (
                  <div className={`zine-image-grid images-${Math.min(memo.images.length, 9)}`}>
                    {memo.images.map((image) => (
                      <ContentImage key={image.src} image={image} className="zine-image-item" />
                    ))}
                  </div>
                )}

                {index < orderedMemos.length - 1 && (
                  <div className="zine-section-space" aria-hidden="true" />
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
