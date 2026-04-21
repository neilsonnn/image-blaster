export interface WorldAssets {
  mesh: { collider_mesh_url: string }
  imagery: { pano_url: string }
  splats: {
    spz_urls: {
      '500k'?: string
      '100k'?: string
      '150k'?: string
      full_res?: string
    }
    semantics_metadata: {
      metric_scale_factor: number
      ground_plane_offset: number
    }
  }
  thumbnail_url: string
  caption: string
}

export interface World {
  world_id: string
  display_name: string
  assets: WorldAssets
  world_marble_url: string
  tags: string[] | null
  world_prompt: string | null
  created_at: string | null
  updated_at: string | null
}

export interface WorldEntry {
  slug: string
  world: World
}
