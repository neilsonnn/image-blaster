import { useRef, useEffect, useState, forwardRef, useImperativeHandle, useCallback } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { RigidBody, CapsuleCollider, useRapier } from '@react-three/rapier'
import * as THREE from 'three'
import { useCameraGestures } from '../camera/useCameraGestures'
import { useDebugStore } from '../../store/debug'
import { isEditableTarget } from '../../utils/dom'
import {
  CAMERA_EYE_OFFSET,
  CHARACTER_BODY_SPAWN,
  CHARACTER_BODY_SPAWN_POSITION,
  CHARACTER_HEIGHT,
} from './spawn'

export interface CharacterControllerHandle {
  reset: () => void
}

const SPEED = 4
const JUMP_VELOCITY = 3
const MOUSE_SMOOTHING = 0.12
const DOLLY_UNITS_PER_PIXEL = 0.01
const CHARACTER_RADIUS = 0.25
const CHARACTER_HALF_SEGMENT = CHARACTER_HEIGHT / 2 - CHARACTER_RADIUS
const GROUND_CHECK_DISTANCE = CAMERA_EYE_OFFSET + 0.08
const DEFAULT_YAW = 0

const _forward = new THREE.Vector3()
const _right = new THREE.Vector3()
const _dollyForward = new THREE.Vector3()
const _move = new THREE.Vector3()
const _euler = new THREE.Euler(0, 0, 0, 'YXZ')

