import { useRef, useEffect, forwardRef, useImperativeHandle, useCallback } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useCameraGestures } from '../camera/useCameraGestures'
import { cameraFocusTarget } from '../camera/cameraFocus'
import { useDebugStore } from '../../store/debug'
import { isEditableTarget } from '../../utils/dom'
import { CHARACTER_SPAWN } from './spawn'

export interface FlyControllerHandle {
  reset: () => void
}

interface FlyControllerProps {
  preserveCameraOnMount?: boolean
}

const SPEED = 6
const SHIFT_MULT = 3
const SMOOTH = 0.12
const DOLLY_UNITS_PER_PIXEL = 0.02
const DEFAULT_YAW = 0

const _forward = new THREE.Vector3()
const _dollyForward = new THREE.Vector3()
const _right = new THREE.Vector3()
const _up = new THREE.Vector3(0, 1, 0)
const _move = new THREE.Vector3()
const _euler = new THREE.Euler(0, 0, 0, 'YXZ')

export const FlyController = forwardRef<FlyControllerHandle, FlyControllerProps>(function FlyController({ preserveCameraOnMount = false }, ref) {
  const { camera, gl } = useThree()
  const mouseSensitivity = useDebugStore((s) => s.flyMouseSensitivity)
  const keys = useRef(new Set<string>())
  const rawYaw = useRef(0)
  const rawPitch = useRef(0)
  const smoothYaw = useRef(0)
  const smoothPitch = useRef(0)

  const reset = useCallback(() => {
    camera.position.set(CHARACTER_SPAWN.x, CHARACTER_SPAWN.y, CHARACTER_SPAWN.z)
    cameraFocusTarget.current = null
    keys.current.clear()
    rawYaw.current = DEFAULT_YAW
    rawPitch.current = 0
    smoothYaw.current = DEFAULT_YAW
    smoothPitch.current = 0
    camera.quaternion.setFromEuler(_euler.set(0, DEFAULT_YAW, 0))
  }, [camera])

  const preserveCamera = useCallback(() => {
    cameraFocusTarget.current = null
    keys.current.clear()
    _euler.setFromQuaternion(camera.quaternion, 'YXZ')
    rawYaw.current = _euler.y
    rawPitch.current = _euler.x
    smoothYaw.current = _euler.y
    smoothPitch.current = _euler.x
  }, [camera])

  const applyDolly = useCallback((deltaY: number) => {
    _dollyForward.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize()
    camera.position.addScaledVector(_dollyForward, -deltaY * DOLLY_UNITS_PER_PIXEL)
  }, [camera])

  const applyTumble = useCallback((dx: number, dy: number) => {
    cameraFocusTarget.current = null
    rawYaw.current -= dx * mouseSensitivity
    rawPitch.current -= dy * mouseSensitivity
    rawPitch.current = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, rawPitch.current))
  }, [mouseSensitivity])

  useCameraGestures({ domElement: gl.domElement, onDollyPixels: applyDolly, onTumblePixels: applyTumble })

  useImperativeHandle(ref, () => ({
    reset,
  }), [reset])

  useEffect(() => {
    if (preserveCameraOnMount) preserveCamera()
    else reset()
  }, [preserveCamera, preserveCameraOnMount, reset])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) {
        keys.current.delete(e.code)
        return
      }
      if (e.type === 'keydown') keys.current.add(e.code)
      else keys.current.delete(e.code)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)

    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
    }
  }, [gl])

  useFrame((_state, delta) => {
    // Camera focus: lerp rawYaw/rawPitch toward clicked object (only when pointer is not locked)
    const focusTarget = cameraFocusTarget.current
    if (focusTarget && document.pointerLockElement !== gl.domElement) {
      const dir = new THREE.Vector3().subVectors(focusTarget, camera.position).normalize()
      const targetPitch = Math.asin(Math.max(-1, Math.min(1, dir.y)))
      const targetYaw = Math.atan2(-dir.x, -dir.z)
      const t = 1 - Math.pow(0.04, delta)  // ~smooth decay
      // wrap yaw diff to [-π, π] to avoid spinning the long way
      const yawDiff = ((targetYaw - rawYaw.current + Math.PI * 3) % (Math.PI * 2)) - Math.PI
      rawYaw.current += yawDiff * t
      rawPitch.current += (targetPitch - rawPitch.current) * t
      rawPitch.current = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, rawPitch.current))
      if (Math.abs(yawDiff * t) < 0.0005 && Math.abs((targetPitch - rawPitch.current) * t) < 0.0005) {
        cameraFocusTarget.current = null
      }
    }

    smoothYaw.current += (rawYaw.current - smoothYaw.current) * (1 - Math.pow(1 - SMOOTH, 1))
    smoothPitch.current += (rawPitch.current - smoothPitch.current) * (1 - Math.pow(1 - SMOOTH, 1))
    _euler.set(smoothPitch.current, smoothYaw.current, 0)
    camera.quaternion.setFromEuler(_euler)

    let fwd = 0, strafe = 0, vert = 0
    const k = keys.current
    if (k.has('KeyW') || k.has('ArrowUp')) fwd += 1
    if (k.has('KeyS') || k.has('ArrowDown')) fwd -= 1
    if (k.has('KeyA') || k.has('ArrowLeft')) strafe -= 1
    if (k.has('KeyD') || k.has('ArrowRight')) strafe += 1
    if (k.has('KeyE')) vert += 1
    if (k.has('KeyQ')) vert -= 1

    _forward.set(0, 0, -1).applyQuaternion(camera.quaternion)
    _right.set(1, 0, 0).applyQuaternion(camera.quaternion)
    _move.set(0, 0, 0)
      .addScaledVector(_forward, fwd)
      .addScaledVector(_right, strafe)
      .addScaledVector(_up, vert)
    if (_move.lengthSq() > 1) _move.normalize()

    const speed = SPEED * (k.has('ShiftLeft') || k.has('ShiftRight') ? SHIFT_MULT : 1)
    camera.position.addScaledVector(_move, speed * delta)
  })

  return null
})
