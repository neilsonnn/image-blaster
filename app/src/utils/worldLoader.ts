import worlds from 'virtual:worlds'
import type { World, WorldEntry } from '../types/world'

export function loadWorlds(): WorldEntry[] {
  return worlds as WorldEntry[]
}

export function getSplatUrl(world: World): string {
  const urls = world.assets.splats.spz_urls
  return urls['500k'] ?? urls['150k'] ?? urls['100k'] ?? urls.full_res ?? ''
}
