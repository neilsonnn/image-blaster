import worlds from 'virtual:worlds'
import { type World, type WorldEntry } from '../types/world'

export function loadWorlds(): WorldEntry[] {
  return worlds as WorldEntry[]
}

function localWorldAssetUrl(url: string | undefined): string {
  return url?.startsWith('/worlds/') ? url : ''
}

export function getSplatUrl(world: World): string {
  const urls = world.assets.splats.spz_urls
  return localWorldAssetUrl(urls.full_res)
}
