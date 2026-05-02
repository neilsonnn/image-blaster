import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { ThreeEvent, useThree } from '@react-three/fiber'
import { type RapierRigidBody, useBeforePhysicsStep, useRapier } from '@react-three/rapier'
import * as THREE from 'three'
import { markObjectInteraction } from '../interaction/pointerGuards'
import type { SceneObjectHandle } from './SceneObject'

const RELEASE_SPEED_LIMIT = 18

type ObjectRefMap = Map<string, RefObject<SceneObjectHandle | null>>

interface UseObjectGrabArgs {
  anchorRef: RefObject<RapierRigidBody | null>
  objectRefs: RefObject<ObjectRefMap>
}

interface ActiveGrab {
  objectId: string
  body: RapierRigidBody
  pointerId: number
  depth: number
  pointerNdc: THREE.Vector2
  target: THREE.Vector3
  previousTarget: THREE.Vector3
  releaseVelocity: THREE.Vector3
}

const _raycaster = new THREE.Raycaster()
const _cameraDirection = new THREE.Vector3()
const _bodyPosition = new THREE.Vector3()
const _bodyRotation = new THREE.Quaternion()
const _inverseBodyRotation = new THREE.Quaternion()
const _localAnchor = new THREE.Vector3()
const _zeroVector = { x: 0, y: 0, z: 0 }

function vectorLike(vector: THREE.Vector3) {
  return { x: vector.x, y: vector.y, z: vector.z }
}

function quaternionLike(quaternion: THREE.Quaternion) {
  return { x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w }
}

function computePointerNdc(element: HTMLElement, clientX: number, clientY: number) {
  const rect = element.getBoundingClientRect()
  return new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  )
}

function computeLocalAnchor(body: RapierRigidBody, worldPoint: THREE.Vector3) {
  const translation = body.translation()
  const rotation = body.rotation()

  _bodyPosition.set(translation.x, translation.y, translation.z)
  _bodyRotation.set(rotation.x, rotation.y, rotation.z, rotation.w)
  _inverseBodyRotation.copy(_bodyRotation).invert()

  return _localAnchor.copy(worldPoint).sub(_bodyPosition).applyQuaternion(_inverseBodyRotation).clone()
}

