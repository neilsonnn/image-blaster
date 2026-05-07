import { describe, it, expect, vi } from 'vitest'
import { type WorldEntry } from '../types/world'

const exampleEntry: WorldEntry = {
  slug: 'example',
  objectAssets: [],
  allObjectAssets: [],
  worldSfxUrls: [],
  sourceImageVersions: [],
  world: {
    world_id: 'test-id',
    display_name: 'Example World',
    world_marble_url: '',
    tags: null,
    world_prompt: null,
    created_at: null,
    updated_at: null,
    assets: {
      imagery: { pano_url: '/worlds/example/output/world/0-world-pano.png' },
      mesh: { collider_mesh_url: '/worlds/example/output/world/0-world.glb' },
      splats: {
        spz_urls: {
          '500k': '/worlds/example/output/world/0-world-500k.spz',
          '150k': '/worlds/example/output/world/0-world-150k.spz',
        },
        semantics_metadata: { metric_scale_factor: 1.0, ground_plane_offset: 0.5 },
      },
      thumbnail_url: '/worlds/example/output/world/0-world-thumbnail.webp',
      caption: 'A test world',
    },
  },
  worldVersions: [{
    index: 0,
    label: 'v0',
    complete: true,
    world: {
      world_id: 'test-id',
      display_name: 'Example World',
      world_marble_url: '',
      tags: null,
      world_prompt: null,
      created_at: null,
      updated_at: null,
      assets: {
        imagery: { pano_url: '/worlds/example/output/world/0-world-pano.png' },
        mesh: { collider_mesh_url: '/worlds/example/output/world/0-world.glb' },
        splats: {
          spz_urls: {
            '500k': '/worlds/example/output/world/0-world-500k.spz',
            '150k': '/worlds/example/output/world/0-world-150k.spz',
          },
          semantics_metadata: { metric_scale_factor: 1.0, ground_plane_offset: 0.5 },
        },
        thumbnail_url: '/worlds/example/output/world/0-world-thumbnail.webp',
        caption: 'A test world',
      },
    },
  }],
}

vi.mock('virtual:worlds', () => ({ default: [exampleEntry] }))

const { loadWorlds, fetchWorlds, getSplatUrl } = await import('./worldLoader')

describe('worldLoader', () => {
  it('returns WorldEntry array with correct slug', () => {
    const worlds = loadWorlds()
    expect(worlds).toHaveLength(1)
    expect(worlds[0].slug).toBe('example')
    expect(worlds[0].world.display_name).toBe('Example World')
  })

  it('fetches fresh world metadata in dev', async () => {
    const fetchedWorlds = [{ ...exampleEntry, slug: 'fresh-example' }]
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(fetchedWorlds),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchWorlds()).resolves.toEqual(fetchedWorlds)
    expect(fetchMock).toHaveBeenCalledWith('/__worlds', { cache: 'no-store' })

    vi.unstubAllGlobals()
  })

  it('getSplatUrl always uses full-res', () => {
    const world = {
      ...exampleEntry.world,
      assets: {
        ...exampleEntry.world.assets,
        splats: {
          ...exampleEntry.world.assets.splats,
          spz_urls: {
            ...exampleEntry.world.assets.splats.spz_urls,
            full_res: '/worlds/example/output/world/0-world-full_res.spz',
          },
        },
      },
    }
    const url = getSplatUrl(world)
    expect(url).toBe('/worlds/example/output/world/0-world-full_res.spz')
  })

  it('getSplatUrl returns empty when full-res is absent', () => {
    expect(getSplatUrl(exampleEntry.world)).toBe('')
  })

  it('getSplatUrl ignores non-full-res splats', () => {
    const world = {
      ...exampleEntry.world,
      assets: {
        ...exampleEntry.world.assets,
        splats: {
          ...exampleEntry.world.assets.splats,
          spz_urls: { '150k': '/worlds/example/output/world/0-world-150k.spz' },
        },
      },
    }
    expect(getSplatUrl(world)).toBe('')
  })

  it('getSplatUrl refuses provider URLs', () => {
    const world = {
      ...exampleEntry.world,
      assets: {
        ...exampleEntry.world.assets,
        splats: {
          ...exampleEntry.world.assets.splats,
          spz_urls: { full_res: 'https://cdn.example.com/splat_full.spz' },
        },
      },
    }
    expect(getSplatUrl(world)).toBe('')
  })
})
