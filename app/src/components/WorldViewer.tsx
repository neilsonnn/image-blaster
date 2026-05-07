import { Component, Suspense, useRef, useEffect, useState, type ReactNode } from 'react'
import { Tooltip } from '@radix-ui/themes'
import { ArrowsClockwiseIcon, CaretDownIcon, CaretUpIcon, ImageIcon } from '@phosphor-icons/react'
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
import { WorldRenderMode, ObjectRenderMode, ViewerQuality, type Vec3Tuple, type World, type WorldObjectAsset, type WorldSceneProject } from '../types/world'
import { AppButton } from './AppButton'
import { chrome } from './AppChrome'

type CharHandle = CharacterControllerHandle | FlyControllerHandle
type SourcePreviewMode = 'source' | 'plate'
const DEFAULT_ENVIRONMENT_URL = '/hdri.jpg'

function sunPositionFromRotation(rotation: Vec3Tuple): Vec3Tuple {
  let x = 0
  let y = 10
  let z = 0
  const [rx, ry, rz] = rotation
  const cx = Math.cos(rx)
  const sx = Math.sin(rx)
  const cy = Math.cos(ry)
  const sy = Math.sin(ry)
  const cz = Math.cos(rz)
  const sz = Math.sin(rz)

  ;[y, z] = [y * cx - z * sx, y * sx + z * cx]
  ;[x, z] = [x * cy + z * sy, -x * sy + z * cy]
  ;[x, y] = [x * cz - y * sz, x * sz + y * cz]

  return [x, y, z]
}

interface OptionalAssetBoundaryProps {
  label: string
  resetKey: string
  fallback?: ReactNode
  children: ReactNode
}

interface OptionalAssetBoundaryState {
  hasError: boolean
}

class OptionalAssetBoundary extends Component<OptionalAssetBoundaryProps, OptionalAssetBoundaryState> {
  state: OptionalAssetBoundaryState = { hasError: false }

  static getDerivedStateFromError(): OptionalAssetBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    console.warn(`Skipping optional world asset "${this.props.label}" because it failed to load.`, error)
  }

  componentDidUpdate(prevProps: OptionalAssetBoundaryProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false })
    }
  }

  render() {
    if (this.state.hasError) return this.props.fallback ?? null
    return this.props.children
  }
}

function GrayEnvironmentFallback() {
  return (
    <>
      <color attach="background" args={['#6b7280']} />
      <ambientLight color="#ffffff" intensity={0.9} />
    </>
  )
}

function DefaultEnvironment({ intensity }: { intensity: number }) {
  return (
    <OptionalAssetBoundary label={DEFAULT_ENVIRONMENT_URL} resetKey={DEFAULT_ENVIRONMENT_URL} fallback={<GrayEnvironmentFallback />}>
      <Suspense fallback={null}>
        <EnvironmentMap panoUrl={DEFAULT_ENVIRONMENT_URL} intensity={intensity} />
      </Suspense>
    </OptionalAssetBoundary>
  )
}

interface Props {
  world: World
  slug: string
  sourceImageUrl?: string
  plateImageUrl?: string
  objectAssets: WorldObjectAsset[]
  allObjectAssets: WorldObjectAsset[]
  worldSfxUrls: string[]
  sceneProject?: WorldSceneProject
  sceneProjectReady?: boolean
  hoveredObjectAssetId?: string | null
  hoveredObjectInstanceId?: string | null
  editing?: boolean
  uiVisible?: boolean
  onObjectHover?: (asset: WorldObjectAsset, hovering: boolean, instanceId?: string) => void
  onSceneProjectSaved?: (project: WorldSceneProject) => void
  onRefreshWorlds?: () => void
  refreshingWorlds?: boolean
}

