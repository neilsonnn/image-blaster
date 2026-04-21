import { useRef, useEffect } from 'react'
import { EffectComposer, Bloom, ChromaticAberration, wrapEffect } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { MotionBlurEffect } from './MotionBlurEffect'

const WrappedMotionBlur = wrapEffect(MotionBlurEffect)

const _prevQuat = new THREE.Quaternion()
const _delta = new THREE.Quaternion()

const BLOOM_INTENSITY = 0.4
const BLOOM_THRESHOLD = 0.85
const CHROMATIC_OFFSET = 0.0008
const MOTION_BLUR_STRENGTH = 0.3

export function PostProcessing() {
  const blurRef = useRef<MotionBlurEffect>(null)
  const { camera } = useThree()

  useEffect(() => {
    _prevQuat.copy(camera.quaternion)
  }, [camera])

  useFrame(() => {
    if (!blurRef.current) return
    _delta.copy(_prevQuat).invert().multiply(camera.quaternion)
    const angle = 2 * Math.acos(Math.min(1, Math.abs(_delta.w)))
    const strength = Math.min(angle * MOTION_BLUR_STRENGTH * 8, 1)
    blurRef.current.setVelocity(_delta.x * 0.5, _delta.y * 0.5, strength)
    _prevQuat.copy(camera.quaternion)
  })

  return (
    <EffectComposer>
      <Bloom
        intensity={BLOOM_INTENSITY}
        luminanceThreshold={BLOOM_THRESHOLD}
        luminanceSmoothing={0.9}
        blendFunction={BlendFunction.ADD}
      />
      <ChromaticAberration
        offset={new THREE.Vector2(CHROMATIC_OFFSET, CHROMATIC_OFFSET)}
        blendFunction={BlendFunction.NORMAL}
        radialModulation={false}
        modulationOffset={0}
      />
      <WrappedMotionBlur ref={blurRef} />
    </EffectComposer>
  )
}
