import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { ImprovedNoise } from 'three/examples/jsm/math/ImprovedNoise.js'
import type { ButterflyInput } from './useButterflyInput'
import { useButterflyStore } from './store'

interface Props {
  input: ButterflyInput
  targetRef: React.RefObject<THREE.Vector3>
  pivotRef: React.RefObject<THREE.Vector3>
}

const _offset = new THREE.Vector3()
const _right = new THREE.Vector3()
const _up = new THREE.Vector3()

export function OrbitCamera({ input, targetRef, pivotRef }: Props) {
  const { camera } = useThree()
  const initialised = useRef(false)

  const yawSmooth = useRef(0)
  const pitchSmooth = useRef(0)
  const lastCamPos = useRef(new THREE.Vector3())
  const lastCamQuat = useRef(new THREE.Quaternion())
  const shakeIntensity = useRef(0)
  const fovSmooth = useRef<number | null>(null)
  const tRef = useRef(0)
  const noise = useRef(new ImprovedNoise())
  // independent y-row per axis so each samples uncorrelated 1D slices of the noise field
  const offsets = useRef({
    px: Math.random() * 1000,
    py: Math.random() * 1000,
    rx: Math.random() * 1000,
    ry: Math.random() * 1000,
  })

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const safeDt = Math.max(dt, 0.005)
    const params = useButterflyStore.getState()
    const target = targetRef.current
    const pivot = pivotRef.current
    if (!target || !pivot) return

    if (!initialised.current) {
      pivot.copy(target)
      yawSmooth.current = input.yaw.current
      pitchSmooth.current = input.pitch.current
      lastCamPos.current.copy(camera.position)
      lastCamQuat.current.copy(camera.quaternion)
      initialised.current = true
    }

    pivot.lerp(target, 1 - Math.exp(-params.cameraPositionLerp * dt))

    const zoomA = 1 - Math.exp(-params.zoomLerp * dt)
    input.distance.current += (input.targetDistance.current - input.distance.current) * zoomA

    // distance-derived blend factor (0 at min, 1 at max)
    const distRangeAll = Math.max(1e-4, params.maxDistance - params.minDistance)
    const distU = Math.min(
      1,
      Math.max(0, (input.distance.current - params.minDistance) / distRangeAll),
    )
    // FOV follows camera distance; right-drag/two-finger dolly update that distance upstream.
    if (camera instanceof THREE.PerspectiveCamera) {
      const baseFov = params.nearFov + (params.farFov - params.nearFov) * distU
      const targetFov = baseFov
      if (fovSmooth.current === null) fovSmooth.current = targetFov
      const fovA = 1 - Math.exp(-params.fovLerp * dt)
      fovSmooth.current += (targetFov - fovSmooth.current) * fovA
      if (Math.abs(camera.fov - fovSmooth.current) > 0.001) {
        camera.fov = fovSmooth.current
        camera.updateProjectionMatrix()
      }
    }

    const rotA = 1 - Math.exp(-params.cameraRotationLerp * dt)
    yawSmooth.current += (input.yaw.current - yawSmooth.current) * rotA
    pitchSmooth.current += (input.pitch.current - pitchSmooth.current) * rotA

    const yaw = yawSmooth.current
    const pitch = pitchSmooth.current
    const dist = input.distance.current

    const cosP = Math.cos(pitch)
    _offset.set(Math.sin(yaw) * cosP, Math.sin(pitch), Math.cos(yaw) * cosP).multiplyScalar(dist)

    const heightY = pivot.y + params.cameraHeightOffset
    camera.position.set(pivot.x + _offset.x, heightY + _offset.y, pivot.z + _offset.z)
    camera.lookAt(pivot.x, heightY, pivot.z)

    // measure pre-shake linear and angular speed magnitudes (direction-agnostic)
    const linSpeed = Math.hypot(
      camera.position.x - lastCamPos.current.x,
      camera.position.y - lastCamPos.current.y,
      camera.position.z - lastCamPos.current.z,
    ) / safeDt
    lastCamPos.current.copy(camera.position)

    const angSpeed = camera.quaternion.angleTo(lastCamQuat.current) / safeDt
    lastCamQuat.current.copy(camera.quaternion)

    // distance-driven freq + max: near distance -> high, far -> low
    const freq = params.shakeFreqNear + (params.shakeFreqFar - params.shakeFreqNear) * distU
    const shakeMax = params.shakeMaxNear + (params.shakeMaxFar - params.shakeMaxNear) * distU

    const rawTarget = linSpeed + angSpeed
    const targetIntensity = Math.min(rawTarget, shakeMax)
    const rampRate =
      targetIntensity > shakeIntensity.current ? params.shakeRampUp : params.shakeRampDown
    const rampA = 1 - Math.exp(-rampRate * dt)
    shakeIntensity.current += (targetIntensity - shakeIntensity.current) * rampA
    const total = shakeIntensity.current
    tRef.current += freq * dt
    if (total > 0.0001) {
      const t = tRef.current
      const o = offsets.current
      const n = noise.current
      // ImprovedNoise.noise(x,y,z) returns ~[-1,1]; we offset y per-axis for uncorrelated streams.
      const npx = n.noise(t, o.px, 0)
      const npy = n.noise(t, o.py, 0)
      const nrx = n.noise(t * 1.3, o.rx, 0)
      const nry = n.noise(t * 1.3, o.ry, 0)

      _right.set(1, 0, 0).applyQuaternion(camera.quaternion)
      _up.set(0, 1, 0).applyQuaternion(camera.quaternion)
      const posAmt = total * params.shakePositionAmount
      camera.position.addScaledVector(_right, npx * posAmt)
      camera.position.addScaledVector(_up, npy * posAmt)

      const rotAmt = total * params.shakeRotationAmount
      camera.rotateX(nrx * rotAmt)
      camera.rotateY(nry * rotAmt)
    }
  })

  return null
}
