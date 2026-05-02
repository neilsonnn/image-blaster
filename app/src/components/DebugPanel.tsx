import { useEffect } from 'react'
import { useControls, button, folder } from 'leva'
import { useDebugStore } from '../store/debug'
import { useButterflyStore } from '../modules/butterfly/store'
import { LEVA_SCHEMA, DEFAULT_PARAMS, type ButterflyParams } from '../modules/butterfly/params'
import { ObjectRenderMode, WorldRenderMode } from '../types/world'

function dumpParams() {
  const debug = useDebugStore.getState()
  const dof = {
    dofEnabled: debug.dofEnabled,
    focalDistance: debug.focalDistance,
    apertureAngle: debug.apertureAngle,
    falloff: debug.falloff,
    sharpRange: debug.sharpRange,
    falloffRate: debug.falloffRate,
  }

  const post = {
    bloomEnabled: debug.bloomEnabled,
    bloomIntensity: debug.bloomIntensity,
    bloomThreshold: debug.bloomThreshold,
    chromaticEnabled: debug.chromaticEnabled,
    chromaticOffset: debug.chromaticOffset,
    motionBlurEnabled: debug.motionBlurEnabled,
    motionBlurStrength: debug.motionBlurStrength,
  }

  const lighting = {
    environmentIntensity: debug.environmentIntensity,
    sunIntensity: debug.sunIntensity,
    sunColor: debug.sunColor,
  }

  const out: Record<string, unknown> = { dof, post, lighting }
  out.worldRenderMode = debug.worldRenderMode
  out.objectRenderMode = debug.objectRenderMode

  if (debug.controllerMode === 'butterfly') {
    const bf = useButterflyStore.getState()
    const butterfly: Record<string, unknown> = {}
    for (const k of Object.keys(DEFAULT_PARAMS) as Array<keyof ButterflyParams>) {
      butterfly[k] = bf[k]
    }
    out.butterfly = butterfly
  }

  const json = JSON.stringify(out, null, 2)
  // eslint-disable-next-line no-console
  console.log('[debug params]\n' + json)
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    navigator.clipboard.writeText(json).catch(() => {})
  }
}

