import { useEffect, useRef } from 'react'

const AUDIO_EXTENSIONS = ['.mp3', '.ogg', '.wav', '.m4a']

interface Props {
  slug: string
  active: boolean
}

// Fetches the world's output manifest to find audio files, plays them looping.
// Falls back gracefully if no audio exists.
export function AudioManager({ slug, active }: Props) {
  const audioRefs = useRef<HTMLAudioElement[]>([])

  useEffect(() => {
    if (!active) {
      audioRefs.current.forEach((a) => {
        a.pause()
        a.src = ''
      })
      audioRefs.current = []
      return
    }

    // Try to fetch an index of audio files from the output directory.
    // We probe a manifest.json first; if absent, we silently skip.
    fetch(`/worlds/${slug}/output/manifest.json`)
      .then((r) => (r.ok ? r.json() : { audio: [] }))
      .then((manifest: { audio?: string[] }) => {
        const files = (manifest.audio ?? []).filter((f) =>
          AUDIO_EXTENSIONS.some((ext) => f.endsWith(ext)),
        )
        audioRefs.current = files.map((file) => {
          const audio = new Audio(`/worlds/${slug}/output/${file}`)
          audio.loop = true
          audio.volume = 0.6
          audio.play().catch(() => {/* autoplay blocked */})
          return audio
        })
      })
      .catch(() => {})

    return () => {
      audioRefs.current.forEach((a) => {
        a.pause()
        a.src = ''
      })
      audioRefs.current = []
    }
  }, [slug, active])

  return null
}
