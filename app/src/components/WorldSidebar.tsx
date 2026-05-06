import { useState } from 'react'
import { Tooltip } from '@radix-ui/themes'
import { ButterflyIcon, CheckSquareIcon, FileTextIcon, FolderOpenIcon, GlobeHemisphereWestIcon, ListIcon, PencilSimpleIcon, QuestionMarkIcon, SquareIcon } from '@phosphor-icons/react'
import { useLocation } from 'wouter'
import type { WorldEntry, WorldSceneProject } from '../types/world'
import { useDebugStore } from '../store/debug'
import { AppButton } from './AppButton'
import { ChromeThumbnail, chrome } from './AppChrome'

interface Props {
  worlds: WorldEntry[]
  activeSlug: string
  activeSceneProject?: WorldSceneProject
  activeSceneProjectEnabled: boolean
  onActiveSceneProjectToggle: () => void
  activeWorldVersionIndex?: number
  onActiveWorldVersionChange: (index: number) => void
}

export function WorldSidebar({
  worlds,
  activeSlug,
  activeSceneProject,
  activeSceneProjectEnabled,
  onActiveSceneProjectToggle,
  activeWorldVersionIndex,
  onActiveWorldVersionChange,
}: Props) {
  const [, navigate] = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const butterfliesEnabled = useDebugStore((s) => s.butterfliesEnabled)
  const setButterfliesEnabled = useDebugStore((s) => s.setButterfliesEnabled)
  const canOpenLocalFolders = import.meta.env.DEV

  const selectWorld = (slug: string) => {
    navigate(`/${slug}`)
    setMenuOpen(false)
  }

  const openWorldFolder = (slug: string) => {
    fetch(`/__open-world-folder?slug=${encodeURIComponent(slug)}`).catch((error) => {
      console.warn(`Could not open world folder for "${slug}".`, error)
    })
  }

  const openAssetFolder = (slug: string, target: 'scene' | 'world-asset' | 'object-asset', asset?: string) => {
    const params = new URLSearchParams({ slug, target })
    if (asset) params.set('asset', asset)
    fetch(`/__open-world-folder?${params.toString()}`).catch((error) => {
      console.warn(`Could not open ${target} folder for "${slug}".`, error)
    })
  }

  return (
    <aside className={`${chrome.enter} w-full sm:w-64 max-h-[80vh] flex flex-col gap-1 whitespace-nowrap text-sm`}>
      <div className={`${chrome.bar} flex flex-shrink-0 items-center justify-between px-2 py-1 text-sm font-medium font-mono`}>
        <AppButton
          onClick={() => setMenuOpen((open) => !open)}
          className="min-w-0 flex-1 gap-2 px-1 truncate font-mono text-white opacity-100 hover:bg-transparent"
          aria-expanded={menuOpen}
        >
          <ListIcon size={16} weight="regular" className="text-white/60 sm:hidden" />
          <span>image-blaster</span>{activeSlug && <span className="text-white/40 sm:hidden md:hidden">/ {activeSlug}</span>}
        </AppButton>
        <AppButton
          onClick={() => setButterfliesEnabled(!butterfliesEnabled)}
          active={butterfliesEnabled}
          className={`h-7 w-7 justify-center p-1 text-white ${butterfliesEnabled ? 'bg-white/15' : ''}`}
          aria-label={butterfliesEnabled ? 'Hide butterflies' : 'Show butterflies'}
          aria-pressed={butterfliesEnabled}
          title={butterfliesEnabled ? 'Hide butterflies' : 'Show butterflies'}
        >
          <ButterflyIcon size={16} weight={butterfliesEnabled ? 'fill' : 'regular'} />
        </AppButton>
        <a
          href="https://github.com/neilsonnn/image-blaster"
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-7 w-7 items-center justify-center rounded p-1 text-white opacity-80 transition-[background-color,opacity] hover:bg-white/10 hover:opacity-100"
          aria-label="Open image-blaster repository"
        >
          <span className="text-sm leading-none"><QuestionMarkIcon size={16} weight="regular" /></span>
        </a>
      </div>

      <div
        className={`
          ${chrome.panel} min-h-0 flex flex-1 flex-col gap-1 overflow-hidden p-1.5
          transition-[opacity,transform,max-height] duration-200 ease-out sm:max-h-[calc(90vh-3rem)] sm:translate-y-0 sm:opacity-100
          ${menuOpen ? 'max-h-[calc(90vh-3rem)] translate-y-0 opacity-100' : 'max-h-0 -translate-y-2 opacity-0 pointer-events-none sm:pointer-events-auto'}
        `}
      >
        <div className="w-full min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
          <div className="flex min-w-0 flex-col gap-1 pr-1">
            {worlds.map(({ slug, world, worldVersions, objectAssets, sceneProject }) => {
              const isActive = slug === activeSlug
              const name = world.display_name || slug
              const projectLoaded = isActive ? activeSceneProject : sceneProject
              const latestVersion = worldVersions[worldVersions.length - 1]
              const selectedVersionIndex = isActive ? activeWorldVersionIndex : latestVersion?.index
              const selectedVersion = worldVersions.find((version) => version.index === selectedVersionIndex) ?? latestVersion
              const displayWorld = selectedVersion?.world ?? world
              const hasSplatFile = Object.values(displayWorld.assets.splats.spz_urls).some(Boolean)
              return (
                <div key={slug} className="rounded">
                  <div
                    className={`
                      min-w-0 flex items-center gap-1 rounded
                      ${isActive ? 'border-white/50 bg-white/20' : ''}
                    `}
                  >
                    <AppButton
                      onClick={() => selectWorld(slug)}
                      active={isActive}
                      className={`
                        min-w-0 flex flex-1 items-center gap-2 rounded px-2 py-1.5 text-left
                        ${isActive ? 'hover:bg-transparent' : ''}
                      `}
                    >
                      <span className="block min-w-0 flex-1 truncate text-sm font-medium leading-tight text-white">{name}</span>
                    </AppButton>
                    {isActive && (
                      <Tooltip
                        content={`Create or edit the project.json scene for ${name}`}
                        delayDuration={0}
                        side="right"
                      >
                        <AppButton
                          onClick={() => {
                            navigate(`/${slug}/edit`)
                            setMenuOpen(false)
                          }}
                          className="h-8 w-8 flex-shrink-0 justify-center text-white"
                          aria-label={`Create or edit the project.json scene for ${name}`}
                          title={`Create or edit the project.json scene for ${name}`}
                        >
                          <PencilSimpleIcon size={15} weight="regular" />
                        </AppButton>
                      </Tooltip>
                    )}
                    {canOpenLocalFolders && isActive && (
                      <Tooltip
                        content={`Open the local folder for ${name}`}
                        delayDuration={0}
                        side="right"
                      >
                        <AppButton
                          onClick={() => openWorldFolder(slug)}
                          className="h-8 w-8 flex-shrink-0 justify-center text-white"
                          aria-label={`Open local folder for ${name}`}
                          title={`Open local folder for ${name}`}
                        >
                          <FolderOpenIcon size={15} weight="regular" />
                        </AppButton>
                      </Tooltip>
                    )}
                  </div>

                  <div
                    className={`
                      overflow-hidden transition-all duration-300 ease-in-out
                      ${isActive ? 'max-h-[32rem]' : 'max-h-0'}
                    `}
                  >
                    <div className="mt-1 flex min-w-0 flex-col gap-1">
                      {isActive && projectLoaded && (
                        <div className="group flex min-w-0 items-center gap-1 rounded px-2 py-1 text-left text-white/80">
                          <span className="relative flex h-7 w-7 flex-shrink-0 items-center justify-center rounded bg-white/10 text-white/45 ring-1 ring-white/10">
                            <FileTextIcon size={14} weight="regular" />
                            <FileExtensionBadge extension=".json" />
                          </span>
                          <span className="min-w-0 flex-1 truncate text-xs font-medium leading-tight text-white/80">
                            project.json
                          </span>
                          {canOpenLocalFolders && (
                            <AppButton
                              onClick={() => openAssetFolder(slug, 'scene')}
                              className="h-7 w-7 flex-shrink-0 justify-center p-1 text-white opacity-0 transition-opacity group-hover:opacity-90 focus-visible:opacity-100 hover:opacity-100"
                              aria-label={`Open scene folder for ${name}`}
                              title={`Open scene folder for ${name}`}
                            >
                              <FolderOpenIcon size={14} weight="regular" />
                            </AppButton>
                          )}
                          <AppButton
                            onClick={onActiveSceneProjectToggle}
                            active={activeSceneProjectEnabled}
                            className="h-6 w-6 flex-shrink-0 justify-center p-1 text-white/70"
                            aria-label={activeSceneProjectEnabled ? 'Disable project.json scene' : 'Enable project.json scene'}
                            aria-pressed={activeSceneProjectEnabled}
                            title={activeSceneProjectEnabled ? 'Disable project.json scene' : 'Enable project.json scene'}
                          >
                            {activeSceneProjectEnabled ? (
                              <CheckSquareIcon size={14} weight="bold" />
                            ) : (
                              <SquareIcon size={14} weight="regular" />
                            )}
                          </AppButton>
                        </div>
                      )}
                      {hasSplatFile && (
                        <div className="group flex min-w-0 items-center gap-1 rounded">
                          <div className="min-w-0 flex flex-1 items-center gap-2 rounded px-2 py-1 text-left text-white opacity-80">
                            <span className="relative flex h-7 w-7 flex-shrink-0 items-center justify-center rounded bg-white/10 text-white/45 ring-1 ring-white/10">
                              <GlobeHemisphereWestIcon size={14} weight="regular" />
                              <FileExtensionBadge extension=".spz" />
                            </span>
                            <span className="min-w-0 flex-1 text-white/85 text-xs font-semibold leading-tight truncate">
                              {slug}
                            </span>
                            {isActive && worldVersions.length > 1 && selectedVersion && (
                              <select
                                value={selectedVersion.index}
                                className="h-5 flex-shrink-0 rounded border border-white/10 bg-white/5 px-1 text-[10px] leading-none text-white/60"
                                aria-label={`Select world version for ${name}`}
                                onChange={(event) => onActiveWorldVersionChange(Number(event.target.value))}
                              >
                                {worldVersions.map((version) => (
                                  <option key={version.index} value={version.index}>
                                    {version.label}
                                  </option>
                                ))}
                              </select>
                            )}
                            {!isActive && worldVersions.length > 1 && (
                              <span className="flex-shrink-0 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] leading-none text-white/45">
                                {worldVersions.length}
                              </span>
                            )}
                          </div>
                          {canOpenLocalFolders && (
                            <AppButton
                              onClick={() => openAssetFolder(slug, 'world-asset')}
                              className="h-7 w-7 flex-shrink-0 justify-center p-1 text-white opacity-0 transition-opacity group-hover:opacity-90 focus-visible:opacity-100 hover:opacity-100"
                              aria-label={`Open world asset folder for ${name}`}
                              title={`Open world asset folder for ${name}`}
                            >
                              <FolderOpenIcon size={14} weight="regular" />
                            </AppButton>
                          )}
                        </div>
                      )}
                      {objectAssets.map((obj) => (
                        <div
                          key={obj.assetId}
                          className="flex min-w-0 items-center gap-2 rounded px-2 py-1 text-left group"
                        >
                          <span className="relative flex h-7 w-7 flex-shrink-0">
                            <ChromeThumbnail thumbnailUrl={obj.thumbnailUrl} alt={obj.name} />
                            <FileExtensionBadge extension=".obj" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-white/80 text-xs font-medium leading-tight truncate">
                              {obj.name}
                            </span>
                          </span>
                          {obj.index !== undefined && obj.index > 0 && obj.variantLabel && (
                            <span className="flex-shrink-0 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] leading-none text-white/50">
                              {obj.variantLabel}
                            </span>
                          )}
                          {canOpenLocalFolders && (
                            <AppButton
                              onClick={() => openAssetFolder(slug, 'object-asset', obj.baseObjectId)}
                              className="h-7 w-7 flex-shrink-0 justify-center p-1 text-white opacity-0 transition-opacity group-hover:opacity-90 focus-visible:opacity-100 hover:opacity-100"
                              aria-label={`Open asset folder for ${obj.name}`}
                              title={`Open asset folder for ${obj.name}`}
                            >
                              <FolderOpenIcon size={14} weight="regular" />
                            </AppButton>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </aside>
  )
}

function FileExtensionBadge({ extension }: { extension: string }) {
  return (
    <span className="pointer-events-none absolute bottom-0 right-0 rounded-sm bg-black/70 px-px font-mono text-[6px] font-semibold leading-[7px] text-white/70 ring-1 ring-white/10">
      {extension}
    </span>
  )
}
