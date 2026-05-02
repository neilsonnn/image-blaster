import { useEffect } from 'react'

const RIGHT_MOUSE_BUTTON = 2

interface Props {
  domElement: HTMLElement
  onDollyPixels: (deltaY: number) => void
}

function touchCentroidY(touches: TouchList) {
  let total = 0
  for (const touch of Array.from(touches)) total += touch.clientY
  return total / touches.length
}

export function useCameraDollyGestures({ domElement, onDollyPixels }: Props) {
  useEffect(() => {
    let rightDragging = false
    let lastMouseY = 0
    let twoFingerDragging = false
    let lastTouchY = 0

    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault()
    }

    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== RIGHT_MOUSE_BUTTON) return
      rightDragging = true
      lastMouseY = event.clientY
      event.preventDefault()
    }

    const onMouseMove = (event: MouseEvent) => {
      if (!rightDragging) return
      const deltaY = document.pointerLockElement === domElement ? event.movementY : event.clientY - lastMouseY
      lastMouseY = event.clientY
      onDollyPixels(deltaY)
      event.preventDefault()
    }

    const onMouseUp = (event: MouseEvent) => {
      if (event.button !== RIGHT_MOUSE_BUTTON) return
      rightDragging = false
      event.preventDefault()
    }

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) return
      twoFingerDragging = true
      lastTouchY = touchCentroidY(event.touches)
    }

    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 2) {
        twoFingerDragging = false
        return
      }

      const currentY = touchCentroidY(event.touches)
      if (twoFingerDragging) onDollyPixels(currentY - lastTouchY)
      lastTouchY = currentY
      twoFingerDragging = true
      event.preventDefault()
    }

    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length === 2) {
        lastTouchY = touchCentroidY(event.touches)
        twoFingerDragging = true
        return
      }
      twoFingerDragging = false
    }

    domElement.addEventListener('contextmenu', onContextMenu)
    domElement.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove, { passive: false })
    window.addEventListener('mouseup', onMouseUp, { passive: false })
    domElement.addEventListener('touchstart', onTouchStart, { passive: true })
    domElement.addEventListener('touchmove', onTouchMove, { passive: false })
    domElement.addEventListener('touchend', onTouchEnd)
    domElement.addEventListener('touchcancel', onTouchEnd)

    return () => {
      domElement.removeEventListener('contextmenu', onContextMenu)
      domElement.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      domElement.removeEventListener('touchstart', onTouchStart)
      domElement.removeEventListener('touchmove', onTouchMove)
      domElement.removeEventListener('touchend', onTouchEnd)
      domElement.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [domElement, onDollyPixels])
}