export function WorldViewer({
  world: desiredWorld,
  slug: desiredSlug,
  sourceImageUrl,
  plateImageUrl,
  objectAssets: desiredObjectAssets,
  allObjectAssets,
  worldSfxUrls,
  sceneProject,
  sceneProjectReady = true,
  hoveredObjectAssetId,
  hoveredObjectInstanceId,
  editing = false,
  uiVisible = true,
  onObjectHover,
  onSceneProjectSaved,
  onRefreshWorlds,
  refreshingWorlds = false,
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
  const [sourceThumbnailCollapsed, setSourceThumbnailCollapsed] = useState(false)
  const [sourcePreviewMode, setSourcePreviewMode] = useState<SourcePreviewMode>('source')
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

  useEffect(() => {
    if (!plateImageUrl && sourcePreviewMode === 'plate') setSourcePreviewMode('source')
  }, [plateImageUrl, sourcePreviewMode])

  const splatUrl = getSplatUrl(desiredWorld)
  const { ground_plane_offset, flip_y, metric_scale_factor } = desiredWorld.assets.splats.semantics_metadata
  const flipY = flip_y ?? true
  const baseMetricScaleFactor = metric_scale_factor ?? 1
  const isHighQuality = viewerQuality === ViewerQuality.High
  const showScene = worldRenderMode !== WorldRenderMode.ObjectOnly
  const showSplat = showScene && objectRenderMode === ObjectRenderMode.Lit
  const showObjects = worldRenderMode !== WorldRenderMode.SplatOnly
  const activeSourceImageUrl = sourcePreviewMode === 'plate' && plateImageUrl ? plateImageUrl : sourceImageUrl
  const placementEditor = usePlacementEditor({
    slug: desiredSlug,
    objects: desiredObjectAssets,
    allObjectAssets,
    sceneProject,
    baseMetricScaleFactor,
    sceneProjectReady,
    editing,
    hoveredObjectAssetId,
    hoveredObjectInstanceId,
    onObjectHover,
    onProjectSaved: onSceneProjectSaved,
  })
  const activeSceneSun = editing ? placementEditor.sun : sceneProject?.sun
  const activeSunIntensity = activeSceneSun?.intensity ?? sunIntensity
  const activeEnvironmentIntensity = activeSceneSun?.environmentIntensity ?? environmentIntensity
  const activeSunPosition = sunPositionFromRotation(activeSceneSun?.rotation ?? [0, 0, 0])
  const activeMetricScaleFactor = editing ? placementEditor.metricScaleFactor : sceneProject?.metricScaleFactor ?? baseMetricScaleFactor
  const activeGroundPlaneOffset = ground_plane_offset * (activeMetricScaleFactor / baseMetricScaleFactor)
  const objectPlacements = sceneProject?.instances ?? placementEditor.instances
  const objectPhysicsAssets = sceneProject?.instances.length ? allObjectAssets : desiredObjectAssets
  const activeControllerMode = editing ? 'fly' : controllerMode
  const hoveredObjectAsset = hoveredObjectAssetId
    ? allObjectAssets.find((asset) => asset.assetId === hoveredObjectAssetId)
      ?? desiredObjectAssets.find((asset) => asset.assetId === hoveredObjectAssetId)
    : undefined
  const activePreviewImageUrl = hoveredObjectAsset?.referenceImageUrl ?? hoveredObjectAsset?.thumbnailUrl ?? activeSourceImageUrl
  const activePreviewAlt = hoveredObjectAsset
    ? `${hoveredObjectAsset.name} reference image`
    : sourcePreviewMode === 'plate' && plateImageUrl
      ? 'World generation plate'
      : 'Original source'
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
          <Physics key={`${desiredSlug}:${controllerResetToken}`} gravity={[0, -9.81, 0]}>
            {activeControllerMode === 'fly' ? (
              <FlyController ref={charRef as React.RefObject<FlyControllerHandle>} preserveCameraOnMount={editing} />
            ) : (
              <CharacterController ref={charRef as React.RefObject<CharacterControllerHandle>} />
            )}
            {showScene && colliderUrl && (
              <OptionalAssetBoundary label={colliderUrl} resetKey={colliderUrl}>
                <Suspense fallback={null}>
                  <WorldCollider
                    url={colliderUrl}
                    flipY={flipY}
                    groundPlaneOffset={activeGroundPlaneOffset}
                    metricScaleFactor={activeMetricScaleFactor}
                    sunIntensity={activeSunIntensity}
                  />
                </Suspense>
              </OptionalAssetBoundary>
            )}
            {showObjects && !editing && (
              <Suspense fallback={null}>
                <ObjectGrid
                  objects={objectPhysicsAssets}
                  placements={objectPlacements}
                  hoveredObjectAssetId={hoveredObjectAssetId}
                  hoveredObjectInstanceId={hoveredObjectInstanceId}
                />
              </Suspense>
            )}
            {showObjects && editing && (
              <Suspense fallback={null}>
                <PlacementEditorScene controller={placementEditor} renderMode={objectRenderMode} />
              </Suspense>
            )}
            <GroundPlane sunIntensity={activeSunIntensity} />
          </Physics>
          {splatUrl && (
            <OptionalAssetBoundary label={splatUrl} resetKey={splatUrl}>
              <SplatRenderer
                url={splatUrl}
                visible={showSplat}
                groundPlaneOffset={activeGroundPlaneOffset}
                flipY={flipY}
                metricScaleFactor={activeMetricScaleFactor}
              />
            </OptionalAssetBoundary>
          )}
          <directionalLight
            castShadow={isHighQuality && activeSunIntensity > 0}
            color={sunColor}
            intensity={activeSunIntensity}
            position={activeSunPosition}
            shadow-mapSize={[2048, 2048]}
            shadow-bias={-0.0001}
            shadow-normalBias={0.02}
            shadow-camera-near={0.5}
            shadow-camera-far={30}
            shadow-camera-left={-20}
            shadow-camera-right={20}
            shadow-camera-top={20}
            shadow-camera-bottom={-20}
          />
          {panoUrl && (
            <OptionalAssetBoundary label={panoUrl} resetKey={panoUrl} fallback={<DefaultEnvironment intensity={activeEnvironmentIntensity} />}>
              <Suspense fallback={null}>
                <EnvironmentMap panoUrl={panoUrl} intensity={activeEnvironmentIntensity} />
              </Suspense>
            </OptionalAssetBoundary>
          )}
          {!panoUrl && <DefaultEnvironment intensity={activeEnvironmentIntensity} />}
          {butterfliesEnabled && <ButterflyScene />}
          <OriginHelper />
          {isHighQuality && <PostProcessing />}
        </Suspense>
      </Canvas>
      {uiVisible && (
        <SourceImageControls
          activeSourceImageUrl={activePreviewImageUrl}
          previewMode={sourcePreviewMode}
          previewAlt={activePreviewAlt}
          plateImageUrl={plateImageUrl}
          objectPreviewActive={Boolean(hoveredObjectAsset)}
          thumbnailCollapsed={sourceThumbnailCollapsed}
          refreshingWorlds={refreshingWorlds}
          onRefreshWorlds={onRefreshWorlds}
          onPreviewModeToggle={() => setSourcePreviewMode((mode) => mode === 'source' ? 'plate' : 'source')}
          onThumbnailCollapseToggle={() => setSourceThumbnailCollapsed((collapsed) => !collapsed)}
        />
      )}
      {editing && uiVisible && <PlacementEditorOverlay controller={placementEditor} />}
    </>
  )
}