export const CharacterController = forwardRef<CharacterControllerHandle>(
  function CharacterController(_, ref) {
  const bodyRef = useRef<React.ComponentRef<typeof RigidBody>>(null)
  const { camera, gl } = useThree()
  const mouseSensitivity = useDebugStore((s) => s.flyMouseSensitivity)
  const { rapier, world } = useRapier()

  const keys = useRef(new Set<string>())
  const jumpQueued = useRef(false)
  const rawYaw = useRef(DEFAULT_YAW)
  const rawPitch = useRef(0)
  const smoothYaw = useRef(DEFAULT_YAW)
  const smoothPitch = useRef(0)
  const touchLook = useRef<{ id: number; x: number; y: number } | null>(null)
  const touchMove = useRef<{ id: number; x: number; y: number } | null>(null)
  const [joystickPos, setJoystickPos] = useState({ x: 0, y: 0 })

  useImperativeHandle(ref, () => ({
    reset: () => {
      if (!bodyRef.current) return
      bodyRef.current.setTranslation(CHARACTER_BODY_SPAWN, true)
      bodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true)
      bodyRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true)
      rawYaw.current = DEFAULT_YAW
      rawPitch.current = 0
      smoothYaw.current = DEFAULT_YAW
      smoothPitch.current = 0
      keys.current.clear()
      camera.quaternion.setFromEuler(_euler.set(0, DEFAULT_YAW, 0))
    },
  }))

  const applyDolly = useCallback((deltaY: number) => {
    const body = bodyRef.current
    if (!body) return

    _dollyForward.set(0, 0, -1).applyQuaternion(camera.quaternion).setY(0)
    if (_dollyForward.lengthSq() < 0.0001) return
    _dollyForward.normalize()

    const amount = -deltaY * DOLLY_UNITS_PER_PIXEL
    const position = body.translation()
    body.setTranslation(
      {
        x: position.x + _dollyForward.x * amount,
        y: position.y,
        z: position.z + _dollyForward.z * amount,
      },
      true,
    )
    body.wakeUp()
  }, [camera])

  const applyLook = useCallback((dx: number, dy: number) => {
    rawYaw.current -= dx * mouseSensitivity
    rawPitch.current -= dy * mouseSensitivity
    rawPitch.current = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, rawPitch.current))
  }, [mouseSensitivity])

  useCameraGestures({ domElement: gl.domElement, onDollyPixels: applyDolly, onTumblePixels: applyLook })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) {
        keys.current.delete(e.code)
        return
      }
      if (e.type === 'keydown') {
        keys.current.add(e.code)
        if (e.code === 'Space' && !e.repeat) {
          jumpQueued.current = true
          e.preventDefault()
        }
      } else {
        keys.current.delete(e.code)
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)

    // Touch handlers
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length >= 2) return
      for (const touch of Array.from(e.changedTouches)) {
        const isLeft = touch.clientX < window.innerWidth / 2
        if (isLeft && !touchMove.current) {
          touchMove.current = { id: touch.identifier, x: touch.clientX, y: touch.clientY }
          setJoystickPos({ x: touch.clientX, y: touch.clientY })
        } else if (!isLeft && !touchLook.current) {
          touchLook.current = { id: touch.identifier, x: touch.clientX, y: touch.clientY }
        }
      }
    }
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length >= 2) return
      for (const touch of Array.from(e.changedTouches)) {
        if (touchLook.current?.id === touch.identifier) {
          const dx = touch.clientX - touchLook.current.x
          const dy = touch.clientY - touchLook.current.y
          rawYaw.current -= dx * 0.004
          rawPitch.current -= dy * 0.004
          rawPitch.current = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, rawPitch.current))
          touchLook.current = { id: touch.identifier, x: touch.clientX, y: touch.clientY }
        }
        if (touchMove.current?.id === touch.identifier) {
          touchMove.current = { ...touchMove.current, x: touch.clientX, y: touch.clientY }
        }
      }
    }
    const onTouchEnd = (e: TouchEvent) => {
      for (const touch of Array.from(e.changedTouches)) {
        if (touchLook.current?.id === touch.identifier) touchLook.current = null
        if (touchMove.current?.id === touch.identifier) {
          touchMove.current = null
          setJoystickPos({ x: 0, y: 0 })
        }
      }
    }
    gl.domElement.addEventListener('touchstart', onTouchStart, { passive: true })
    gl.domElement.addEventListener('touchmove', onTouchMove, { passive: true })
    gl.domElement.addEventListener('touchend', onTouchEnd, { passive: true })

    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
      gl.domElement.removeEventListener('touchstart', onTouchStart)
      gl.domElement.removeEventListener('touchmove', onTouchMove)
      gl.domElement.removeEventListener('touchend', onTouchEnd)
    }
  }, [gl.domElement])

  useFrame((_state, delta) => {
    const body = bodyRef.current
    if (!body) return

    const smoothing = 1 - Math.pow(1 - MOUSE_SMOOTHING, delta * 60)
    smoothYaw.current += (rawYaw.current - smoothYaw.current) * smoothing
    smoothPitch.current += (rawPitch.current - smoothPitch.current) * smoothing

    _euler.set(smoothPitch.current, smoothYaw.current, 0)
    camera.quaternion.setFromEuler(_euler)

    // Compute move direction from keys + touch joystick
    let fwd = 0, strafe = 0
    if (keys.current.has('KeyW') || keys.current.has('ArrowUp')) fwd += 1
    if (keys.current.has('KeyS') || keys.current.has('ArrowDown')) fwd -= 1
    if (keys.current.has('KeyA') || keys.current.has('ArrowLeft')) strafe -= 1
    if (keys.current.has('KeyD') || keys.current.has('ArrowRight')) strafe += 1

    if (touchMove.current) {
      const origin = joystickPos
      const dx = (touchMove.current.x - origin.x) / 50
      const dy = (touchMove.current.y - origin.y) / 50
      strafe += Math.max(-1, Math.min(1, dx))
      fwd -= Math.max(-1, Math.min(1, dy))
    }

    _forward.set(0, 0, -1).applyQuaternion(camera.quaternion).setY(0).normalize()
    _right.set(1, 0, 0).applyQuaternion(camera.quaternion).setY(0).normalize()
    _move.set(0, 0, 0).addScaledVector(_forward, fwd).addScaledVector(_right, strafe)
    if (_move.lengthSq() > 1) _move.normalize()

    const vel = body.linvel()
    let nextY = vel.y
    if (jumpQueued.current) {
      const pos = body.translation()
      const ray = new rapier.Ray(
        { x: pos.x, y: pos.y, z: pos.z },
        { x: 0, y: -1, z: 0 },
      )
      const grounded = Boolean(world.castRay(ray, GROUND_CHECK_DISTANCE, true, undefined, undefined, undefined, body))
      if (grounded) nextY = JUMP_VELOCITY
      jumpQueued.current = false
    }
    body.setLinvel({ x: _move.x * SPEED, y: nextY, z: _move.z * SPEED }, true)

    // Sync camera position to body
    const pos = body.translation()
    camera.position.set(pos.x, pos.y + CAMERA_EYE_OFFSET, pos.z)
  })

  return (
    <RigidBody
      ref={bodyRef}
      position={CHARACTER_BODY_SPAWN_POSITION}
      enabledRotations={[false, false, false]}
      linearDamping={0}
    >
      <CapsuleCollider args={[CHARACTER_HALF_SEGMENT, CHARACTER_RADIUS]} />
    </RigidBody>
  )
})
