import PocketBase from 'pocketbase'

const DEFAULT_POCKETBASE_URL = 'https://a.ithe.cn'

export const pb = new PocketBase(
  import.meta.env.VITE_POCKETBASE_URL || DEFAULT_POCKETBASE_URL
)

