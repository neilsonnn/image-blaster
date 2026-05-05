import { Suspense, useRef, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { SplatRenderer } from '../modules/splat/SplatRenderer'
import { EnvironmentMap } from '../modules/environment/EnvironmentMap'
import { WorldCollider } from '../modules/collider/WorldCollider'
import { GroundPlane } from '../modules/collider/GroundPlane'
import { CharacterController, type CharacterControllerHandle } from '../modules/character/CharacterController'
import { FlyController, type FlyControllerHandle } from '../modules/character/FlyController'
import { ButterflyScene } from '../modules/butterfly/ButterflyScene'
import { ObjectGrid } from '../modules/scene/ObjectGrid'
import { PlacementEditorOverlay, PlacementEditorScene, usePlacementEditor } from '../modules/scene/PlacementEditor'
import { OriginHelper } from '../modules/scene/OriginHelper'
import { AudioManager } from '../modules/audio/AudioManager'
import { PostProcessing } from '../modules/postprocessing/PostProcessing'
import { getSplatUrl } from '../utils/worldLoader'
import { useDebugStore } from '../store/debug'
import { WorldRenderMode, ObjectRenderMode, ViewerQuality, type World, type WorldObjectAsset, type WorldSceneProject } from '../types/world'

type CharHandle = CharacterControllerHandle | FlyControllerHandle

interface Props {
  world: World
  slug: string
  objectAssets: WorldObjectAsset[]
  allObjectAssets: WorldObjectAsset[]
  worldSfxUrls: string[]
  sceneProject?: WorldSceneProject
  sceneProjectReady?: boolean
  editing?: boolean
  onSceneProjectSaved?: (project: WorldSceneProject) => void
}

export function WorldViewer({
  world: desiredWorld,
  slug: desiredSlug,
  objectAssets: desiredObjectAssets,
  allObjectAssets,
  worldSfxUrls,
  sceneProject,
  sceneProjectReady = true,
  editing = false,
  onSceneProjectSaved,
}: Props) {
  const charRef = useRef<CharHandle>(null)
  const worldRenderMode = useDebugStore((s) => s.worldRenderMode)
  const objectRenderMode = useDebugStore((s) => s.objectRenderMode)
  const viewerQuality = useDebugStore((s) => s.viewerQuality)
  const controllerMode = useDebugStore((s) => s.controllerMode)
  const butterfliesEnabled = useDebugStore((s) => s.butterfliesEnabled)
  const controllerResetToken = useDebugStore((s) => s.controllerResetToken)
  const environmentIntensity = useDebugStore((s) => s.environmentIntensity)
  const sunIntensity = useDebugStore((s) => s.sunIntensity)
  const sunColor = useDebugStore((s) => s.sunColor)
  const colliderUrl = desiredWorld.assets.mesh.collider_mesh_url.startsWith('/worlds/')
    ? desiredWorld.assets.mesh.collider_mesh_url
    : ''
  const panoUrl = desiredWorld.assets.imagery.pano_url.startsWith('/worlds/')
    ? desiredWorld.assets.imagery.pano_url
    : ''

  useEffect(() => {
    charRef.current?.reset()
  }, [desiredSlug])

  useEffect(() => {
    if (controllerResetToken > 0) charRef.current?.reset()
  }, [controllerResetToken])

  const splatUrl = getSplatUrl(desiredWorld)
  const { ground_plane_offset, flip_y, metric_scale_factor } = desiredWorld.assets.splats.semantics_metadata
  const flipY = flip_y ?? true
  const isHighQuality = viewerQuality === ViewerQuality.High
  const showScene = worldRenderMode !== WorldRenderMode.ObjectOnly
  const showSplat = showScene && objectRenderMode === ObjectRenderMode.Lit
  const showObjects = worldRenderMode !== WorldRenderMode.SplatOnly
  const placementEditor = usePlacementEditor({
    slug: desiredSlug,
    objects: desiredObjectAssets,
    allObjectAssets,
    sceneProject,
    sceneProjectReady,
    editing,
    onProjectSaved: onSceneProjectSaved,
  })
  const objectPlacements = sceneProject?.instances ?? placementEditor.instances
  const objectPhysicsAssets = sceneProject?.instances.length ? allObjectAssets : desiredObjectAssets
  return (
    <>
      <Canvas
        camera={{ fov: 75, near: 0.1, far: 1000 }}
        className="w-full h-full"
        gl={{ antialias: false }}
        shadows={isHighQuality}
      >
        <Suspense fallback={null}>
          <AudioManager urls={worldSfxUrls} />
          <Physics gravity={[0, -9.81, 0]}>
            {controllerMode === 'fly' ? (
              <FlyController ref={charRef as React.RefObject<FlyControllerHandle>} />
            ) : (
              <CharacterController ref={charRef as React.RefObject<CharacterControllerHandle>} />
            )}
            {showScene && (
              <Suspense fallback={null}>
                {colliderUrl && (
                  <WorldCollider url={colliderUrl} flipY={flipY} groundPlaneOffset={ground_plane_offset} metricScaleFactor={metric_scale_factor} />
                )}
              </Suspense>
            )}
            {showObjects && !editing && (
              <Suspense fallback={null}>
                <ObjectGrid objects={objectPhysicsAssets} placements={objectPlacements} />
              </Suspense>
            )}
            {showObjects && editing && (
              <Suspense fallback={null}>
                <PlacementEditorScene controller={placementEditor} renderMode={objectRenderMode} />
              </Suspense>
            )}
            <GroundPlane />
          </Physics>
          {splatUrl && (
            <SplatRenderer
              url={splatUrl}
              visible={showSplat}
              groundPlaneOffset={ground_plane_offset}
              flipY={flipY}
              metricScaleFactor={metric_scale_factor}
            />
          )}
          <directionalLight
            castShadow={isHighQuality}
            color={sunColor}
            intensity={sunIntensity}
            position={[0, 10, 0]}
            shadow-mapSize={[2048, 2048]}
            shadow-camera-near={0.5}
            shadow-camera-far={30}
            shadow-camera-left={-20}
            shadow-camera-right={20}
            shadow-camera-top={20}
            shadow-camera-bottom={-20}
          />
          {panoUrl && (
            <Suspense fallback={null}>
              <EnvironmentMap panoUrl={panoUrl} intensity={environmentIntensity} />
            </Suspense>
          )}
          {butterfliesEnabled && <ButterflyScene />}
          <OriginHelper />
          {isHighQuality && <PostProcessing />}
        </Suspense>
      </Canvas>
      {editing && <PlacementEditorOverlay controller={placementEditor} />}
    </>
  )
}
