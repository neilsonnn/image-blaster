import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

export interface FlyControllerHandle {
  reset: () => void
}

const SPEED = 6
const SHIFT_MULT = 3
const SMOOTH = 0.12

const _forward = new THREE.Vector3()
const _right = new THREE.Vector3()
const _up = new THREE.Vector3(0, 1, 0)
const _move = new THREE.Vector3()
const _euler = new THREE.Euler(0, 0, 0, 'YXZ')

export const FlyController = forwardRef<FlyControllerHandle>(function FlyController(_, ref) {
  const { camera, gl } = useThree()
  const keys = useRef(new Set<string>())
  const rawYaw = useRef(0)
  const rawPitch = useRef(0)
  const smoothYaw = useRef(0)
  const smoothPitch = useRef(0)

  useImperativeHandle(ref, () => ({
    reset: () => {
      camera.position.set(0, 1, 0)
      rawYaw.current = 0
      rawPitch.current = 0
      smoothYaw.current = 0
      smoothPitch.current = 0
    },
  }))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.type === 'keydown') keys.current.add(e.code)
      else keys.current.delete(e.code)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)

    const onPointerLock = (e: MouseEvent) => {
      if (e.shiftKey) return
      gl.domElement.requestPointerLock()
    }
    gl.domElement.addEventListener('click', onPointerLock)

    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== gl.domElement) return
      rawYaw.current -= e.movementX * 0.002
      rawPitch.current -= e.movementY * 0.002
      rawPitch.current = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, rawPitch.current))
    }
    document.addEventListener('mousemove', onMouseMove)

    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
      gl.domElement.removeEventListener('click', onPointerLock)
      document.removeEventListener('mousemove', onMouseMove)
    }
  }, [gl])

  useFrame((_state, delta) => {
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
    if (k.has('KeyE') || k.has('Space')) vert += 1
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
