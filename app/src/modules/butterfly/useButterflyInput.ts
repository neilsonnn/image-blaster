import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { useButterflyStore } from './store'

export interface ButterflyInput {
  keys: React.MutableRefObject<Set<string>>
  yaw: React.MutableRefObject<number>
  pitch: React.MutableRefObject<number>
  distance: React.MutableRefObject<number>
  targetDistance: React.MutableRefObject<number>
  touchMoveVec: React.MutableRefObject<{ x: number; y: number }>
  touchVertical: React.MutableRefObject<number>
  rightMouseDown: React.MutableRefObject<boolean>
}

const PITCH_LIMIT = Math.PI / 2.1

export function useButterflyInput(): ButterflyInput {
  const { gl } = useThree()
  const keys = useRef(new Set<string>())
  const yaw = useRef(useButterflyStore.getState().defaultYaw)
  const pitch = useRef(useButterflyStore.getState().defaultPitch)
  const distance = useRef(useButterflyStore.getState().defaultDistance)
  const targetDistance = useRef(useButterflyStore.getState().defaultDistance)
  const touchMoveVec = useRef({ x: 0, y: 0 })
  const touchVertical = useRef(0)
  const rightMouseDown = useRef(false)

  useEffect(() => {
    const isEditable = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false
      const tag = el.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
      if (el.isContentEditable) return true
      return false
    }

    const onKey = (e: KeyboardEvent) => {
      if (isEditable(e.target)) {
        keys.current.delete(e.code)
        return
      }
      if (e.type === 'keydown') {
        keys.current.add(e.code)
        if (e.code === 'KeyP') {
          const s = useButterflyStore.getState()
          s.setParam('paused', !s.paused)
        }
      } else {
        keys.current.delete(e.code)
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)

    const onBlur = () => keys.current.clear()
    window.addEventListener('blur', onBlur)

    const requestLock = (e: MouseEvent) => {
      if (e.shiftKey) return
      if (document.pointerLockElement !== gl.domElement) {
        gl.domElement.requestPointerLock()
      }
    }
    gl.domElement.addEventListener('click', requestLock)

    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== gl.domElement) return
      const st = useButterflyStore.getState()
      const s = st.mouseSensitivity
      const ySign = st.invertY ? 1 : -1
      yaw.current -= e.movementX * s
      pitch.current += e.movementY * s * ySign
      pitch.current = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch.current))
    }
    document.addEventListener('mousemove', onMouseMove)

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const s = useButterflyStore.getState()
      targetDistance.current = Math.max(
        s.minDistance,
        Math.min(s.maxDistance, targetDistance.current + e.deltaY * 0.01 * s.zoomSpeed),
      )
    }
    gl.domElement.addEventListener('wheel', onWheel, { passive: false })

    const onContextMenu = (e: MouseEvent) => e.preventDefault()
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 2) rightMouseDown.current = true
    }
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 2) rightMouseDown.current = false
    }
    gl.domElement.addEventListener('contextmenu', onContextMenu)
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mouseup', onMouseUp)

    const touches = new Map<number, { x: number; y: number }>()
    let moveTouchId: number | null = null
    let lookTouchId: number | null = null
    let moveOrigin = { x: 0, y: 0 }
    let pinchStartDist: number | null = null
    let pinchStartDistance = targetDistance.current

    const onTouchStart = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        touches.set(t.identifier, { x: t.clientX, y: t.clientY })
        const isLeft = t.clientX < window.innerWidth / 2
        if (isLeft && moveTouchId === null) {
          moveTouchId = t.identifier
          moveOrigin = { x: t.clientX, y: t.clientY }
        } else if (!isLeft && lookTouchId === null) {
          lookTouchId = t.identifier
        }
      }
      if (touches.size === 2) {
        const [a, b] = Array.from(touches.values())
        pinchStartDist = Math.hypot(b.x - a.x, b.y - a.y)
        pinchStartDistance = targetDistance.current
      }
    }
    const onTouchMove = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        const prev = touches.get(t.identifier)
        touches.set(t.identifier, { x: t.clientX, y: t.clientY })
        if (t.identifier === lookTouchId && prev) {
          const st = useButterflyStore.getState()
          const s = st.mouseSensitivity
          const ySign = st.invertY ? 1 : -1
          yaw.current -= (t.clientX - prev.x) * s * 1.5
          pitch.current += (t.clientY - prev.y) * s * 1.5 * ySign
          pitch.current = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch.current))
        }
        if (t.identifier === moveTouchId) {
          const dx = (t.clientX - moveOrigin.x) / 50
          const dy = (t.clientY - moveOrigin.y) / 50
          touchMoveVec.current.x = Math.max(-1, Math.min(1, dx))
          touchMoveVec.current.y = Math.max(-1, Math.min(1, -dy))
        }
      }
      if (touches.size === 2 && pinchStartDist) {
        const [a, b] = Array.from(touches.values())
        const d = Math.hypot(b.x - a.x, b.y - a.y)
        const s = useButterflyStore.getState()
        targetDistance.current = Math.max(
          s.minDistance,
          Math.min(s.maxDistance, pinchStartDistance * (pinchStartDist / d)),
        )
      }
    }
    const onTouchEnd = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        touches.delete(t.identifier)
        if (t.identifier === moveTouchId) {
          moveTouchId = null
          touchMoveVec.current.x = 0
          touchMoveVec.current.y = 0
        }
        if (t.identifier === lookTouchId) lookTouchId = null
      }
      if (touches.size < 2) pinchStartDist = null
    }
    gl.domElement.addEventListener('touchstart', onTouchStart, { passive: true })
    gl.domElement.addEventListener('touchmove', onTouchMove, { passive: true })
    gl.domElement.addEventListener('touchend', onTouchEnd, { passive: true })
    gl.domElement.addEventListener('touchcancel', onTouchEnd, { passive: true })

    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
      window.removeEventListener('blur', onBlur)
      gl.domElement.removeEventListener('click', requestLock)
      document.removeEventListener('mousemove', onMouseMove)
      gl.domElement.removeEventListener('wheel', onWheel)
      gl.domElement.removeEventListener('contextmenu', onContextMenu)
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mouseup', onMouseUp)
      gl.domElement.removeEventListener('touchstart', onTouchStart)
      gl.domElement.removeEventListener('touchmove', onTouchMove)
      gl.domElement.removeEventListener('touchend', onTouchEnd)
      gl.domElement.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [gl])

  return { keys, yaw, pitch, distance, targetDistance, touchMoveVec, touchVertical, rightMouseDown }
}
