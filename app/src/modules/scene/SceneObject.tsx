import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import { ThreeEvent, useLoader } from '@react-three/fiber'
import { CuboidCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { ObjectRenderMode, type WorldObjectAsset } from '../../types/world'

export const OBJECT_SCALE = 0.5

const HOVER_DIM_FACTOR = 0.72
const SHADED_COLOR = new THREE.Color(0xb8b8b8)
const COLLIDER_WIREFRAME_COLOR = 0x00aaff

type PointerHandler = (event: ThreeEvent<PointerEvent>) => void
type HoverHandler = (objectId: string, hovering: boolean) => void

export interface SceneObjectHandle {
  id: string
  rigidBody: RapierRigidBody | null
  initialPosition: THREE.Vector3
  initialRotation: THREE.Quaternion
  bounds: THREE.Box3
}

interface Props {
  object: WorldObjectAsset
  position: [number, number, number]
  renderMode: ObjectRenderMode
  isHovered: boolean
  onHover: HoverHandler
  onPointerDown?: PointerHandler
  onPointerMove?: PointerHandler
  onPointerUp?: PointerHandler
  onPointerCancel?: PointerHandler
}

interface MeshMaterialState {
  mesh: THREE.Mesh
  litMaterials: THREE.Material | THREE.Material[]
  shadedMaterial: THREE.MeshStandardMaterial
  colorEntries: Array<{ material: THREE.Material & { color: THREE.Color }; baseColor: THREE.Color }>
}

function cloneMaterial(material: THREE.Material | THREE.Material[]): THREE.Material | THREE.Material[] {
  if (Array.isArray(material)) return material.map((m) => m.clone())
  return material.clone()
}

function asMaterialArray(material: THREE.Material | THREE.Material[]) {
  return Array.isArray(material) ? material : [material]
}

function hasColor(material: THREE.Material): material is THREE.Material & { color: THREE.Color } {
  return 'color' in material && material.color instanceof THREE.Color
}

export const SceneObject = forwardRef<SceneObjectHandle, Props>(function SceneObject(
  {
    object,
    position,
    renderMode,
    isHovered,
    onHover,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  },
  ref,
) {
  const rigidBodyRef = useRef<RapierRigidBody>(null)
  const gltf = useLoader(GLTFLoader, object.url)
  const initialPosition = useMemo(() => new THREE.Vector3(...position), [position])
  const initialRotation = useMemo(() => new THREE.Quaternion(), [])

  const {
    scene,
    wireframeOverlayScene,
    offset,
    bounds,
    colliderCenter,
    colliderHalfExtents,
    materialStates,
    wireframeMaterial,
    wireframeOverlayMaterial,
    colliderWireframeMaterial,
  } = useMemo(() => {
    const clonedScene = cloneSkeleton(gltf.scene)
    const overlayScene = cloneSkeleton(gltf.scene)
    const states: MeshMaterialState[] = []

    clonedScene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return

      const litMaterials = cloneMaterial(child.material)
      child.material = litMaterials
      const colorEntries = asMaterialArray(litMaterials)
        .filter(hasColor)
        .map((material) => ({
          material,
          baseColor: material.color.clone(),
        }))

      states.push({
        mesh: child,
        litMaterials,
        shadedMaterial: new THREE.MeshStandardMaterial({
          color: SHADED_COLOR,
          roughness: 0.75,
          metalness: 0,
        }),
        colorEntries,
      })
    })

    const overlayMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      wireframe: true,
      toneMapped: false,
      fog: false,
    })
    overlayScene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      child.material = overlayMaterial
      child.renderOrder = 1
    })

    const box = new THREE.Box3().setFromObject(clonedScene)
    const center = new THREE.Vector3()
    const size = new THREE.Vector3()
    box.getCenter(center)
    box.getSize(size)

    return {
      scene: clonedScene,
      wireframeOverlayScene: overlayScene,
      offset: new THREE.Vector3(-center.x, -box.min.y, -center.z),
      bounds: box.clone(),
      colliderCenter: new THREE.Vector3(0, (size.y * OBJECT_SCALE) / 2, 0),
      colliderHalfExtents: new THREE.Vector3(
        Math.max((size.x * OBJECT_SCALE) / 2, 0.01),
        Math.max((size.y * OBJECT_SCALE) / 2, 0.01),
        Math.max((size.z * OBJECT_SCALE) / 2, 0.01),
      ),
      materialStates: states,
      wireframeMaterial: new THREE.MeshBasicMaterial({
        color: 0xffffff,
        wireframe: true,
        toneMapped: false,
        fog: false,
      }),
      wireframeOverlayMaterial: overlayMaterial,
      colliderWireframeMaterial: new THREE.MeshBasicMaterial({
        color: COLLIDER_WIREFRAME_COLOR,
        wireframe: true,
        toneMapped: false,
        fog: false,
      }),
    }
  }, [gltf.scene])

  useEffect(() => {
    for (const state of materialStates) {
      if (renderMode === ObjectRenderMode.Wireframe) {
        state.mesh.material = wireframeMaterial
        continue
      }

      if (renderMode === ObjectRenderMode.ShadedWireframe) {
        state.mesh.material = state.shadedMaterial
        state.shadedMaterial.color.copy(SHADED_COLOR)
        if (isHovered) state.shadedMaterial.color.multiplyScalar(HOVER_DIM_FACTOR)
        continue
      }

      state.mesh.material = state.litMaterials
      for (const { material, baseColor } of state.colorEntries) {
        material.color.copy(baseColor)
        if (isHovered) material.color.multiplyScalar(HOVER_DIM_FACTOR)
      }
    }
  }, [isHovered, materialStates, renderMode, wireframeMaterial])

  useEffect(() => {
    return () => {
      wireframeMaterial.dispose()
      wireframeOverlayMaterial.dispose()
      colliderWireframeMaterial.dispose()
      for (const state of materialStates) {
        state.shadedMaterial.dispose()
        for (const material of asMaterialArray(state.litMaterials)) {
          material.dispose()
        }
      }
    }
  }, [colliderWireframeMaterial, materialStates, wireframeMaterial, wireframeOverlayMaterial])

  useImperativeHandle(
    ref,
    () => ({
      id: object.id,
      rigidBody: rigidBodyRef.current,
      initialPosition,
      initialRotation,
      bounds,
    }),
    [bounds, initialPosition, initialRotation, object.id],
  )

  return (
    <RigidBody
      ref={rigidBodyRef}
      type="dynamic"
      colliders={false}
      position={position}
      linearDamping={0.45}
      angularDamping={0.35}
      additionalSolverIterations={4}
      ccd
      canSleep
    >
      <CuboidCollider
        args={[colliderHalfExtents.x, colliderHalfExtents.y, colliderHalfExtents.z]}
        position={[colliderCenter.x, colliderCenter.y, colliderCenter.z]}
      />
      {renderMode !== ObjectRenderMode.Lit && (
        <mesh position={[colliderCenter.x, colliderCenter.y, colliderCenter.z]} material={colliderWireframeMaterial}>
          <boxGeometry args={[colliderHalfExtents.x * 2, colliderHalfExtents.y * 2, colliderHalfExtents.z * 2]} />
        </mesh>
      )}
      <group
        scale={OBJECT_SCALE}
        onPointerOver={(event) => {
          event.stopPropagation()
          onHover(object.id, true)
        }}
        onPointerOut={(event) => {
          event.stopPropagation()
          onHover(object.id, false)
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <primitive object={scene} position={offset} dispose={null} />
        {renderMode === ObjectRenderMode.ShadedWireframe && (
          <primitive object={wireframeOverlayScene} position={offset} dispose={null} />
        )}
      </group>
    </RigidBody>
  )
})
