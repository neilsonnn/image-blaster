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
      flip_y?: boolean
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

export interface WorldObjectAsset {
  id: string
  name: string
  url: string
}

export interface WorldEntry {
  slug: string
  world: World
  objectAssets: WorldObjectAsset[]
}

export enum WorldRenderMode {
  SplatOnly = 'splat-only',
  ObjectOnly = 'object-only',
  Combined = 'combined',
}

export enum ObjectRenderMode {
  Lit = 'lit',
  Wireframe = 'wireframe',
  ShadedWireframe = 'shaded-wireframe',
}