export function DebugPanel() {
  const worldRenderMode = useDebugStore((s) => s.worldRenderMode)
  const setWorldRenderMode = useDebugStore((s) => s.setWorldRenderMode)
  const objectRenderMode = useDebugStore((s) => s.objectRenderMode)
  const setObjectRenderMode = useDebugStore((s) => s.setObjectRenderMode)
  const resetObjects = useDebugStore((s) => s.resetObjects)
  const controllerMode = useDebugStore((s) => s.controllerMode)
  const setControllerMode = useDebugStore((s) => s.setControllerMode)
  const dofEnabled = useDebugStore((s) => s.dofEnabled)
  const focalDistance = useDebugStore((s) => s.focalDistance)
  const apertureAngle = useDebugStore((s) => s.apertureAngle)
  const falloff = useDebugStore((s) => s.falloff)
  const sharpRange = useDebugStore((s) => s.sharpRange)
  const falloffRate = useDebugStore((s) => s.falloffRate)
  const bloomEnabled = useDebugStore((s) => s.bloomEnabled)
  const bloomIntensity = useDebugStore((s) => s.bloomIntensity)
  const bloomThreshold = useDebugStore((s) => s.bloomThreshold)
  const chromaticEnabled = useDebugStore((s) => s.chromaticEnabled)
  const chromaticOffset = useDebugStore((s) => s.chromaticOffset)
  const motionBlurEnabled = useDebugStore((s) => s.motionBlurEnabled)
  const motionBlurStrength = useDebugStore((s) => s.motionBlurStrength)
  const environmentIntensity = useDebugStore((s) => s.environmentIntensity)
  const sunIntensity = useDebugStore((s) => s.sunIntensity)
  const sunColor = useDebugStore((s) => s.sunColor)
  const setDofEnabled = useDebugStore((s) => s.setDofEnabled)
  const setFocalDistance = useDebugStore((s) => s.setFocalDistance)
  const setApertureAngle = useDebugStore((s) => s.setApertureAngle)
  const setFalloff = useDebugStore((s) => s.setFalloff)
  const setSharpRange = useDebugStore((s) => s.setSharpRange)
  const setFalloffRate = useDebugStore((s) => s.setFalloffRate)
  const setBloomEnabled = useDebugStore((s) => s.setBloomEnabled)
  const setBloomIntensity = useDebugStore((s) => s.setBloomIntensity)
  const setBloomThreshold = useDebugStore((s) => s.setBloomThreshold)
  const setChromaticEnabled = useDebugStore((s) => s.setChromaticEnabled)
  const setChromaticOffset = useDebugStore((s) => s.setChromaticOffset)
  const setMotionBlurEnabled = useDebugStore((s) => s.setMotionBlurEnabled)
  const setMotionBlurStrength = useDebugStore((s) => s.setMotionBlurStrength)
  const setEnvironmentIntensity = useDebugStore((s) => s.setEnvironmentIntensity)
  const setSunIntensity = useDebugStore((s) => s.setSunIntensity)
  const setSunColor = useDebugStore((s) => s.setSunColor)

  useControls({
    worldRenderMode: {
      value: worldRenderMode,
      options: {
        'Splat Only': WorldRenderMode.SplatOnly,
        'Object Only': WorldRenderMode.ObjectOnly,
        Combined: WorldRenderMode.Combined,
      },
      label: 'World Render',
      onChange: (v: WorldRenderMode) => setWorldRenderMode(v),
    },
    'Dump Params (copy JSON)': button(dumpParams),
    Objects: folder({
      objectRenderMode: {
        value: objectRenderMode,
        options: {
          Lit: ObjectRenderMode.Lit,
          Wireframe: ObjectRenderMode.Wireframe,
          'Shaded Wireframe': ObjectRenderMode.ShadedWireframe,
        },
        label: 'Object Render',
        onChange: (v: ObjectRenderMode) => setObjectRenderMode(v),
      },
      'Reset Objects': button(resetObjects),
    }),
    'Splat DoF': folder({
      dofEnabled: {
        value: dofEnabled,
        label: 'Enabled',
        onChange: setDofEnabled,
      },
      focalDistance: {
        value: focalDistance,
        min: 0.1,
        max: 50,
        step: 0.1,
        label: 'Focal Distance',
        onChange: setFocalDistance,
      },
      apertureAngle: {
        value: apertureAngle,
        min: 0,
        max: 0.3,
        step: 0.001,
        label: 'Aperture (rad)',
        onChange: setApertureAngle,
      },
      falloff: {
        value: falloff,
        min: 0,
        max: 1,
        step: 0.01,
        label: 'Falloff (0=disk)',
        onChange: setFalloff,
      },
      sharpRange: {
        value: sharpRange,
        min: 0,
        max: 20,
        step: 0.1,
        label: 'Sharp Range',
        onChange: setSharpRange,
      },
      falloffRate: {
        value: falloffRate,
        min: 0,
        max: 2,
        step: 0.01,
        label: 'Exp Rate',
        onChange: setFalloffRate,
      },
    }),
    'Post FX': folder({
      bloomEnabled: {
        value: bloomEnabled,
        label: 'Bloom',
        onChange: setBloomEnabled,
      },
      bloomIntensity: {
        value: bloomIntensity,
        min: 0,
        max: 3,
        step: 0.01,
        label: 'Bloom Intensity',
        onChange: setBloomIntensity,
      },
      bloomThreshold: {
        value: bloomThreshold,
        min: 0,
        max: 1,
        step: 0.01,
        label: 'Bloom Threshold',
        onChange: setBloomThreshold,
      },
      chromaticEnabled: {
        value: chromaticEnabled,
        label: 'Chromatic Aberr.',
        onChange: setChromaticEnabled,
      },
      chromaticOffset: {
        value: chromaticOffset,
        min: 0,
        max: 0.01,
        step: 0.0001,
        label: 'Chromatic Offset',
        onChange: setChromaticOffset,
      },
      motionBlurEnabled: {
        value: motionBlurEnabled,
        label: 'Motion Blur',
        onChange: setMotionBlurEnabled,
      },
      motionBlurStrength: {
        value: motionBlurStrength,
        min: 0,
        max: 2,
        step: 0.01,
        label: 'Motion Blur Str.',
        onChange: setMotionBlurStrength,
      },
    }),
    Lighting: folder({
      environmentIntensity: {
        value: environmentIntensity,
        min: 0,
        max: 5,
        step: 0.01,
        label: 'Env Strength',
        onChange: setEnvironmentIntensity,
      },
      sunIntensity: {
        value: sunIntensity,
        min: 0,
        max: 10,
        step: 0.01,
        label: 'Sun Strength',
        onChange: setSunIntensity,
      },
      sunColor: {
        value: sunColor,
        label: 'Sun Color',
        onChange: setSunColor,
      },
    }),
    controllerMode: {
      value: controllerMode,
      options: { Fly: 'fly', FPS: 'fps', Butterfly: 'butterfly' },
      label: 'Controller',
      onChange: (v: string) => setControllerMode(v as typeof controllerMode),
    },
  })

  return controllerMode === 'butterfly' ? <ButterflyLevaBridge /> : null
}

function ButterflyLevaBridge() {
  const values = useControls(LEVA_SCHEMA) as unknown as ButterflyParams

  useEffect(() => {
    const state = useButterflyStore.getState()
    const keys = Object.keys(DEFAULT_PARAMS) as Array<keyof ButterflyParams>
    for (const k of keys) {
      const v = values[k]
      if (v !== undefined && v !== state[k]) state.setParam(k, v)
    }
  }, [values])

  return null
}
