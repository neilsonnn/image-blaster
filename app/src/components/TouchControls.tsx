import { useEffect, useRef, useState } from 'react'

interface JoystickState {
  origin: { x: number; y: number } | null
  current: { x: number; y: number } | null
}

const MAX_RADIUS = 40

export function TouchControls() {
  const [joystick, setJoystick] = useState<JoystickState>({ origin: null, current: null })
  const touchIdRef = useRef<number | null>(null)

  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      for (const touch of Array.from(e.changedTouches)) {
        if (touch.clientX < window.innerWidth / 2 && touchIdRef.current === null) {
          touchIdRef.current = touch.identifier
          setJoystick({
            origin: { x: touch.clientX, y: touch.clientY },
            current: { x: touch.clientX, y: touch.clientY },
          })
        }
      }
    }
    const onMove = (e: TouchEvent) => {
      for (const touch of Array.from(e.changedTouches)) {
        if (touch.identifier === touchIdRef.current) {
          setJoystick((prev) =>
            prev.origin
              ? { ...prev, current: { x: touch.clientX, y: touch.clientY } }
              : prev,
          )
        }
      }
    }
    const onEnd = (e: TouchEvent) => {
      for (const touch of Array.from(e.changedTouches)) {
        if (touch.identifier === touchIdRef.current) {
          touchIdRef.current = null
          setJoystick({ origin: null, current: null })
        }
      }
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
    }
  }, [])

  if (!joystick.origin) return null

  const dx = Math.max(-MAX_RADIUS, Math.min(MAX_RADIUS, (joystick.current?.x ?? joystick.origin.x) - joystick.origin.x))
  const dy = Math.max(-MAX_RADIUS, Math.min(MAX_RADIUS, (joystick.current?.y ?? joystick.origin.y) - joystick.origin.y))

  return (
    <div className="fixed inset-0 pointer-events-none md:hidden z-20">
      {/* Joystick base */}
      <div
        className="absolute rounded-full border-2 border-white/30 bg-white/10"
        style={{
          width: MAX_RADIUS * 2 + 40,
          height: MAX_RADIUS * 2 + 40,
          left: joystick.origin.x - (MAX_RADIUS + 20),
          top: joystick.origin.y - (MAX_RADIUS + 20),
        }}
      />
      {/* Joystick dot */}
      <div
        className="absolute rounded-full bg-white/60"
        style={{
          width: 28,
          height: 28,
          left: joystick.origin.x + dx - 14,
          top: joystick.origin.y + dy - 14,
        }}
      />
    </div>
  )
}
