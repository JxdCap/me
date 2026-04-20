import { useState, type CSSProperties } from 'react'
import { motion } from 'framer-motion'
import { type StillAliveImage } from '../lib/constants'

interface ContentImageProps {
  image: StillAliveImage
  className?: string
  showPlaceholder?: boolean
  variant?: 'default' | 'card' | 'reader'
}

export function ContentImage({
  image,
  className,
  showPlaceholder = true,
  variant = 'default',
}: ContentImageProps) {
  const [isLoaded, setIsLoaded] = useState(false)
  const imageSrc =
    variant === 'card'
      ? image.cardSrc || image.src
      : variant === 'reader'
        ? image.readerSrc || image.src
        : image.src

  return (
    <div
      className={`content-image ${isLoaded ? 'is-loaded' : ''} ${className || ''}`}
      style={{ '--image-tone': image.tone } as CSSProperties}
    >
      {showPlaceholder && !isLoaded && <div className="content-image-placeholder" />}
      <motion.img
        src={imageSrc}
        alt={image.alt}
        loading="lazy"
        onLoad={() => setIsLoaded(true)}
        initial={{ opacity: 0 }}
        animate={isLoaded ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
      />
    </div>
  )
}
