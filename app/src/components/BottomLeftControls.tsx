import { useEffect, useState } from 'react'
import { useLocation } from 'wouter'
import { ArrowCounterClockwise, SpeakerHigh, SpeakerSlash, Stack } from '@phosphor-icons/react'
import type { WorldEntry } from '../types/world'
import { useAudioStore } from '../store/audio'
import { useDebugStore } from '../store/debug'

interface Props {
  worlds: WorldEntry[]
  activeSlug: string
}

export function BottomLeftControls({ worlds, activeSlug }: Props) {
  const [, navigate] = useLocation()
  const muted = useAudioStore((s) => s.muted)
  const toggleMuted = useAudioStore((s) => s.toggleMuted)
  const resetObjects = useDebugStore((s) => s.resetObjects)
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (open) {
      setMounted(true)
      const id = requestAnimationFrame(() => setVisible(true))
      return () => cancelAnimationFrame(id)
    } else {
      setVisible(false)
      const t = setTimeout(() => setMounted(false), 250)
      return () => clearTimeout(t)
    }
  }, [open])

  const buttonBase =
    'w-11 h-11 flex items-center justify-center rounded-full bg-black/60 backdrop-blur-md text-white hover:bg-white/15 transition-colors ring-1 ring-white/10'

  return (
    <div className="fixed bottom-4 left-4 z-20 flex flex-col items-start gap-3">
      {mounted && (
        <div
          className={`
            max-w-[80vw] md:max-w-md max-h-[60vh] overflow-y-auto
            flex flex-row flex-wrap gap-2 p-3 rounded-2xl
            bg-black/60 backdrop-blur-md ring-1 ring-white/10
            transition-all duration-300 ease-out
            ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}
          `}
        >
          {worlds.map(({ slug, world }) => {
            const isActive = slug === activeSlug
            const name = world.display_name || slug
            return (
              <button
                key={slug}
                onClick={() => {
                  navigate(`/${slug}`)
                  setOpen(false)
                }}
                title={name}
                className={`
                  group relative w-20 h-20 md:w-24 md:h-24 rounded-2xl overflow-hidden
                  transition-all duration-200
                  ${isActive ? 'ring-2 ring-white' : 'ring-1 ring-white/10 hover:ring-white/40'}
                `}
              >
                <img
                  src={world.assets.thumbnail_url}
                  alt={name}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 px-2 py-1 text-[10px] md:text-xs font-medium text-white bg-gradient-to-t from-black/80 to-transparent truncate">
                  {name}
                </div>
              </button>
            )
          })}
        </div>
      )}

      <div className="flex flex-row gap-2">
        <button
          onClick={toggleMuted}
          aria-label={muted ? 'Unmute' : 'Mute'}
          title={muted ? 'Unmute' : 'Mute'}
          className={buttonBase}
        >
          {muted ? <SpeakerSlash size={22} weight="fill" /> : <SpeakerHigh size={22} weight="fill" />}
        </button>
        <button
          onClick={resetObjects}
          aria-label="Reset objects"
          title="Reset objects"
          className={buttonBase}
        >
          <ArrowCounterClockwise size={22} weight="bold" />
        </button>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label="Load level"
          title="Load level"
          className={`${buttonBase} ${open ? 'bg-white/20' : ''}`}
        >
          <Stack size={22} weight="fill" />
        </button>
      </div>
    </div>
  )
}
