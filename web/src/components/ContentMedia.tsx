import { useEffect, useState, type CSSProperties } from 'react'
import { Play } from 'lucide-react'
import { type StillAliveMedia } from '../lib/constants'

interface ContentMediaProps {
  media: StillAliveMedia
  className?: string
  controls?: boolean
  showPlaceholder?: boolean
  variant?: 'default' | 'card' | 'reader'
}

export function ContentMedia({
  media,
  className,
  controls = false,
  showPlaceholder = true,
  variant = 'default',
}: ContentMediaProps) {
  const [isLoaded, setIsLoaded] = useState(false)
  const mediaSrc =
    variant === 'card'
      ? media.cardSrc || media.posterSrc || media.src
      : variant === 'reader'
        ? media.readerSrc || media.posterSrc || media.src
        : media.posterSrc || media.src

  useEffect(() => {
    setIsLoaded(false)
  }, [mediaSrc])

  const isVideo = media.type === 'video'
  const hasPoster = Boolean(media.posterSrc)
  const shouldRenderPosterPreview = isVideo && hasPoster && !controls

  return (
    <div
      className={`content-image content-media ${isVideo ? 'is-video' : 'is-image'} ${isLoaded ? 'is-loaded' : ''} ${className || ''}`}
      style={{ '--image-tone': media.tone } as CSSProperties}
    >
      {showPlaceholder && !isLoaded && <div className="content-image-placeholder" />}
      {isVideo ? (
        <>
          {shouldRenderPosterPreview ? (
            <img
              src={mediaSrc}
              alt={media.alt}
              loading="lazy"
              onLoad={() => setIsLoaded(true)}
              onError={() => setIsLoaded(true)}
            />
          ) : (
            <video
              src={media.fullSrc || media.src}
              poster={hasPoster ? mediaSrc : undefined}
              controls={controls}
              playsInline
              preload="metadata"
              onLoadedData={() => setIsLoaded(true)}
              onLoadedMetadata={() => setIsLoaded(true)}
              onError={() => setIsLoaded(true)}
            />
          )}
          {!controls && (
            <span className="content-video-badge" aria-hidden="true">
              <Play size={14} fill="currentColor" />
            </span>
          )}
          {media.duration && <span className="content-video-duration">{media.duration}</span>}
        </>
      ) : (
        <img
          src={mediaSrc}
          alt={media.alt}
          loading="lazy"
          onLoad={() => setIsLoaded(true)}
          onError={() => setIsLoaded(true)}
        />
      )}
    </div>
  )
}
