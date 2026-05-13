import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { useRoute, useLocation, Redirect } from 'wouter'
import { WorldViewer } from './components/WorldViewer'
import { WorldSidebar } from './components/WorldSidebar'
import { BottomLeftControls } from './components/BottomLeftControls'
import { TouchControls } from './components/TouchControls'
import { useSceneProject } from './modules/scene/useSceneProject'
import { fetchWorlds, loadWorlds } from './utils/worldLoader'
import { useDebugStore } from './store/debug'
import { isEditableTarget } from './utils/dom'
import type { WorldEntry, WorldHoverPreview, WorldObjectAsset } from './types/world'

const LevaPanel = import.meta.env.DEV
  ? lazy(() => import('leva').then((module) => ({ default: module.Leva })))
  : null
const DebugPanel = import.meta.env.DEV
  ? lazy(() => import('./components/DebugPanel').then((module) => ({ default: module.DebugPanel })))
  : null

export function App() {
  const [worlds, setWorlds] = useState(loadWorlds)
  const [refreshingWorlds, setRefreshingWorlds] = useState(false)
  const refreshTimeoutRef = useRef<number | undefined>(undefined)

  const refreshWorlds = useCallback(async () => {
    if (!import.meta.env.DEV) return
    setRefreshingWorlds(true)
    try {
      setWorlds(await fetchWorlds())
    } catch (error) {
      console.warn('Could not refresh local world assets.', error)
    } finally {
      setRefreshingWorlds(false)
    }
  }, [])

  useEffect(() => {
    refreshWorlds()
  }, [refreshWorlds])

  useEffect(() => {
    if (!import.meta.env.DEV) return

    const refreshSoon = () => {
      window.clearTimeout(refreshTimeoutRef.current)
      refreshTimeoutRef.current = window.setTimeout(() => {
        void refreshWorlds()
      }, 150)
    }

    import.meta.hot?.on('worlds-changed', refreshSoon)
    return () => {
      window.clearTimeout(refreshTimeoutRef.current)
      import.meta.hot?.off('worlds-changed', refreshSoon)
    }
  }, [refreshWorlds])

  if (!worlds.length) {
    return (
      <div className="flex items-center justify-center h-screen text-white bg-black">
        No worlds found in worlds/
      </div>
    )
  }

  return (
    <LoadedApp
      worlds={worlds}
      refreshingWorlds={refreshingWorlds}
      onRefreshWorlds={refreshWorlds}
    />
  )
}

