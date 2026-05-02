import { createRef, useEffect, useRef, useState, type RefObject } from 'react'
import { RigidBody, type RapierRigidBody } from '@react-three/rapier'
import type { WorldObjectAsset } from '../../types/world'
import { useDebugStore } from '../../store/debug'
import { SceneObject, type SceneObjectHandle } from './SceneObject'
import { useObjectGrab } from './useObjectGrab'

const GRID_CELL_SIZE = 1

interface Props {
  objects: WorldObjectAsset[]
}

function gridPosition(index: number, total: number): [number, number, number] {
  const columns = Math.ceil(Math.sqrt(total))
  const rows = Math.ceil(total / columns)
  const column = index % columns
  const row = Math.floor(index / columns)

  return [
    (column - (columns - 1) / 2) * GRID_CELL_SIZE,
    0,
    (row - (rows - 1) / 2) * GRID_CELL_SIZE,
  ]
}

export function ObjectGrid({ objects }: Props) {
  const [hoveredObjectId, setHoveredObjectId] = useState<string | null>(null)
  const objectRenderMode = useDebugStore((s) => s.objectRenderMode)
  const objectResetToken = useDebugStore((s) => s.objectResetToken)
  const objectRefs = useRef(new Map<string, RefObject<SceneObjectHandle | null>>())
  const anchorRef = useRef<RapierRigidBody>(null)
  const { onPointerDown, resetObjects } = useObjectGrab({ anchorRef, objectRefs })

  useEffect(() => {
    const objectIds = new Set(objects.map((object) => object.id))
    for (const id of objectRefs.current.keys()) {
      if (!objectIds.has(id)) objectRefs.current.delete(id)
    }
  }, [objects])

  useEffect(() => {
    if (objectResetToken > 0) resetObjects()
  }, [objectResetToken, resetObjects])

  const getObjectRef = (objectId: string) => {
    let objectRef = objectRefs.current.get(objectId)
    if (!objectRef) {
      objectRef = createRef<SceneObjectHandle>()
      objectRefs.current.set(objectId, objectRef)
    }
    return objectRef
  }

  if (!objects.length) return null

  return (
    <>
      <RigidBody ref={anchorRef} type="kinematicPosition" colliders={false} position={[0, -1000, 0]} />
      {objects.map((object, index) => (
        <SceneObject
          key={object.id}
          ref={getObjectRef(object.id)}
          object={object}
          position={gridPosition(index, objects.length)}
          renderMode={objectRenderMode}
          isHovered={hoveredObjectId === object.id}
          onHover={(objectId, hovering) => {
            setHoveredObjectId((current) => {
              if (hovering) return objectId
              return current === objectId ? null : current
            })
          }}
          onPointerDown={(event) => onPointerDown(object.id, event)}
        />
      ))}
    </>
  )
}
