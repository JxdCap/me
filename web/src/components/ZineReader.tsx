import { useEffect } from 'react'
import { X, ArrowRight } from 'lucide-react'
import { type StillAliveCard } from './StillAlive'

interface ZineReaderProps {
  isOpen: boolean
  onClose: () => void
  activeMemoId: string | null
  memos: StillAliveCard[]
}

export function ZineReader({ isOpen, onClose, activeMemoId, memos }: ZineReaderProps) {
  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!activeMemoId) return null

  // Reorder memos to start from activeMemoId, followed by the rest in descending order
  const startIndex = memos.findIndex(m => m.id === activeMemoId)
  const orderedMemos = [...memos.slice(startIndex), ...memos.slice(0, startIndex)]

  return (
    <div className={`zine-reader ${isOpen ? 'is-open' : ''}`}>
      <div className="zine-header">
        <button className="zine-close-trigger" onClick={onClose} aria-label="关闭阅读">
          <X size={24} strokeWidth={1.5} />
        </button>
      </div>

      <div className="zine-scroll-container">
        {orderedMemos.map((memo, index) => (
          <article key={memo.id} className="zine-article">
            <header className="zine-article-header">
              <span className="zine-article-meta">{memo.location} // {memo.time}</span>
              <h1 className="zine-article-id">ENTRY.{memo.id.split('-')[1]}</h1>
            </header>
            
            {memo.images.length > 0 && (
              <div className={`zine-image-grid images-${Math.min(memo.images.length, 9)}`}>
                {memo.images.slice(0, 9).map((img, i) => (
                  <div key={i} className="zine-image-item">
                    <img src={img} alt="" loading="lazy" />
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
    </div>
  )
}
