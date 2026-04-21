import { useControls } from 'leva'
import { useDebugStore } from '../store/debug'

export function DebugPanel() {
  const setShowColliders = useDebugStore((s) => s.setShowColliders)

  useControls({
    showColliders: {
      value: false,
      label: 'Show Colliders',
      onChange: setShowColliders,
    },
  })

  return null
}
