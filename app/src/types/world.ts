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
  assetId: string
  sourceWorldSlug: string
  baseObjectId: string
  index?: number
  variantLabel?: string
  fileName?: string
  name: string
  url: string
  thumbnailUrl?: string
  sfxUrls: string[]
}

export type Vec3Tuple = [number, number, number]
export type WorldObjectPhysics = 'rigidbody' | 'static'

export interface WorldObjectPlacement {
  instanceId: string
  objectId: string
  assetId?: string
  physics?: WorldObjectPhysics
  position: Vec3Tuple
  rotation: Vec3Tuple
  scale: Vec3Tuple
}

export interface WorldSceneProject {
  version: 1
  instances: WorldObjectPlacement[]
}

export interface WorldVersion {
  index: number
  label: string
  world: World
  complete: boolean
}

export interface SourceImageVersion {
  url: string
  label: string
  fileName: string
  index?: number
}

export interface WorldEntry {
  slug: string
  world: World
  worldVersions: WorldVersion[]
  objectAssets: WorldObjectAsset[]
  allObjectAssets: WorldObjectAsset[]
  sourceImageUrl?: string
  sourceImageVersions: SourceImageVersion[]
  worldSfxUrls: string[]
  sceneProject?: WorldSceneProject
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

export enum ViewerQuality {
  Low = 'low',
  High = 'high',
}
