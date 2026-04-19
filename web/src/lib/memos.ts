import { fallbackCards, type StillAliveCard, type StillAliveImage } from './constants'
import { pb } from './pocketbase'

const FALLBACK_IMAGE_TONE = '#c7c7cc'
const MEMOS_COLLECTION = 'memos'

type PocketBaseMemoRecord = {
  id: string
  text?: string
  location?: string
  images?: string[]
  created: string
}

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
  return fallbackCards.map(normalizeMemo)
}

function formatMemoTime(createdAt: string): string {
  const created = new Date(createdAt)
  const now = new Date()
  const diffMs = now.getTime() - created.getTime()
  const diffHours = Math.max(0, diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffHours / 24)

  if (diffHours < 24) return '24H内'
  if (diffDays < 7) return `${diffDays || 1}天前`

  const year = created.getFullYear()
  const month = String(created.getMonth() + 1).padStart(2, '0')
  const day = String(created.getDate()).padStart(2, '0')
  return `${year}.${month}.${day}`
}

function buildMemoImages(record: PocketBaseMemoRecord): StillAliveImage[] {
  const files = record.images || []

  return files.map((file, index) => ({
    src: pb.files.getURL(record as never, file),
    alt: `${record.location || '未命名地点'}的记录图片 ${index + 1}`,
    tone: FALLBACK_IMAGE_TONE,
  }))
}

function mapPocketBaseMemo(record: PocketBaseMemoRecord): StillAliveCard {
  return normalizeMemo({
    id: record.id,
    text: record.text || '',
    location: record.location || '未标注',
    time: formatMemoTime(record.created),
    images: buildMemoImages(record),
  })
}

export async function fetchPublishedMemos(): Promise<StillAliveCard[]> {
  try {
    const records = await pb.collection(MEMOS_COLLECTION).getFullList<PocketBaseMemoRecord>({
      sort: '-created',
      filter: 'status = "published"',
    })

    if (records.length === 0) return []
    return records.map(mapPocketBaseMemo)
  } catch (error) {
    console.warn('Failed to load memos from PocketBase, falling back to local data.', error)
    return getPublishedMemos()
  }
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
