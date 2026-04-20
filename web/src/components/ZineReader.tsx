import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
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
  const [categoryStartMemoId, setCategoryStartMemoId] = useState<string | null>(null)
  const [lightboxMemoId, setLightboxMemoId] = useState<string | null>(null)
  const [lightboxImageIndex, setLightboxImageIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const lightboxCloseButtonRef = useRef<HTMLButtonElement>(null)
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
      setCategoryStartMemoId(null)
      setLightboxMemoId(null)
      setLightboxImageIndex(0)
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
      if (lightboxMemoId) {
        if (e.key === 'Escape') {
          setLightboxMemoId(null)
          return
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault()
          setLightboxImageIndex((current) =>
            Math.min(current + 1, Math.max((lightboxMemo?.images.length || 1) - 1, 0))
          )
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault()
          setLightboxImageIndex((current) => Math.max(current - 1, 0))
        }
        return
      }

      if (e.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose, lightboxMemoId])

  useEffect(() => {
    if (lightboxMemoId) lightboxCloseButtonRef.current?.focus()
  }, [lightboxMemoId])

  if (!activeMemoId) return null

  const filteredMemos = activeCategory
    ? memos.filter((memo) => memo.category === activeCategory)
    : memos
  const orderedMemos = activeCategory
    ? orderMemosForReader(categoryStartMemoId || activeMemoId, filteredMemos)
    : orderMemosForReader(activeMemoId, memos)
  const activeMemo = orderedMemos.find((memo) => memo.id === currentMemoId) || orderedMemos[0]
  const filteredCount = orderedMemos.length
  const lightboxMemo = lightboxMemoId ? orderedMemos.find((memo) => memo.id === lightboxMemoId) || null : null
  const lightboxImage = lightboxMemo?.images[lightboxImageIndex] || null

  const openLightbox = (memoId: string, imageIndex: number) => {
    setLightboxMemoId(memoId)
    setLightboxImageIndex(imageIndex)
  }

  const closeLightbox = () => {
    setLightboxMemoId(null)
    lightboxCloseButtonRef.current?.blur()
    closeButtonRef.current?.focus()
  }

  const goToPrevImage = () => {
    setLightboxImageIndex((current) => Math.max(current - 1, 0))
  }

  const goToNextImage = () => {
    setLightboxImageIndex((current) =>
      Math.min(current + 1, Math.max((lightboxMemo?.images.length || 1) - 1, 0))
    )
  }

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
              <span className="reader-bar-label">
                {activeMemo
                  ? `${activeMemo.location} · ${activeMemo.time}${activeCategory ? ' · 已按分类筛选' : ''}`
                  : '阅读记录'}
              </span>
              {activeCategory ? (
                <div className="reader-filter-state">
                  <span className="reader-bar-title is-filter-active">{activeCategory}</span>
                  <button
                    type="button"
                    className="reader-filter-reset"
                    onClick={() => {
                      setActiveCategory(null)
                      setCategoryStartMemoId(null)
                      setCurrentMemoId(activeMemoId)
                      setScrollProgress(0)
                      setAreControlsReceded(false)
                      lastScrollTopRef.current = 0
                      if (containerRef.current) containerRef.current.scrollTop = 0
                    }}
                    aria-label="回到全部记录"
                  >
                    全部 · {filteredCount}
                  </button>
                </div>
              ) : (
                <span className="reader-bar-title">个人记录</span>
              )}
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
                        const nextCategory = activeCategory === memo.category ? null : memo.category
                        setActiveCategory(nextCategory)
                        setCategoryStartMemoId(nextCategory ? memo.id : null)
                        setCurrentMemoId(memo.id)
                        setScrollProgress(0)
                        setAreControlsReceded(false)
                        lastScrollTopRef.current = 0
                        if (containerRef.current) containerRef.current.scrollTop = 0
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
                    {memo.images.map((image, imageIndex) => (
                      <button
                        type="button"
                        key={image.src}
                        className="zine-image-item zine-image-lightbox-ready"
                        data-memo-id={memo.id}
                        data-image-index={imageIndex}
                        data-full-src={image.fullSrc || image.src}
                        onClick={() => openLightbox(memo.id, imageIndex)}
                        aria-label={`查看图片 ${imageIndex + 1}`}
                      >
                        <ContentImage image={image} variant="reader" />
                      </button>
                    ))}
                  </div>
                )}

                {index < orderedMemos.length - 1 && (
                  <div className="zine-section-space" aria-hidden="true" />
                )}
              </article>
            ))}
            
            <div className="zine-end-cap">
              <p className="zine-end-cap-copy">这段记录先看到这里。</p>
              <button className="back-to-top" onClick={onClose}>回到首页</button>
            </div>
          </div>

          <AnimatePresence>
            {lightboxMemo && lightboxImage && (
              <motion.div
                className="reader-lightbox"
                role="dialog"
                aria-modal="true"
                aria-label="查看图片"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                onClick={closeLightbox}
              >
              <motion.div
                className="reader-lightbox-stage"
                initial={{ opacity: 0, scale: 0.98, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.985, y: 8 }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                onClick={(e) => e.stopPropagation()}
              >
                  <div className="reader-lightbox-topbar">
                    <div className="reader-lightbox-copy">
                      <span className="reader-lightbox-meta">
                        {lightboxMemo.category} · {lightboxMemo.location} · {lightboxMemo.time}
                      </span>
                      <span className="reader-lightbox-index">
                        {lightboxImageIndex + 1} / {lightboxMemo.images.length}
                      </span>
                    </div>
                    <button
                      ref={lightboxCloseButtonRef}
                      type="button"
                      className="reader-lightbox-close"
                      onClick={closeLightbox}
                      aria-label="关闭图片查看"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <motion.div
                    className="reader-lightbox-media"
                    key={`${lightboxMemo.id}-${lightboxImageIndex}`}
                    drag
                    dragDirectionLock
                    dragConstraints={{ top: 0, bottom: 0, left: 0, right: 0 }}
                    dragElastic={0.16}
                    onDragEnd={(_, info) => {
                      const absX = Math.abs(info.offset.x)
                      const absY = Math.abs(info.offset.y)

                      if (absX > absY && absX > 72) {
                        if (info.offset.x < 0) {
                          goToNextImage()
                        } else {
                          goToPrevImage()
                        }
                        return
                      }

                      if (info.offset.y > 120 || info.velocity.y > 520) {
                        closeLightbox()
                      }
                    }}
                    initial={{ opacity: 0.92, scale: 0.99 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                  >
                    <img
                      src={lightboxImage.fullSrc || lightboxImage.src}
                      alt={lightboxImage.alt}
                      className="reader-lightbox-image"
                    />
                  </motion.div>

                  {lightboxMemo.images.length > 1 && (
                    <div className="reader-lightbox-nav">
                      <button
                        type="button"
                        className="reader-lightbox-nav-button"
                        onClick={goToPrevImage}
                        aria-label="上一张"
                        disabled={lightboxImageIndex === 0}
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <button
                        type="button"
                        className="reader-lightbox-nav-button"
                        onClick={goToNextImage}
                        aria-label="下一张"
                        disabled={lightboxImageIndex === lightboxMemo.images.length - 1}
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  )}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
