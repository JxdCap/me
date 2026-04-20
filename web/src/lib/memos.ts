import { fallbackCards, type StillAliveCard, type StillAliveImage } from './constants'
import { pb } from './pocketbase'

const FALLBACK_IMAGE_TONE = '#c7c7cc'
const MEMOS_COLLECTION = 'memos'
const SHANGHAI_TIME_ZONE = 'Asia/Shanghai'

type PocketBaseMemoRecord = {
  id: string
  text?: string
  category?: string
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

function getShanghaiDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: SHANGHAI_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value || 0)

  return {
    year: getPart('year'),
    month: getPart('month'),
    day: getPart('day'),
    hour: getPart('hour'),
    minute: getPart('minute'),
    second: getPart('second'),
  }
}

function getShanghaiTimestamp(date: Date): number {
  const { year, month, day, hour, minute, second } = getShanghaiDateParts(date)
  return Date.UTC(year, month - 1, day, hour, minute, second)
}

function formatMemoTime(createdAt: string): string {
  const created = new Date(createdAt)
  const now = new Date()
  const diffMs = getShanghaiTimestamp(now) - getShanghaiTimestamp(created)
  const diffMinutes = Math.max(0, Math.floor(diffMs / (1000 * 60)))
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMinutes < 60) return `${Math.max(diffMinutes, 1)}分钟前`
  if (diffHours < 24) return `${Math.max(diffHours, 1)}小时前`
  if (diffDays <= 7) return `${Math.max(diffDays, 1)}天前`

  const { year, month, day, hour, minute } = getShanghaiDateParts(created)
  return `${year}.${String(month).padStart(2, '0')}.${String(day).padStart(2, '0')} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
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
    category: record.category || '记录',
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

export function getMemoEntryLabel(category: string, id: string): string {
  return `${category} ${id}`
}
