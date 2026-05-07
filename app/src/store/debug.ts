import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ObjectRenderMode, ViewerQuality, WorldRenderMode } from '../types/world'

export type ControllerMode = 'fly' | 'fps'

function defaultViewerQuality() {
  if (typeof window === 'undefined') return ViewerQuality.High
  const mobileQuery = '(hover: none), (pointer: coarse), (max-width: 767px)'
  return window.matchMedia(mobileQuery).matches ? ViewerQuality.Low : ViewerQuality.High
}

interface DebugStore {
  viewerQuality: ViewerQuality
  setViewerQuality: (v: ViewerQuality) => void
  hotReloadEnabled: boolean
  setHotReloadEnabled: (v: boolean) => void
  worldRenderMode: WorldRenderMode
  setWorldRenderMode: (v: WorldRenderMode) => void
  objectRenderMode: ObjectRenderMode
  setObjectRenderMode: (v: ObjectRenderMode) => void
  objectResetToken: number
  controllerResetToken: number
  resetObjects: () => void
  showOrigin: boolean
  setShowOrigin: (v: boolean) => void
  butterfliesEnabled: boolean
  setButterfliesEnabled: (v: boolean) => void
  controllerMode: ControllerMode
  setControllerMode: (v: ControllerMode) => void
  flyMouseSensitivity: number
  setFlyMouseSensitivity: (v: number) => void
  // Splat depth-of-field (Spark 2.0 built-in DoF + circle-bokeh via flat falloff)
  dofEnabled: boolean
  setDofEnabled: (v: boolean) => void
  focalDistance: number
  setFocalDistance: (v: number) => void
  apertureAngle: number
  setApertureAngle: (v: number) => void
  falloff: number
  setFalloff: (v: number) => void
  // Custom DoF curve: 0 within sharpRange of focal plane, exp growth beyond.
  sharpRange: number
  setSharpRange: (v: number) => void
  falloffRate: number
  setFalloffRate: (v: number) => void
  // Post-processing
  bloomEnabled: boolean
  setBloomEnabled: (v: boolean) => void
  bloomIntensity: number
  setBloomIntensity: (v: number) => void
  bloomThreshold: number
  setBloomThreshold: (v: number) => void
  chromaticEnabled: boolean
  setChromaticEnabled: (v: boolean) => void
  chromaticOffset: number
  setChromaticOffset: (v: number) => void
  motionBlurEnabled: boolean
  setMotionBlurEnabled: (v: boolean) => void
  motionBlurStrength: number
  setMotionBlurStrength: (v: number) => void
  // Lighting
  environmentIntensity: number
  setEnvironmentIntensity: (v: number) => void
  sunIntensity: number
  setSunIntensity: (v: number) => void
  sunColor: string
  setSunColor: (v: string) => void
  levaCollapsed: boolean
  setLevaCollapsed: (v: boolean) => void
}

export const useDebugStore = create<DebugStore>()(
  persist(
    (set) => ({
      viewerQuality: defaultViewerQuality(),
      setViewerQuality: (viewerQuality) => set({ viewerQuality }),
      hotReloadEnabled: true,
      setHotReloadEnabled: (hotReloadEnabled) => set({ hotReloadEnabled }),
      worldRenderMode: WorldRenderMode.Combined,
      setWorldRenderMode: (worldRenderMode) => set({ worldRenderMode }),
      objectRenderMode: ObjectRenderMode.Lit,
      setObjectRenderMode: (objectRenderMode) => set({ objectRenderMode }),
      objectResetToken: 0,
      controllerResetToken: 0,
      resetObjects: () => set((s) => ({
        objectResetToken: s.objectResetToken + 1,
        controllerResetToken: s.controllerResetToken + 1,
      })),
      showOrigin: false,
      setShowOrigin: (showOrigin) => set({ showOrigin }),
      butterfliesEnabled: false,
      setButterfliesEnabled: (butterfliesEnabled) => set({ butterfliesEnabled }),
      controllerMode: 'fly',
      setControllerMode: (controllerMode) => set({ controllerMode }),
      flyMouseSensitivity: 0.003,
      setFlyMouseSensitivity: (flyMouseSensitivity) => set({ flyMouseSensitivity }),
      dofEnabled: true,
      setDofEnabled: (dofEnabled) => set({ dofEnabled }),
      focalDistance: 5,
      setFocalDistance: (focalDistance) => set({ focalDistance }),
      apertureAngle: 0.01,
      setApertureAngle: (apertureAngle) => set({ apertureAngle }),
      falloff: 1,
      setFalloff: (falloff) => set({ falloff }),
      sharpRange: 0,
      setSharpRange: (sharpRange) => set({ sharpRange }),
      falloffRate: 0.01,
      setFalloffRate: (falloffRate) => set({ falloffRate }),
      bloomEnabled: true,
      setBloomEnabled: (bloomEnabled) => set({ bloomEnabled }),
      bloomIntensity: 0.4,
      setBloomIntensity: (bloomIntensity) => set({ bloomIntensity }),
      bloomThreshold: 0.85,
      setBloomThreshold: (bloomThreshold) => set({ bloomThreshold }),
      chromaticEnabled: true,
      setChromaticEnabled: (chromaticEnabled) => set({ chromaticEnabled }),
      chromaticOffset: 0.0008,
      setChromaticOffset: (chromaticOffset) => set({ chromaticOffset }),
      motionBlurEnabled: true,
      setMotionBlurEnabled: (motionBlurEnabled) => set({ motionBlurEnabled }),
      motionBlurStrength: 0.3,
      setMotionBlurStrength: (motionBlurStrength) => set({ motionBlurStrength }),
      environmentIntensity: 2,
      setEnvironmentIntensity: (environmentIntensity) => set({ environmentIntensity }),
      sunIntensity: 1,
      setSunIntensity: (sunIntensity) => set({ sunIntensity }),
      sunColor: '#ffffff',
      setSunColor: (sunColor) => set({ sunColor }),
      levaCollapsed: false,
      setLevaCollapsed: (levaCollapsed) => set({ levaCollapsed }),
    }),
    {
      name: 'image-blaster-debug',
      version: 10,
      migrate: (persisted, version) => {
        if (!persisted || typeof persisted !== 'object') return persisted
        const state = persisted as Record<string, unknown>
        if (state.controllerMode === 'butterfly') state.controllerMode = 'fly'
        if (version < 10) state.butterfliesEnabled = true
        return state
      },
      // Persist user-facing viewer controls so the Leva/debug panel survives reloads.
      partialize: (s) => ({
        viewerQuality: s.viewerQuality,
        hotReloadEnabled: s.hotReloadEnabled,
        worldRenderMode: s.worldRenderMode,
        objectRenderMode: s.objectRenderMode,
        butterfliesEnabled: s.butterfliesEnabled,
        controllerMode: s.controllerMode,
        flyMouseSensitivity: s.flyMouseSensitivity,
        dofEnabled: s.dofEnabled,
        focalDistance: s.focalDistance,
        apertureAngle: s.apertureAngle,
        falloff: s.falloff,
        sharpRange: s.sharpRange,
        falloffRate: s.falloffRate,
        bloomEnabled: s.bloomEnabled,
        bloomIntensity: s.bloomIntensity,
        bloomThreshold: s.bloomThreshold,
        chromaticEnabled: s.chromaticEnabled,
        chromaticOffset: s.chromaticOffset,
        motionBlurEnabled: s.motionBlurEnabled,
        motionBlurStrength: s.motionBlurStrength,
        levaCollapsed: s.levaCollapsed,
      }),
    },
  ),
)