function SourceImageControls({
  activeSourceImageUrl,
  previewMode,
  previewAlt,
  plateImageUrl,
  objectPreviewActive,
  thumbnailCollapsed,
  refreshingWorlds,
  onRefreshWorlds,
  onPreviewModeToggle,
  onThumbnailCollapseToggle,
}: {
  activeSourceImageUrl?: string
  previewMode: SourcePreviewMode
  previewAlt: string
  plateImageUrl?: string
  objectPreviewActive: boolean
  thumbnailCollapsed: boolean
  refreshingWorlds: boolean
  onRefreshWorlds?: () => void
  onPreviewModeToggle: () => void
  onThumbnailCollapseToggle: () => void
}) {
  if (!activeSourceImageUrl && !import.meta.env.DEV) return null

  return (
    <div className={`pointer-events-none fixed bottom-2 right-2 z-30 hidden md:block ${chrome.enter}`}>
      {activeSourceImageUrl ? (
        thumbnailCollapsed ? (
          <div className="flex items-center gap-1">
            {import.meta.env.DEV && onRefreshWorlds && (
              <RefreshWorldsButton
                refreshing={refreshingWorlds}
                onRefresh={onRefreshWorlds}
                className="pointer-events-auto"
              />
            )}
            <SourceThumbnailCollapseButton
              collapsed={thumbnailCollapsed}
              onToggle={onThumbnailCollapseToggle}
              className="pointer-events-auto"
            />
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-lg border border-white/15 bg-black/70 shadow-lg ring-1 ring-black/30 backdrop-blur-md">
            <img
              src={activeSourceImageUrl}
              alt={previewAlt}
              className="block w-96 object-cover"
              draggable={false}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30" />
            <div className="absolute bottom-0.5 right-0.5 flex items-center gap-1">
              {import.meta.env.DEV && onRefreshWorlds && (
                <RefreshWorldsButton
                  refreshing={refreshingWorlds}
                  onRefresh={onRefreshWorlds}
                  className="pointer-events-auto"
                />
              )}
              {!objectPreviewActive && (
                <SourcePlateToggleButton
                  mode={previewMode}
                  plateAvailable={Boolean(plateImageUrl)}
                  onToggle={onPreviewModeToggle}
                  className="pointer-events-auto"
                />
              )}
              <SourceThumbnailCollapseButton
                collapsed={thumbnailCollapsed}
                onToggle={onThumbnailCollapseToggle}
                className="pointer-events-auto"
              />
            </div>
          </div>
        )
      ) : (
        import.meta.env.DEV && onRefreshWorlds && (
          <RefreshWorldsButton
            refreshing={refreshingWorlds}
            onRefresh={onRefreshWorlds}
            className="pointer-events-auto"
          />
        )
      )}
    </div>
  )
}

