import {
  ArrowCounterClockwise,
  GlobeSimple,
  Sphere,
  SpeakerHigh,
  SpeakerSlash,
  GlobeHemisphereEast,
  CameraIcon,
  ParkIcon,
  MountainsIcon,
  CubeIcon,
} from '@phosphor-icons/react'
import { Tooltip } from '@radix-ui/themes'
import { type ReactElement, useEffect } from 'react'
import { useAudioStore } from '../store/audio'
import { type ControllerMode, useDebugStore } from '../store/debug'
import { ObjectRenderMode, ViewerQuality, WorldRenderMode } from '../types/world'
import { AppButton } from './AppButton'
import { chrome } from './AppChrome'

const OBJECT_MODES = [
  { mode: ObjectRenderMode.Lit, Icon: GlobeHemisphereEast, label: 'Lit' },
  { mode: ObjectRenderMode.ShadedWireframe, Icon: Sphere, label: 'Shaded Wireframe' },
  { mode: ObjectRenderMode.Wireframe, Icon: GlobeSimple, label: 'Wireframe' },
] as const

const QUALITY_MODES = [
  { mode: ViewerQuality.Low, label: 'Low' },
  { mode: ViewerQuality.High, label: 'High' },
] as const

const WORLD_MODES = [
  { mode: WorldRenderMode.Combined, Icon: ParkIcon, label: 'Scene + Objects' },
  { mode: WorldRenderMode.SplatOnly, Icon: MountainsIcon, label: 'Scene' },
  { mode: WorldRenderMode.ObjectOnly, Icon: CubeIcon, label: 'Objects' },
] as const

const CONTROLLER_MODES: readonly { mode: ControllerMode; label: string }[] = [
  { mode: 'fly', label: 'Fly' },
  { mode: 'fps', label: 'FPS' },
]

const DIGIT_KEY_INDEX: Record<string, number> = {
  Digit1: 0,
  Digit2: 1,
  Digit3: 2,
}

function nextMode<T>(items: readonly { mode: T }[], current: T) {
  const index = items.findIndex((item) => item.mode === current)
  return items[(index + 1) % items.length].mode
}

function ControlTooltip({ content, children }: { content: string; children: ReactElement }) {
  return (
    <Tooltip content={content} delayDuration={0} side="top">
      {children}
    </Tooltip>
  )
}

export function BottomLeftControls() {
  const muted = useAudioStore((s) => s.muted)
  const toggleMuted = useAudioStore((s) => s.toggleMuted)
  const resetObjects = useDebugStore((s) => s.resetObjects)
  const viewerQuality = useDebugStore((s) => s.viewerQuality)
  const setViewerQuality = useDebugStore((s) => s.setViewerQuality)
  const objectRenderMode = useDebugStore((s) => s.objectRenderMode)
  const setObjectRenderMode = useDebugStore((s) => s.setObjectRenderMode)
  const worldRenderMode = useDebugStore((s) => s.worldRenderMode)
  const setWorldRenderMode = useDebugStore((s) => s.setWorldRenderMode)
  const controllerMode = useDebugStore((s) => s.controllerMode)
  const setControllerMode = useDebugStore((s) => s.setControllerMode)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const n = DIGIT_KEY_INDEX[e.code]
      if (n === undefined) return
      if (e.altKey && e.shiftKey) {
        const qualities = [ViewerQuality.Low, ViewerQuality.High]
        const quality = qualities[n]
        if (quality) {
          e.preventDefault()
          setViewerQuality(quality)
        }
      } else if (e.altKey) {
        const objects = [ObjectRenderMode.Lit, ObjectRenderMode.ShadedWireframe, ObjectRenderMode.Wireframe]
        e.preventDefault()
        setObjectRenderMode(objects[n])
      } else if (e.shiftKey) {
        const worlds = [WorldRenderMode.Combined, WorldRenderMode.SplatOnly, WorldRenderMode.ObjectOnly]
        e.preventDefault()
        setWorldRenderMode(worlds[n])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setObjectRenderMode, setViewerQuality, setWorldRenderMode])

  const utilBtn =
    'w-8 h-8 justify-center text-white rounded'

  const modeBtn = (active: boolean) =>
    `w-8 h-8 justify-center rounded ${
      active ? 'bg-white/15 text-white' : 'text-white'
    }`

  const currentQuality = QUALITY_MODES.find((item) => item.mode === viewerQuality) ?? QUALITY_MODES[0]
  const currentControllerMode = CONTROLLER_MODES.find((item) => item.mode === controllerMode) ?? CONTROLLER_MODES[0]

  return (
    <div className={`${chrome.enter} ${chrome.bar} flex h-10 w-full items-center justify-center gap-1 px-2 sm:w-auto`}>
      {/* utility */}
      <ControlTooltip content="Reset">
        <AppButton onClick={resetObjects} className={utilBtn}>
          <ArrowCounterClockwise size={18} weight="bold" />
        </AppButton>
      </ControlTooltip>
      <ControlTooltip content={muted ? 'Unmute' : 'Mute'}>
        <AppButton onClick={toggleMuted} className={utilBtn}>
          {muted ? <SpeakerSlash size={18} weight="fill" /> : <SpeakerHigh size={18} weight="fill" />}
        </AppButton>
      </ControlTooltip>

      <div className={`${chrome.divider} mx-1`} />

      {/* controller mode */}
      <ControlTooltip content="Change controller">
        <AppButton
          onClick={() => setControllerMode(nextMode(CONTROLLER_MODES, controllerMode))}
          className={'w-24'}
        >
          <CameraIcon size={15} weight="regular" className="text-white/45 flex-shrink-0" />
          <span>{currentControllerMode.label}</span>
        </AppButton>
      </ControlTooltip>

      <div className={`${chrome.divider} mx-1`} />

      {/* world render mode */}
      <div className="flex items-center gap-1">
        {WORLD_MODES.map(({ mode, Icon, label }) => (
          <ControlTooltip key={mode} content={label}>
            <AppButton
              onClick={() => setWorldRenderMode(mode)}
              active={worldRenderMode === mode}
              className={modeBtn(worldRenderMode === mode)}
            >
              <Icon size={17} weight={worldRenderMode === mode ? 'fill' : 'regular'} />
            </AppButton>
          </ControlTooltip>
        ))}
      </div>

      <div className={`${chrome.divider} mx-1`} />

      {/* object render mode */}
      <div className="flex items-center gap-1">
        {OBJECT_MODES.map(({ mode, Icon, label }) => (
          <ControlTooltip key={mode} content={label}>
            <AppButton
              onClick={() => setObjectRenderMode(mode)}
              active={objectRenderMode === mode}
              className={modeBtn(objectRenderMode === mode)}
            >
              <Icon size={17} weight={objectRenderMode === mode ? 'fill' : 'regular'} />
            </AppButton>
          </ControlTooltip>
        ))}
      </div>

      <div className={`${chrome.divider} mx-1`} />

      {/* viewer quality */}
      <ControlTooltip content="Change quality">
        <AppButton
          onClick={() => setViewerQuality(nextMode(QUALITY_MODES, viewerQuality))}
          className={'w-20'}
        >
          <CameraIcon size={15} weight="regular" className="text-white/45 flex-shrink-0" />
          <span>{currentQuality.label}</span>
        </AppButton>
      </ControlTooltip>
    </div>
  )
}
