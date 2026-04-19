import { cards, type StillAliveCard, type StillAliveImage } from './constants'

const FALLBACK_IMAGE_TONE = '#c7c7cc'

function normalizeImage(image: StillAliveImage, memo: StillAliveCard, index: number): StillAliveImage {
  return {
    src: image.src,
    alt: image.alt || `${memo.location}的记录图片 ${index + 1}`,
    tone: image.tone || FALLBACK_IMAGE_TONE,
  }
}

export function normalizeMemo(memo: StillAliveCard): StillAliveCard {
  return {
    ...memo,
    images: memo.images.map((image, index) => normalizeImage(image, memo, index)),
  }
}

export function getPublishedMemos(): StillAliveCard[] {
  return cards.map(normalizeMemo)
}

export function orderMemosForReader(activeMemoId: string | null, memos: StillAliveCard[]): StillAliveCard[] {
  if (!activeMemoId) return []

  const startIndex = memos.findIndex((memo) => memo.id === activeMemoId)
  if (startIndex < 0) return memos

  return [...memos.slice(startIndex), ...memos.slice(0, startIndex)]
}

export function getMemoEntryLabel(id: string): string {
  const number = id.split('-')[1] || id
  return `记录 ${number.padStart(2, '0')}`
}