export function useObjectGrab({ anchorRef, objectRefs }: UseObjectGrabArgs) {
  const { camera, gl } = useThree()
  const { rapier, world } = useRapier()
  const activeGrabRef = useRef<ActiveGrab | null>(null)
  const jointRef = useRef<ReturnType<typeof world.createImpulseJoint> | null>(null)

  const updatePointerTarget = useCallback(
    (grab: ActiveGrab) => {
      _raycaster.setFromCamera(grab.pointerNdc, camera)
      grab.target.copy(_raycaster.ray.origin).addScaledVector(_raycaster.ray.direction, grab.depth)
    },
    [camera],
  )

  const endGrab = useCallback(() => {
    const activeGrab = activeGrabRef.current
    if (!activeGrab) return

    if (jointRef.current) {
      world.removeImpulseJoint(jointRef.current, true)
      jointRef.current = null
    }

    const releaseVelocity = activeGrab.releaseVelocity.clone()
    if (releaseVelocity.length() > RELEASE_SPEED_LIMIT) {
      releaseVelocity.setLength(RELEASE_SPEED_LIMIT)
    }
    activeGrab.body.setLinvel(vectorLike(releaseVelocity), true)
    activeGrab.body.wakeUp()

    if (gl.domElement.hasPointerCapture(activeGrab.pointerId)) {
      gl.domElement.releasePointerCapture(activeGrab.pointerId)
    }

    activeGrabRef.current = null
    markObjectInteraction()
  }, [gl.domElement, world])

  const beginGrab = useCallback(
    (objectId: string, handle: SceneObjectHandle, pointerId: number, clientX: number, clientY: number, worldPoint: THREE.Vector3) => {
      const body = handle.rigidBody
      const anchor = anchorRef.current
      if (!body || !anchor) return

      endGrab()

      const pointerNdc = computePointerNdc(gl.domElement, clientX, clientY)
      camera.getWorldDirection(_cameraDirection)
      const depth = Math.max(worldPoint.clone().sub(camera.position).dot(_cameraDirection), 0.1)

      anchor.setTranslation(vectorLike(worldPoint), true)
      anchor.setNextKinematicTranslation(vectorLike(worldPoint))
      body.wakeUp()

      const bodyAnchor = computeLocalAnchor(body, worldPoint)
      jointRef.current = world.createImpulseJoint(
        rapier.JointData.spherical(_zeroVector, vectorLike(bodyAnchor)),
        anchor,
        body,
        true,
      )

      if (!gl.domElement.hasPointerCapture(pointerId)) {
        gl.domElement.setPointerCapture(pointerId)
      }

      activeGrabRef.current = {
        objectId,
        body,
        pointerId,
        depth,
        pointerNdc,
        target: worldPoint.clone(),
        previousTarget: worldPoint.clone(),
        releaseVelocity: new THREE.Vector3(),
      }
    },
    [anchorRef, camera, endGrab, gl.domElement, rapier.JointData, world],
  )

  const onPointerDown = useCallback(
    (objectId: string, event: ThreeEvent<PointerEvent>) => {
      const objectRef = objectRefs.current.get(objectId)
      const handle = objectRef?.current
      if (!handle?.rigidBody) return
      if (event.button !== 0) return

      event.stopPropagation()
      event.nativeEvent.preventDefault()
      markObjectInteraction()
      beginGrab(objectId, handle, event.pointerId, event.clientX, event.clientY, event.point.clone())
    },
    [beginGrab, objectRefs],
  )

  const resetObjects = useCallback(() => {
    endGrab()
    for (const objectRef of objectRefs.current.values()) {
      const handle = objectRef.current
      const body = handle?.rigidBody
      if (!handle || !body) continue

      body.setTranslation(vectorLike(handle.initialPosition), true)
      body.setRotation(quaternionLike(handle.initialRotation), true)
      body.setLinvel(_zeroVector, true)
      body.setAngvel(_zeroVector, true)
      body.wakeUp()
    }
  }, [endGrab, objectRefs])

  useBeforePhysicsStep((physicsWorld) => {
    const activeGrab = activeGrabRef.current
    const anchor = anchorRef.current
    if (!activeGrab || !anchor) return

    updatePointerTarget(activeGrab)
    const dt = physicsWorld.timestep || 1 / 60
    activeGrab.releaseVelocity.copy(activeGrab.target).sub(activeGrab.previousTarget).divideScalar(dt)
    activeGrab.previousTarget.copy(activeGrab.target)
    anchor.setNextKinematicTranslation(vectorLike(activeGrab.target))
  })

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const activeGrab = activeGrabRef.current
      if (activeGrab && event.pointerId === activeGrab.pointerId) {
        activeGrab.pointerNdc.copy(computePointerNdc(gl.domElement, event.clientX, event.clientY))
        event.preventDefault()
        return
      }

    }

    const onPointerEnd = (event: PointerEvent) => {
      if (activeGrabRef.current?.pointerId === event.pointerId) {
        event.preventDefault()
        endGrab()
      }
    }

    window.addEventListener('pointermove', onPointerMove, { capture: true, passive: false })
    window.addEventListener('pointerup', onPointerEnd, { capture: true, passive: false })
    window.addEventListener('pointercancel', onPointerEnd, { capture: true, passive: false })
    return () => {
      window.removeEventListener('pointermove', onPointerMove, { capture: true })
      window.removeEventListener('pointerup', onPointerEnd, { capture: true })
      window.removeEventListener('pointercancel', onPointerEnd, { capture: true })
      endGrab()
    }
  }, [endGrab, gl.domElement])

  return {
    activeObjectId: activeGrabRef.current?.objectId ?? null,
    onPointerDown,
    resetObjects,
  }
}
