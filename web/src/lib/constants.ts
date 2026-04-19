export type StillAliveImage = {
  src: string
  alt: string
  tone: string
}

export type StillAliveCard = {
  id: string
  time: string
  location: string
  text: string
  images: StillAliveImage[]
}

export const fallbackCards: StillAliveCard[] = [
  {
    id: 'stillalive-1',
    time: '24H内',
    location: '杭州',
    text: '最近还没来得及整理成完整段落，但这些零碎现场已经足够说明，我这阵子一直在路上。',
    images: [
      { src: '/images/stillalive-1-a.svg', alt: '路上的片段', tone: '#d8c5a3' },
      { src: '/images/stillalive-1-b.svg', alt: '近期记录的视觉片段', tone: '#b58b62' },
      { src: '/images/stillalive-1-c.svg', alt: '未整理的现场记录', tone: '#6b3f32' },
    ],
  },
  {
    id: 'stillalive-2',
    time: '12天前',
    location: '上海',
    text: '把最近路上的几个小片段收在一起，像给这段时间留一个轻一点的记号。',
    images: [
      { src: '/images/stillalive-2-a.svg', alt: '上海路上的小片段', tone: '#d7c1a3' },
      { src: '/images/stillalive-2-b.svg', alt: '轻量的时间记号', tone: '#8f7359' },
    ],
  },
  {
    id: 'stillalive-3',
    time: '2026.04.10',
    location: '武汉',
    text: '有些东西先不急着讲完整，先让它们留在这里，等以后回头再慢慢辨认。',
    images: [
      { src: '/images/stillalive-3-a.svg', alt: '武汉的一则记录', tone: '#b9c0a6' },
    ],
  },
  {
    id: 'stillalive-4',
    time: '2026.03.15',
    location: '苏州',
    text: '一些过去的痕迹，埋在深处。一切都在变，但我还在。',
    images: [],
  },
]