function SourceThumbnailCollapseButton({
  collapsed,
  onToggle,
  className = '',
}: {
  collapsed: boolean
  onToggle: () => void
  className?: string
}) {
  const Icon = collapsed ? CaretUpIcon : CaretDownIcon

  return (
    <Tooltip
      content={collapsed ? 'show original source image' : 'collapse original source image'}
      delayDuration={0}
      side="top"
    >
      <AppButton
        onClick={onToggle}
        className={`h-6 w-6 justify-center rounded border border-white/15 bg-black/70 p-0 text-white opacity-70 shadow-lg backdrop-blur-md ${className}`}
        aria-label={collapsed ? 'Show original source image' : 'Collapse original source image'}
        aria-pressed={collapsed}
      >
        <Icon size={15} weight="bold" />
      </AppButton>
    </Tooltip>
  )
}

function SourcePlateToggleButton({
  mode,
  plateAvailable,
  onToggle,
  className = '',
}: {
  mode: SourcePreviewMode
  plateAvailable: boolean
  onToggle: () => void
  className?: string
}) {
  const nextMode = mode === 'source' ? 'plate' : 'source'
  const disabled = mode === 'source' && !plateAvailable
  const label = mode === 'source' ? 'Source' : 'Plate'
  return (
    <Tooltip
      content={disabled ? 'No plate image found for this world version' : `Show ${nextMode}`}
      delayDuration={0}
      side="top"
    >
      <button
        type="button"
        disabled={disabled}
        onClick={onToggle}
        className={`h-6 rounded border border-white/15 flex items-center gap-1 bg-black/70 px-1.5 font-mono text-[10px] tracking-wide text-white/80 shadow-lg backdrop-blur-md transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:text-white/25 disabled:hover:bg-black/70 ${className}`}
        aria-label={`Showing ${label}. Toggle source or plate preview.`}
        aria-pressed={mode === 'plate'}
      >
        <ImageIcon size={14} weight="regular" />
        {label}
      </button>
    </Tooltip>
  )
}

function RefreshWorldsButton({
  refreshing,
  onRefresh,
  className = '',
}: {
  refreshing: boolean
  onRefresh: () => void
  className?: string
}) {
  return (
    <Tooltip
      content={refreshing ? 'refreshing local assets' : 'refresh local assets'}
      delayDuration={0}
      side="top"
    >
      <AppButton
        onClick={onRefresh}
        active={refreshing}
        className={`h-6 w-6 justify-center rounded border border-white/15 bg-black/70 p-0 text-white shadow-lg backdrop-blur-md ${className}`}
        aria-label="Refresh local assets"
      >
        <ArrowsClockwiseIcon size={12} weight={refreshing ? 'bold' : 'regular'} />
      </AppButton>
    </Tooltip>
  )
}
