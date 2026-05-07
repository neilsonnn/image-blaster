import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AudioStore {
  muted: boolean
  setMuted: (v: boolean) => void
  toggleMuted: () => void
}

export const useAudioStore = create<AudioStore>()(
  persist(
    (set, get) => ({
      muted: false,
      setMuted: (muted) => set({ muted }),
      toggleMuted: () => set({ muted: !get().muted }),
    }),
    { name: 'image-blaster-audio' },
  ),
)
