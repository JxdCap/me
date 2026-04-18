export type StillAliveCard = {
  id: string
  time: string
  location: string
  text: string
  images: string[]
}

export const cards: StillAliveCard[] = [
  {
    id: 'stillalive-1',
    time: '24H内',
    location: '杭州',
    text: '最近还没来得及整理成完整段落，但这些零碎现场已经足够说明，我这阵子一直在路上。',
    images: [
      '/images/stillalive-1-a.svg',
      '/images/stillalive-1-b.svg',
      '/images/stillalive-1-c.svg',
    ],
  },
  {
    id: 'stillalive-2',
    time: '12天前',
    location: '上海',
    text: '把最近路上的几个小片段收在一起，像给这段时间留一个轻一点的记号。',
    images: ['/images/stillalive-2-a.svg', '/images/stillalive-2-b.svg'],
  },
  {
    id: 'stillalive-3',
    time: '2026.04.10',
    location: '武汉',
    text: '有些东西先不急着讲完整，先让它们留在这里，等以后回头再慢慢辨认。',
    images: ['/images/stillalive-3-a.svg'],
  },
  {
    id: 'stillalive-4',
    time: '2026.03.15',
    location: '苏州',
    text: '一些过去的痕迹，埋在深处。一切都在变，但我还在。',
    images: [],
  },
]
