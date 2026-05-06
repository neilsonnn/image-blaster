import { Suspense, lazy, useEffect, useState } from 'react'
import { useRoute, useLocation, Redirect } from 'wouter'
import { WorldViewer } from './components/WorldViewer'
import { WorldSidebar } from './components/WorldSidebar'
import { BottomLeftControls } from './components/BottomLeftControls'
import { TouchControls } from './components/TouchControls'
import { useSceneProject } from './modules/scene/useSceneProject'
import { loadWorlds } from './utils/worldLoader'
import { useDebugStore } from './store/debug'

const worlds = loadWorlds()
const LevaPanel = import.meta.env.DEV
  ? lazy(() => import('leva').then((module) => ({ default: module.Leva })))
  : null
const DebugPanel = import.meta.env.DEV
  ? lazy(() => import('./components/DebugPanel').then((module) => ({ default: module.DebugPanel })))
  : null

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || target.isContentEditable
}

export function App() {
  const [editMatch, editParams] = useRoute('/:slug/edit')
  const [match, params] = useRoute('/:slug')
  const levaCollapsed = useDebugStore((s) => s.levaCollapsed)
  const setLevaCollapsed = useDebugStore((s) => s.setLevaCollapsed)
  const hotReloadEnabled = useDebugStore((s) => s.hotReloadEnabled)
  const [location] = useLocation()
  const [uiHidden, setUiHidden] = useState(false)
  const [sceneProjectEnabled, setSceneProjectEnabled] = useState(true)
  const [selectedWorldVersions, setSelectedWorldVersions] = useState<Record<string, number>>({})

  if (!worlds.length) {
    return (
      <div className="flex items-center justify-center h-screen text-white bg-black">
        No worlds found in worlds/
      </div>
    )
  }

  const slug = editParams?.slug ?? params?.slug ?? worlds[0].slug
  const entry = worlds.find((w) => w.slug === slug) ?? worlds[0]
  const editing = Boolean(editMatch)
  const showLeva = import.meta.env.VITE_SHOW_LEVA === 'true'
  const uiVisible = !showLeva || !uiHidden
  const defaultWorldVersionIndex = entry.worldVersions[entry.worldVersions.length - 1]?.index
  const activeWorldVersionIndex = selectedWorldVersions[entry.slug] ?? defaultWorldVersionIndex
  const activeWorld = entry.worldVersions.find((version) => version.index === activeWorldVersionIndex)?.world ?? entry.world
  const { sceneProject, sceneProjectReady, updateSceneProject } = useSceneProject(entry.slug, location, entry.sceneProject)
  const sceneProjectActive = Boolean(sceneProject && sceneProjectEnabled)

  useEffect(() => {
    setSceneProjectEnabled(true)
  }, [entry.slug])

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

  useEffect(() => {
    if (!import.meta.env.DEV) return
    const params = new URLSearchParams({ slug: entry.slug, editing: String(editing) })
    fetch(`/__active-world?${params.toString()}`).catch((error) => {
      console.warn(`Could not update active world to "${entry.slug}".`, error)
    })
  }, [editing, entry.slug])

  useEffect(() => {
    if (!import.meta.env.DEV) return
    fetch(`/__hot-reload?enabled=${hotReloadEnabled}`).catch((error) => {
      console.warn('Could not update hot reload sync setting.', error)
    })
  }, [hotReloadEnabled])

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
        sourceImageVersions={entry.sourceImageVersions}
        objectAssets={entry.objectAssets}
        allObjectAssets={entry.allObjectAssets}
        worldSfxUrls={entry.worldSfxUrls}
        sceneProject={editing || sceneProjectEnabled ? sceneProject : undefined}
        sceneProjectReady={sceneProjectReady}
        editing={editing}
        uiVisible={uiVisible}
        onSceneProjectSaved={updateSceneProject}
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
              onActiveWorldVersionChange={(index) => setSelectedWorldVersions((versions) => ({
                ...versions,
                [entry.slug]: index,
              }))}
            />
          </div>
          <div className="fixed inset-x-0 bottom-4 z-20 flex justify-center px-4 sm:left-4 sm:right-auto sm:justify-start sm:px-0">
            <BottomLeftControls />
          </div>
          <TouchControls />
        </>
      )}
    </div>
  )
}
