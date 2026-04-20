import {
  fallbackCards,
  MEMO_CATEGORIES,
  type MemoCategory,
  type StillAliveCard,
  type StillAliveMedia,
} from './constants'
import { pb } from './pocketbase'

const FALLBACK_IMAGE_TONE = '#c7c7cc'
const MEMOS_COLLECTION = 'memos'
const SHANGHAI_TIME_ZONE = 'Asia/Shanghai'
const CARD_IMAGE_THUMB = '228x304'
const READER_IMAGE_THUMB = '800x600f'
const DEFAULT_MEMO_CATEGORY: MemoCategory = '碎语'
const VIDEO_FILE_EXTENSIONS = new Set(['mp4', 'mov', 'm4v', 'webm'])
const IMAGE_FILE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'heic', 'svg'])

type PocketBaseMemoRecord = {
  id: string
  text?: string
  category?: string
  location?: string
  media?: string[]
  created: string
}

function getFileExtension(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() || ''
}

function getMediaType(fileName: string): StillAliveMedia['type'] {
  const extension = getFileExtension(fileName)
  if (VIDEO_FILE_EXTENSIONS.has(extension)) return 'video'
  if (IMAGE_FILE_EXTENSIONS.has(extension)) return 'image'
  return 'image'
}

function normalizeMedia(media: StillAliveMedia, memo: StillAliveCard, index: number): StillAliveMedia {
  return {
    type: media.type === 'video' ? 'video' : 'image',
    src: media.src,
    cardSrc: media.cardSrc || media.posterSrc || media.src,
    readerSrc: media.readerSrc || media.posterSrc || media.src,
    fullSrc: media.fullSrc || media.src,
    posterSrc: media.posterSrc,
    duration: media.duration,
    alt: media.alt || `${memo.location}的媒体 ${index + 1}`,
    tone: media.tone || FALLBACK_IMAGE_TONE,
  }
}

export function normalizeMemoCategory(category?: string | null): MemoCategory {
  if (!category) return DEFAULT_MEMO_CATEGORY
  return MEMO_CATEGORIES.includes(category as MemoCategory)
    ? (category as MemoCategory)
    : DEFAULT_MEMO_CATEGORY
}

export function normalizeMemo(memo: StillAliveCard): StillAliveCard {
  const media = Array.isArray(memo.media) ? memo.media : []

  return {
    ...memo,
    media: media.map((item, index) => normalizeMedia(item, memo, index)),
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

function buildMemoMedia(record: PocketBaseMemoRecord): StillAliveMedia[] {
  const files = Array.isArray(record.media) ? record.media.filter(Boolean) : []

  return files.map((file, index) => {
    const type = getMediaType(file)
    const fileUrl = pb.files.getURL(record as never, file)

    return {
      type,
      src: fileUrl,
      cardSrc: type === 'image'
        ? pb.files.getURL(record as never, file, { thumb: CARD_IMAGE_THUMB })
        : fileUrl,
      readerSrc: type === 'image'
        ? pb.files.getURL(record as never, file, { thumb: READER_IMAGE_THUMB })
        : fileUrl,
      fullSrc: fileUrl,
      alt: `${record.location || '未命名地点'}的媒体 ${index + 1}`,
      tone: FALLBACK_IMAGE_TONE,
    }
  })
}

function mapPocketBaseMemo(record: PocketBaseMemoRecord): StillAliveCard {
  return normalizeMemo({
    id: record.id,
    category: normalizeMemoCategory(record.category),
    text: record.text || '',
    location: record.location || '未标注',
    time: formatMemoTime(record.created),
    media: buildMemoMedia(record),
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
