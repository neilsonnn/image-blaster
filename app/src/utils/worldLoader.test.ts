import { describe, it, expect, vi } from 'vitest'
import type { WorldEntry } from '../types/world'

const exampleEntry: WorldEntry = {
  slug: 'example',
  world: {
    world_id: 'test-id',
    display_name: 'Example World',
    world_marble_url: '',
    tags: null,
    world_prompt: null,
    created_at: null,
    updated_at: null,
    assets: {
      imagery: { pano_url: 'https://cdn.example.com/pano.png' },
      mesh: { collider_mesh_url: 'https://cdn.example.com/collider.glb' },
      splats: {
        spz_urls: {
          '500k': 'https://cdn.example.com/splat_500k.spz',
          '150k': 'https://cdn.example.com/splat_150k.spz',
        },
        semantics_metadata: { metric_scale_factor: 1.0, ground_plane_offset: 0.5 },
      },
      thumbnail_url: 'https://cdn.example.com/thumb.webp',
      caption: 'A test world',
    },
  },
}

vi.mock('virtual:worlds', () => ({ default: [exampleEntry] }))

const { loadWorlds, getSplatUrl } = await import('./worldLoader')

describe('worldLoader', () => {
  it('returns WorldEntry array with correct slug', () => {
    const worlds = loadWorlds()
    expect(worlds).toHaveLength(1)
    expect(worlds[0].slug).toBe('example')
    expect(worlds[0].world.display_name).toBe('Example World')
  })

  it('getSplatUrl prefers 500k', () => {
    const url = getSplatUrl(exampleEntry.world)
    expect(url).toBe('https://cdn.example.com/splat_500k.spz')
  })

  it('getSplatUrl falls back to 150k when 500k absent', () => {
    const world = {
      ...exampleEntry.world,
      assets: {
        ...exampleEntry.world.assets,
        splats: {
          ...exampleEntry.world.assets.splats,
          spz_urls: { '150k': 'https://cdn.example.com/splat_150k.spz' },
        },
      },
    }
    expect(getSplatUrl(world)).toBe('https://cdn.example.com/splat_150k.spz')
  })
})