function LoadedApp({
  worlds,
  refreshingWorlds,
  onRefreshWorlds,
}: {
  worlds: WorldEntry[]
  refreshingWorlds: boolean
  onRefreshWorlds: () => void
}) {
  const [editMatch, editParams] = useRoute('/:slug/edit')
  const [match, params] = useRoute('/:slug')
  const levaCollapsed = useDebugStore((s) => s.levaCollapsed)
  const setLevaCollapsed = useDebugStore((s) => s.setLevaCollapsed)
  const [location] = useLocation()
  const [uiHidden, setUiHidden] = useState(false)
  const [sceneProjectEnabled, setSceneProjectEnabled] = useState(true)
  const [selectedWorldVersions, setSelectedWorldVersions] = useState<Record<string, number>>({})
  const [hoveredObjectAssetId, setHoveredObjectAssetId] = useState<string | null>(null)
  const [hoveredObjectInstanceId, setHoveredObjectInstanceId] = useState<string | null>(null)
  const [hoveredWorldPreview, setHoveredWorldPreview] = useState<WorldHoverPreview | null>(null)

  const slug = editParams?.slug ?? params?.slug ?? worlds[0].slug
  const entry = worlds.find((w) => w.slug === slug) ?? worlds[0]
  const editing = Boolean(editMatch)
  const showLeva = import.meta.env.VITE_SHOW_LEVA === 'true'
  const uiVisible = !showLeva || !uiHidden
  const defaultWorldVersionIndex = entry.worldVersions[entry.worldVersions.length - 1]?.index
  const activeWorldVersionIndex = selectedWorldVersions[entry.slug] ?? defaultWorldVersionIndex
  const activeWorld = entry.worldVersions.find((version) => version.index === activeWorldVersionIndex)?.world ?? entry.world
  const renderableObjectAssets = entry.objectAssets.filter((asset) => asset.complete && asset.url)
  const renderableAllObjectAssets = entry.allObjectAssets.filter((asset) => asset.complete && asset.url)
  const { sceneProject, sceneProjectReady, updateSceneProject } = useSceneProject(entry.slug, location, entry.sceneProject)
  const sceneProjectActive = Boolean(sceneProject && sceneProjectEnabled)

  useEffect(() => {
    setSceneProjectEnabled(true)
    setHoveredObjectAssetId(null)
    setHoveredObjectInstanceId(null)
    setHoveredWorldPreview(null)
  }, [entry.slug])

  const handleObjectHover = useCallback((asset: WorldObjectAsset, hovering: boolean, instanceId?: string) => {
    setHoveredObjectAssetId((current) => {
      if (hovering) return asset.assetId
      return current === asset.assetId ? null : current
    })
    setHoveredObjectInstanceId((current) => {
      if (hovering) return instanceId ?? null
      return current === instanceId ? null : current
    })
  }, [])

  const handleWorldHover = useCallback((preview: WorldHoverPreview, hovering: boolean) => {
    setHoveredWorldPreview((current) => {
      if (hovering) return preview
      return current?.slug === preview.slug ? null : current
    })
  }, [])

  useEffect(() => {
    if (!showLeva) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return
      if (event.code !== 'Backquote') return
      event.preventDefault()
      setUiHidden((hidden) => !hidden)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showLeva])

  if (!editMatch && !match) {
    return <Redirect to={`/${worlds[0].slug}`} />
  }

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden select-none [&_*]:focus:outline-none [&_*]:focus-visible:outline-none [&_*]:focus:ring-0 [&_*]:focus-visible:ring-0">
      {!editing && LevaPanel && DebugPanel && showLeva && uiVisible && (
        <div className="hidden md:block">
          <Suspense fallback={null}>
            <LevaPanel
              collapsed={{ collapsed: levaCollapsed, onChange: setLevaCollapsed }}
              theme={{ sizes: { rootWidth: '380px', controlWidth: '180px' } }}
            />
            <DebugPanel />
          </Suspense>
        </div>
      )}
      <WorldViewer
        world={activeWorld}
        slug={entry.slug}
        sourceImageUrl={entry.sourceImageUrl}
        hoveredWorldPreview={hoveredWorldPreview}
        objectAssets={renderableObjectAssets}
        allObjectAssets={renderableAllObjectAssets}
        worldSfxUrls={entry.worldSfxUrls}
        sceneProject={editing || sceneProjectEnabled ? sceneProject : undefined}
        sceneProjectReady={sceneProjectReady}
        hoveredObjectAssetId={hoveredObjectAssetId}
        hoveredObjectInstanceId={hoveredObjectInstanceId}
        editing={editing}
        uiVisible={uiVisible}
        onObjectHover={handleObjectHover}
        onSceneProjectSaved={updateSceneProject}
        onRefreshWorlds={onRefreshWorlds}
        refreshingWorlds={refreshingWorlds}
      />
      {!editing && uiVisible && (
        <>
          <div className="fixed inset-x-4 top-4 z-10 sm:left-4 sm:right-auto">
            <WorldSidebar
              worlds={worlds}
              activeSlug={entry.slug}
              activeSceneProject={sceneProject}
              activeSceneProjectEnabled={sceneProjectActive}
              onActiveSceneProjectToggle={() => setSceneProjectEnabled((enabled) => !enabled)}
              activeWorldVersionIndex={activeWorldVersionIndex}
              hoveredObjectAssetId={hoveredObjectAssetId}
              hoveredObjectInstanceId={hoveredObjectInstanceId}
              onObjectHover={handleObjectHover}
              onWorldHover={handleWorldHover}
              onActiveWorldVersionChange={(index) => setSelectedWorldVersions((versions) => ({
                ...versions,
                [entry.slug]: index,
              }))}
            />
          </div>
          <TouchControls />
        </>
      )}
      {uiVisible && (
        <div className="fixed inset-x-0 bottom-4 z-20 flex justify-center px-4 sm:left-4 sm:right-auto sm:justify-start sm:px-0">
          <BottomLeftControls editing={editing} />
        </div>
      )}
    </div>
  )
}
