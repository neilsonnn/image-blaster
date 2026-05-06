import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { TransformControls } from '@react-three/drei'
import { ThreeEvent, useLoader, useThree } from '@react-three/fiber'
import { useLocation } from 'wouter'
import {
  ArrowLeft,
  ArrowUUpLeft,
  ArrowUUpRight,
  ArrowsOutCardinal,
  Copy,
  CornersOut,
  FloppyDisk,
  FolderOpen,
  Trash,
  ArrowClockwise,
  ArrowDown,
  Cube,
  GlobeSimple,
  Plus,
} from '@phosphor-icons/react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { AppButton } from '../../components/AppButton'
import { ChromePanel, ChromeThumbnail, chrome } from '../../components/AppChrome'
import { ObjectRenderMode, type WorldObjectAsset, type WorldObjectPhysics, type WorldObjectPlacement, type WorldSceneProject } from '../../types/world'
import { OBJECT_SCALE } from './SceneObject'
import { getInitialPlacements } from './placements'
import { DROP_TARGET_LAYER } from './dropTargets'

export type TransformMode = 'translate' | 'rotate' | 'scale'
type TransformField = 'position' | 'rotation' | 'scale'
type TransformAxis = 0 | 1 | 2

interface EditorStateArgs {
  slug: string
  objects: WorldObjectAsset[]
  allObjectAssets: WorldObjectAsset[]
  sceneProject?: WorldSceneProject
  sceneProjectReady: boolean
  editing: boolean
  onProjectSaved?: (project: WorldSceneProject) => void
}

interface EditableObjectProps {
  asset: WorldObjectAsset
  placement: WorldObjectPlacement
  selected: boolean
  renderMode: ObjectRenderMode
  onSelect: (event: ThreeEvent<MouseEvent>, instanceId: string) => void
  setRef?: (group: THREE.Group | null) => void
}

interface PlacementEditorSceneProps {
  controller: PlacementEditorController
  renderMode: ObjectRenderMode
}

interface PlacementEditorOverlayProps {
  controller: PlacementEditorController
}

export interface PlacementEditorController {
  slug: string
  objects: WorldObjectAsset[]
  allObjectAssets: WorldObjectAsset[]
  visibleAssetLibrary: WorldObjectAsset[]
  assetFilter: 'world' | 'all'
  setAssetFilter: (filter: 'world' | 'all') => void
  assetsById: Map<string, WorldObjectAsset>
  instances: WorldObjectPlacement[]
  selectedId: string | null
  selectedInstance?: WorldObjectPlacement
  mode: TransformMode
  setMode: (mode: TransformMode) => void
  saveStatus: 'idle' | 'saving' | 'saved' | 'error'
  dirty: boolean
  canUndo: boolean
  canRedo: boolean
  setSelectedId: Dispatch<SetStateAction<string | null>>
  selectInstance: (event: ThreeEvent<MouseEvent>, instanceId: string) => void
  selectFromOverlay: (instanceId: string) => void
  commitInstances: (next: WorldObjectPlacement[]) => void
  duplicateSelected: () => void
  duplicateInstance: (instanceId: string) => void
  deleteSelected: () => void
  deleteInstance: (instanceId: string) => void
  addAsset: (asset: WorldObjectAsset) => void
  dropSelectedToFloor: () => void
  setDropSelectedToFloorHandler: (handler: (() => void) | null) => void
  updateSelectedTransform: (field: TransformField, axis: TransformAxis, value: number) => void
  updateSelectedPhysics: (physics: WorldObjectPhysics) => void
  undo: () => void
  redo: () => void
  resetEdits: () => void
  openWorldFolder: () => void
  saveProject: () => Promise<boolean>
  setFlushSelectedTransformHandler: (handler: (() => WorldObjectPlacement[] | null) | null) => void
}

const HISTORY_LIMIT = 80
const PASTE_OFFSET: [number, number, number] = [0.25, 0, 0.25]
const ROTATION_SNAP_DEGREES = 5
const projectVersion = 1
const ignoreRaycast: THREE.Object3D['raycast'] = () => {}
const TRANSFORM_FIELDS: Array<{ field: TransformField; label: string; step: number }> = [
  { field: 'position', label: 'Pos', step: 0.01 },
  { field: 'rotation', label: 'Rot', step: ROTATION_SNAP_DEGREES },
  { field: 'scale', label: 'Scale', step: 0.01 },
]
const TRANSFORM_AXES: Array<{ axis: TransformAxis; label: string }> = [
  { axis: 0, label: 'X' },
  { axis: 1, label: 'Y' },
  { axis: 2, label: 'Z' },
]

function clonePlacements(instances: WorldObjectPlacement[]): WorldObjectPlacement[] {
  return instances.map((instance) => ({
    ...instance,
    physics: instance.physics ?? 'rigidbody',
    position: [...instance.position],
    rotation: [...instance.rotation],
    scale: [...instance.scale],
  }))
}

function signature(instances: WorldObjectPlacement[]) {
  return JSON.stringify(instances)
}

function asTuple(vector: THREE.Vector3): [number, number, number] {
  return [vector.x, vector.y, vector.z]
}

function eulerTuple(quaternion: THREE.Quaternion): [number, number, number] {
  const euler = new THREE.Euler().setFromQuaternion(quaternion)
  return [euler.x, euler.y, euler.z]
}

function makeInstanceId(objectId: string) {
  return `${objectId.replace(/[^a-z0-9_-]/gi, '-')}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function assetKey(asset: WorldObjectAsset) {
  return asset.assetId || `${asset.sourceWorldSlug}/${asset.id}`
}

function addAssetAliases(map: Map<string, WorldObjectAsset>, asset: WorldObjectAsset) {
  map.set(asset.id, asset)
  map.set(assetKey(asset), asset)
  map.set(asset.baseObjectId, asset)
  map.set(`${asset.sourceWorldSlug}/${asset.baseObjectId}`, asset)
}

function placementAssetKey(placement: WorldObjectPlacement) {
  return placement.assetId ?? placement.objectId
}

function EditableObject({
  asset,
  placement,
  selected,
  renderMode,
  onSelect,
  setRef,
}: EditableObjectProps) {
  const [hovered, setHovered] = useState(false)
  const gltf = useLoader(GLTFLoader, asset.url)
  const { scene, offset, size } = useMemo(() => {
    const clonedScene = cloneSkeleton(gltf.scene)
    const box = new THREE.Box3().setFromObject(clonedScene)
    const center = new THREE.Vector3()
    const size = new THREE.Vector3()
    box.getCenter(center)
    box.getSize(size)

    clonedScene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      child.castShadow = true
      child.receiveShadow = true
      child.raycast = ignoreRaycast
      if (renderMode === ObjectRenderMode.Wireframe) {
        child.material = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true })
      }
    })

    return {
      scene: clonedScene,
      offset: new THREE.Vector3(-center.x, -box.min.y, -center.z),
      size,
    }
  }, [gltf.scene, renderMode])

  return (
    <group
      ref={setRef}
      position={placement.position}
      rotation={placement.rotation}
      scale={placement.scale}
    >
      <group scale={OBJECT_SCALE}>
        <primitive object={scene} position={offset} dispose={null} />
      </group>
      <mesh
        position={[0, Math.max(size.y * OBJECT_SCALE, 0.01) / 2, 0]}
        renderOrder={10000}
        onPointerOver={(event) => {
          event.stopPropagation()
          setHovered(true)
        }}
        onPointerOut={(event) => {
          event.stopPropagation()
          setHovered(false)
        }}
        onClick={(event) => onSelect(event, placement.instanceId)}
      >
        <boxGeometry args={[
          Math.max(size.x * OBJECT_SCALE, 0.05),
          Math.max(size.y * OBJECT_SCALE, 0.05),
          Math.max(size.z * OBJECT_SCALE, 0.05),
        ]} />
        <meshBasicMaterial
          color={selected ? 0x7dd3fc : 0xffffff}
          wireframe
          transparent
          opacity={selected || hovered ? 1 : 0}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}

function formatTransformValue(value: number) {
  return Number.isFinite(value) ? Number(value.toFixed(3)).toString() : '0'
}

function transformInputValue(field: TransformField, value: number) {
  const displayValue = field === 'rotation' ? THREE.MathUtils.radToDeg(value) : value
  return formatTransformValue(displayValue)
}

function transformPlacementValue(field: TransformField, value: number) {
  return field === 'rotation' ? THREE.MathUtils.degToRad(value) : value
}

function snapTransformInputValue(field: TransformField, value: number) {
  if (field !== 'rotation') return value
  return Math.round(value / ROTATION_SNAP_DEGREES) * ROTATION_SNAP_DEGREES
}

function blurEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return false
  target.blur()
  return true
}

export function usePlacementEditor({ slug, objects, allObjectAssets, sceneProject, sceneProjectReady, editing, onProjectSaved }: EditorStateArgs): PlacementEditorController {
  const initialPlacements = useMemo(
    () => getInitialPlacements(objects, sceneProject?.instances),
    [objects, sceneProject],
  )
  const [assetFilter, setAssetFilter] = useState<'world' | 'all'>('world')
  const visibleAssetLibrary = assetFilter === 'world'
    ? allObjectAssets.filter((asset) => asset.sourceWorldSlug === slug)
    : allObjectAssets
  const assetsById = useMemo(() => {
    const map = new Map<string, WorldObjectAsset>()
    for (const asset of allObjectAssets) addAssetAliases(map, asset)
    for (const asset of objects) addAssetAliases(map, asset)
    return map
  }, [allObjectAssets, objects])
  const [instances, setInstances] = useState(() => clonePlacements(initialPlacements))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<TransformMode>('translate')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const clipboardRef = useRef<WorldObjectPlacement[]>([])
  const historyRef = useRef<{ past: WorldObjectPlacement[][]; future: WorldObjectPlacement[][] }>({ past: [], future: [] })
  const loadedSlugRef = useRef(slug)
  const selectedIdRef = useRef(selectedId)
  const instancesRef = useRef(instances)
  const dropSelectedToFloorHandlerRef = useRef<(() => void) | null>(null)
  const flushSelectedTransformHandlerRef = useRef<(() => WorldObjectPlacement[] | null) | null>(null)

  const selectedInstance = useMemo(
    () => instances.find((instance) => instance.instanceId === selectedId),
    [instances, selectedId],
  )
  const dirty = signature(instances) !== signature(initialPlacements)
  const canUndo = historyRef.current.past.length > 0
  const canRedo = historyRef.current.future.length > 0

  instancesRef.current = instances
  selectedIdRef.current = selectedId

  const pushHistory = useCallback((snapshot: WorldObjectPlacement[]) => {
    historyRef.current.past = [...historyRef.current.past, clonePlacements(snapshot)].slice(-HISTORY_LIMIT)
    historyRef.current.future = []
  }, [])

  const updateInstances = useCallback((updater: (current: WorldObjectPlacement[]) => WorldObjectPlacement[]) => {
    setInstances((current) => {
      const next = updater(clonePlacements(current))
      if (signature(next) === signature(current)) return current
      pushHistory(current)
      setSaveStatus('idle')
      return next
    })
  }, [pushHistory])

  useEffect(() => {
    const next = clonePlacements(initialPlacements)
    const nextSignature = signature(next)
    if (loadedSlugRef.current === slug && nextSignature === signature(instancesRef.current)) {
      return
    }
    loadedSlugRef.current = slug
    setInstances(next)
    setSelectedId(null)
    historyRef.current = { past: [], future: [] }
    setSaveStatus('idle')
  }, [initialPlacements, slug])

  const commitInstances = useCallback((next: WorldObjectPlacement[]) => {
    if (signature(next) === signature(instancesRef.current)) return
    pushHistory(instancesRef.current)
    setInstances(clonePlacements(next))
    setSaveStatus('idle')
  }, [pushHistory])

  const currentInstances = useCallback(() => (
    flushSelectedTransformHandlerRef.current?.() ?? instancesRef.current
  ), [])

  const selectInstance = useCallback((event: ThreeEvent<MouseEvent>, instanceId: string) => {
    event.stopPropagation()
    setSelectedId(instanceId)
  }, [])

  const selectFromOverlay = useCallback((instanceId: string) => {
    setSelectedId(instanceId)
  }, [])

  const copySelected = useCallback(() => {
    const selected = selectedIdRef.current
    const instance = currentInstances().find((item) => item.instanceId === selected)
    clipboardRef.current = instance ? [{ ...instance }] : []
  }, [currentInstances])

  const pasteInstances = useCallback(() => {
    const copied = clipboardRef.current
    if (!copied.length) return
    const pasted = copied.map((instance) => ({
      ...instance,
      instanceId: makeInstanceId(instance.assetId ?? instance.objectId),
      position: [
        instance.position[0] + PASTE_OFFSET[0],
        instance.position[1] + PASTE_OFFSET[1],
        instance.position[2] + PASTE_OFFSET[2],
      ] as [number, number, number],
    }))
    commitInstances([...currentInstances(), ...pasted])
    setSelectedId(pasted[pasted.length - 1]?.instanceId ?? null)
  }, [commitInstances, currentInstances])

  const duplicateSelected = useCallback(() => {
    copySelected()
    pasteInstances()
  }, [copySelected, pasteInstances])

  const duplicateInstance = useCallback((instanceId: string) => {
    const instances = currentInstances()
    const instance = instances.find((item) => item.instanceId === instanceId)
    if (!instance) return
    const duplicate = {
      ...instance,
      instanceId: makeInstanceId(instance.assetId ?? instance.objectId),
      position: [
        instance.position[0] + PASTE_OFFSET[0],
        instance.position[1] + PASTE_OFFSET[1],
        instance.position[2] + PASTE_OFFSET[2],
      ] as [number, number, number],
    }
    commitInstances([...instances, duplicate])
    setSelectedId(duplicate.instanceId)
  }, [commitInstances, currentInstances])

  const deleteSelected = useCallback(() => {
    const selected = selectedIdRef.current
    if (!selected) return
    updateInstances((current) => current.filter((instance) => instance.instanceId !== selected))
    setSelectedId(null)
  }, [updateInstances])

  const deleteInstance = useCallback((instanceId: string) => {
    updateInstances((current) => current.filter((instance) => instance.instanceId !== instanceId))
    setSelectedId((current) => (current === instanceId ? null : current))
  }, [updateInstances])

  const addAsset = useCallback((asset: WorldObjectAsset) => {
    const instance: WorldObjectPlacement = {
      instanceId: makeInstanceId(assetKey(asset)),
      objectId: asset.id,
      assetId: assetKey(asset),
      physics: 'rigidbody',
      position: [0, 0, 0.5],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    }
    updateInstances((current) => [...current, instance])
    setSelectedId(instance.instanceId)
  }, [updateInstances])

  const dropSelectedToFloor = useCallback(() => {
    if (!selectedIdRef.current) return
    dropSelectedToFloorHandlerRef.current?.()
  }, [])

  const setDropSelectedToFloorHandler = useCallback((handler: (() => void) | null) => {
    dropSelectedToFloorHandlerRef.current = handler
  }, [])

  const setFlushSelectedTransformHandler = useCallback((handler: (() => WorldObjectPlacement[] | null) | null) => {
    flushSelectedTransformHandlerRef.current = handler
  }, [])

  const updateSelectedTransform = useCallback((field: TransformField, axis: TransformAxis, value: number) => {
    if (!Number.isFinite(value)) return
    const selected = selectedIdRef.current
    if (!selected) return

    updateInstances((current) => current.map((instance) => {
      if (instance.instanceId !== selected) return instance
      const nextValue = [...instance[field]] as [number, number, number]
      nextValue[axis] = value
      return { ...instance, [field]: nextValue }
    }))
  }, [updateInstances])

  const updateSelectedPhysics = useCallback((physics: WorldObjectPhysics) => {
    const selected = selectedIdRef.current
    if (!selected) return

    updateInstances((current) => current.map((instance) => (
      instance.instanceId === selected ? { ...instance, physics } : instance
    )))
  }, [updateInstances])

  const undo = useCallback(() => {
    const snapshot = historyRef.current.past[historyRef.current.past.length - 1]
    if (!snapshot) return
    historyRef.current.past = historyRef.current.past.slice(0, -1)
    historyRef.current.future = [clonePlacements(instancesRef.current), ...historyRef.current.future]
    setInstances(clonePlacements(snapshot))
    setSaveStatus('idle')
  }, [])

  const redo = useCallback(() => {
    const snapshot = historyRef.current.future[0]
    if (!snapshot) return
    historyRef.current.future = historyRef.current.future.slice(1)
    historyRef.current.past = [...historyRef.current.past, clonePlacements(instancesRef.current)].slice(-HISTORY_LIMIT)
    setInstances(clonePlacements(snapshot))
    setSaveStatus('idle')
  }, [])

  const resetEdits = useCallback(() => {
    updateInstances(() => clonePlacements(initialPlacements))
    setSelectedId(null)
  }, [initialPlacements, updateInstances])

  const openWorldFolder = useCallback(() => {
    if (!import.meta.env.DEV) return
    fetch(`/__open-world-folder?slug=${encodeURIComponent(slug)}&target=scene`).catch((error) => {
      console.warn(`Could not open scene folder for "${slug}".`, error)
    })
  }, [slug])

  const saveProject = useCallback(async () => {
    if (!import.meta.env.DEV) return true
    try {
      const flushedInstances = flushSelectedTransformHandlerRef.current?.()
      const project: WorldSceneProject = { version: projectVersion, instances: clonePlacements(flushedInstances ?? instancesRef.current) }
      setSaveStatus('saving')
      const response = await fetch(`/__scene-project?slug=${encodeURIComponent(slug)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(project),
      })
      if (!response.ok) throw new Error(await response.text())
      const savedProject = await response.json() as WorldSceneProject
      setInstances(clonePlacements(savedProject.instances))
      onProjectSaved?.(savedProject)
      setSaveStatus('saved')
      return true
    } catch (error) {
      console.warn('Failed to save scene project.', error)
      setSaveStatus('error')
      return false
    }
  }, [onProjectSaved, slug])

  useEffect(() => {
    if (!editing || !sceneProjectReady || sceneProject || !objects.length || !import.meta.env.DEV) return
    const project: WorldSceneProject = { version: projectVersion, instances: clonePlacements(initialPlacements) }
    fetch(`/__scene-project?slug=${encodeURIComponent(slug)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    })
      .then(async (response) => {
        if (!response.ok) return
        const savedProject = await response.json() as WorldSceneProject
        onProjectSaved?.(savedProject)
      })
      .catch((error) => {
        console.warn('Failed to initialize scene project.', error)
      })
  }, [editing, initialPlacements, objects.length, onProjectSaved, sceneProject, sceneProjectReady, slug])

  useEffect(() => {
    if (!editing || !dirty) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty, editing])

  useEffect(() => {
    if (!editing) return
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          target.blur()
        }
        return
      }
      const mod = event.metaKey || event.ctrlKey

      if (mod && event.key.toLowerCase() === 'z' && event.shiftKey) {
        event.preventDefault()
        redo()
        return
      }
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        undo()
        return
      }
      if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        redo()
        return
      }
      if (mod && event.key.toLowerCase() === 'c') {
        event.preventDefault()
        copySelected()
        return
      }
      if (mod && event.key.toLowerCase() === 'v') {
        event.preventDefault()
        pasteInstances()
        return
      }
      if (event.shiftKey && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        duplicateSelected()
        return
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        deleteSelected()
        return
      }
      if (event.key === '1') setMode('translate')
      if (event.key === '2') setMode('rotate')
      if (event.key === '3') setMode('scale')
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [copySelected, deleteSelected, duplicateSelected, editing, pasteInstances, redo, undo])

  return {
    slug,
    objects,
    allObjectAssets,
    visibleAssetLibrary,
    assetFilter,
    setAssetFilter,
    assetsById,
    instances,
    selectedId,
    selectedInstance,
    mode,
    setMode,
    saveStatus,
    dirty,
    canUndo,
    canRedo,
    setSelectedId,
    selectInstance,
    selectFromOverlay,
    commitInstances,
    duplicateSelected,
    duplicateInstance,
    deleteSelected,
    deleteInstance,
    addAsset,
    dropSelectedToFloor,
    setDropSelectedToFloorHandler,
    updateSelectedTransform,
    updateSelectedPhysics,
    undo,
    redo,
    resetEdits,
    openWorldFolder,
    saveProject,
    setFlushSelectedTransformHandler,
  }
}

export function PlacementEditorScene({ controller, renderMode }: PlacementEditorSceneProps) {
  const { scene } = useThree()
  const transformRef = useRef<any>(null)
  const selectedObjectRef = useRef<THREE.Group>(null)
  const [selectedObject, setSelectedObject] = useState<THREE.Group>()
  const dragStartRef = useRef<WorldObjectPlacement | null>(null)
  const raycasterRef = useRef(new THREE.Raycaster())
  const selectedInstance = controller.selectedInstance
  const selectedAsset = selectedInstance
    ? controller.assetsById.get(placementAssetKey(selectedInstance)) ?? controller.assetsById.get(selectedInstance.objectId)
    : undefined

  const bakeSelectedTransform = useCallback(() => {
    const selected = controller.selectedInstance
    const object = selectedObjectRef.current
    if (!selected || !object) return null

    const next = controller.instances.map((instance) => {
      if (instance.instanceId !== selected.instanceId) return instance

      object.updateWorldMatrix(true, false)
      const position = new THREE.Vector3()
      const quaternion = new THREE.Quaternion()
      const scale = new THREE.Vector3()
      object.matrixWorld.decompose(position, quaternion, scale)

      return {
        ...instance,
        position: asTuple(position),
        rotation: eulerTuple(quaternion),
        scale: asTuple(scale),
      }
    })

    controller.commitInstances(next)
    dragStartRef.current = null
    return next
  }, [controller])

  useEffect(() => {
    const controls = transformRef.current as any
    if (!controls) return
    const captureDragStart = () => {
      dragStartRef.current = controller.selectedInstance ? clonePlacements([controller.selectedInstance])[0] : null
    }
    const bakeDragEnd = (event: { value?: boolean }) => {
      if (event.value === false) bakeSelectedTransform()
    }
    controls.addEventListener('mouseDown', captureDragStart)
    controls.addEventListener('dragging-changed', bakeDragEnd)
    return () => {
      controls.removeEventListener('mouseDown', captureDragStart)
      controls.removeEventListener('dragging-changed', bakeDragEnd)
    }
  }, [bakeSelectedTransform, controller.selectedInstance])

  useEffect(() => {
    controller.setFlushSelectedTransformHandler(bakeSelectedTransform)
    return () => controller.setFlushSelectedTransformHandler(null)
  }, [bakeSelectedTransform, controller])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (blurEditableTarget(event.target)) {
        event.preventDefault()
        event.stopPropagation()
        return
      }

      const dragStart = dragStartRef.current
      const object = selectedObjectRef.current
      if (dragStart && object) {
        event.preventDefault()
        object.position.set(...dragStart.position)
        object.rotation.set(...dragStart.rotation)
        object.scale.set(...dragStart.scale)
        object.updateMatrixWorld(true)
        dragStartRef.current = null
        return
      }

      if (controller.selectedId) {
        event.preventDefault()
        controller.setSelectedId(null)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [controller])

  const dropSelectedToFloor = useCallback(() => {
    const selected = controller.selectedInstance
    if (!selected) return
    const selectedGroup = selectedObjectRef.current
    const isSelectedObject = (object: THREE.Object3D) => {
      let current: THREE.Object3D | null = object
      while (current) {
        if (current === selectedGroup) return true
        current = current.parent
      }
      return false
    }
    const origin = new THREE.Vector3(...selected.position).add(new THREE.Vector3(0, 50, 0))
    const raycaster = raycasterRef.current
    raycaster.layers.set(DROP_TARGET_LAYER)
    raycaster.set(origin, new THREE.Vector3(0, -1, 0))
    const hit = raycaster
      .intersectObjects(scene.children, true)
      .find((intersection) => !isSelectedObject(intersection.object) && intersection.point.y <= origin.y)
    if (!hit) return

    const next = controller.instances.map((instance) => {
      if (instance.instanceId !== selected.instanceId) return instance
      return { ...instance, position: [instance.position[0], hit.point.y, instance.position[2]] as [number, number, number] }
    })
    controller.commitInstances(next)
  }, [controller, scene.children])

  useEffect(() => {
    controller.setDropSelectedToFloorHandler(dropSelectedToFloor)
    return () => controller.setDropSelectedToFloorHandler(null)
  }, [controller, dropSelectedToFloor])

  return (
    <>
      <group>
        {controller.instances.filter((instance) => instance.instanceId !== controller.selectedId).map((instance) => {
          const asset = controller.assetsById.get(placementAssetKey(instance)) ?? controller.assetsById.get(instance.objectId)
          if (!asset) return null
          return (
            <EditableObject
              key={instance.instanceId}
              asset={asset}
              placement={instance}
              selected={false}
              renderMode={renderMode}
              onSelect={controller.selectInstance}
            />
          )
        })}
        {selectedInstance && selectedAsset && (
          <>
            <EditableObject
              key={selectedInstance.instanceId}
              asset={selectedAsset}
              placement={selectedInstance}
              selected
              renderMode={renderMode}
              onSelect={controller.selectInstance}
              setRef={(group) => {
                if (selectedObjectRef.current === group) return
                selectedObjectRef.current = group
                setSelectedObject(group ?? undefined)
              }}
            />
            {selectedObject && (
              <TransformControls
                ref={transformRef}
                object={selectedObject}
                mode={controller.mode}
                space="local"
                rotationSnap={THREE.MathUtils.degToRad(ROTATION_SNAP_DEGREES)}
              />
            )}
          </>
        )}
      </group>
    </>
  )
}

export function PlacementEditorOverlay({ controller }: PlacementEditorOverlayProps) {
  const [, navigate] = useLocation()
  const selectedInstance = controller.selectedInstance
  const selectedAsset = selectedInstance
    ? controller.assetsById.get(placementAssetKey(selectedInstance)) ?? controller.assetsById.get(selectedInstance.objectId)
    : undefined

  return (
    <div className="pointer-events-none fixed inset-0 z-20 text-sm text-white">
      <div className={`${chrome.bar} chrome-enter-center pointer-events-auto fixed left-1/2 top-4 flex gap-1`}>
        <AppButton
          className={`justify-center ${controller.mode === 'translate' ? 'bg-white/15 opacity-100' : ''}`}
          onClick={() => controller.setMode('translate')}
          aria-label="Position tool"
        >
          <ArrowsOutCardinal size={15} weight="regular" />
          Position
        </AppButton>
        <AppButton
          className={`justify-center ${controller.mode === 'rotate' ? 'bg-white/15 opacity-100' : ''}`}
          onClick={() => controller.setMode('rotate')}
          aria-label="Rotation tool"
        >
          <ArrowClockwise size={15} weight="regular" />
          Rotation
        </AppButton>
        <AppButton
          className={`justify-center ${controller.mode === 'scale' ? 'bg-white/15 opacity-100' : ''}`}
          onClick={() => controller.setMode('scale')}
          aria-label="Scale tool"
        >
          <CornersOut size={15} weight="regular" />
          Scale
        </AppButton>
        <AppButton
          className="justify-center"
          disabled={!controller.selectedId}
          onClick={controller.dropSelectedToFloor}
          aria-label="Drop selected object to floor"
          title="Drop to floor"
        >
          <ArrowDown size={15} weight="regular" />
          Drop
        </AppButton>
      </div>

      {selectedInstance && (
        <ChromePanel className="pointer-events-auto fixed font-mono right-4 top-4 w-72 p-2 whitespace-nowrap">
          <div className="mb-2 min-w-0">
            <div className="truncate text-xs font-medium text-white/90">{selectedAsset?.name ?? selectedInstance.objectId}</div>
            <div className="truncate text-[10px] text-white/35">{selectedInstance.instanceId}</div>
          </div>
          <div className="flex flex-col gap-1">
            {TRANSFORM_FIELDS.map(({ field, label, step }) => (
              <div key={field} className="grid grid-cols-[2.75rem_repeat(3,minmax(0,1fr))] items-center gap-1">
                <div className="text-[10px] tracking-[0.16em] text-white/40">{label}</div>
                {TRANSFORM_AXES.map(({ axis, label: axisLabel }) => (
                  <label key={`${field}-${axis}`} className="min-w-0">
                    <span className="sr-only">{`${label} ${axisLabel}`}</span>
                    <input
                      type="number"
                      step={step}
                      value={transformInputValue(field, selectedInstance[field][axis])}
                      onChange={(event) => controller.updateSelectedTransform(
                        field,
                        axis,
                        transformPlacementValue(field, Number.parseFloat(event.currentTarget.value)),
                      )}
                      onBlur={(event) => {
                        const value = Number.parseFloat(event.currentTarget.value)
                        if (!Number.isFinite(value)) return
                        controller.updateSelectedTransform(field, axis, transformPlacementValue(field, snapTransformInputValue(field, value)))
                      }}
                      className="h-7 w-full rounded border border-white/10 bg-black/40 px-1.5 text-right text-xs text-white/85"
                    />
                  </label>
                ))}
              </div>
            ))}
            <label className="grid grid-cols-[2.75rem_1fr] items-center gap-1">
              <span className="text-[10px] tracking-[0.16em] text-white/40">Body</span>
              <select
                value={selectedInstance.physics ?? 'rigidbody'}
                onChange={(event) => controller.updateSelectedPhysics(event.currentTarget.value as WorldObjectPhysics)}
                className="h-7 rounded border border-white/10 bg-black/40 px-1.5 text-xs text-white/85"
              >
                <option value="rigidbody">Rigidbody</option>
                <option value="static">Static</option>
              </select>
            </label>
          </div>
        </ChromePanel>
      )}

      <div className={`${chrome.enter} fixed inset-y-4 left-4 flex w-[min(24rem,calc(100vw-2rem))] max-w-sm flex-col gap-2`}>
        <div className="flex min-h-0 flex-col gap-2">
          <ChromePanel className="pointer-events-auto p-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1">
              <a
                className="inline-flex h-8 w-8 items-center justify-center rounded px-2 py-1 text-xs opacity-80 transition-[background-color,opacity] hover:bg-white/10 hover:opacity-100"
                href={`/${controller.slug}`}
                aria-label="Return to world"
                onClick={async (event) => {
                  event.preventDefault()
                  if (!await controller.saveProject()) return
                  navigate(`/${controller.slug}`)
                }}
              >
                <ArrowLeft size={16} weight="regular" />
              </a>
              <AppButton
                className={`h-8 w-8 justify-center ${controller.dirty ? 'text-yellow-300 opacity-100' : ''}`}
                disabled={!import.meta.env.DEV || controller.saveStatus === 'saving'}
                onClick={controller.saveProject}
                aria-label={controller.dirty ? 'Save unsaved scene changes' : 'Save project'}
                title={controller.dirty ? 'Unsaved changes' : 'Saved'}
              >
                <FloppyDisk size={16} weight="regular" />
              </AppButton>
              <AppButton
                className="h-8 w-8 justify-center"
                disabled={!import.meta.env.DEV}
                onClick={controller.openWorldFolder}
                aria-label="Open world folder"
              >
                <FolderOpen size={16} weight="regular" />
              </AppButton>
              </div>
              <div className="flex items-center gap-1">
                <AppButton
                  className="h-8 w-8 justify-center"
                  disabled={!controller.canUndo}
                  onClick={controller.undo}
                  aria-label="Undo"
                >
                  <ArrowUUpLeft size={16} weight="regular" />
                </AppButton>
                <AppButton
                  className="h-8 w-8 justify-center"
                  disabled={!controller.canRedo}
                  onClick={controller.redo}
                  aria-label="Redo"
                >
                  <ArrowUUpRight size={16} weight="regular" />
                </AppButton>
              </div>
            </div>
            <div className="mt-1 text-xs leading-5 text-white/65">
              {controller.saveStatus === 'error' && <div className="text-red-300">Save failed.</div>}
              {controller.saveStatus === 'saved' && <div className="text-green-300">Saved project.json.</div>}
              {!import.meta.env.DEV && <div>Saving and folder opening are available in dev only.</div>}
            </div>
          </ChromePanel>

          <ChromePanel className="pointer-events-auto min-h-0 overflow-hidden">
            <div className={chrome.sectionHeader}>
              <span>Scene Graph</span>
              <span className="normal-case tracking-normal">{controller.selectedId ? '1 selected' : 'None selected'}</span>
            </div>
            <div className="max-h-[40vh] overflow-y-auto overflow-x-hidden">
              <div className="p-1 pr-3">
              {controller.instances.map((instance) => {
                const asset = controller.assetsById.get(placementAssetKey(instance)) ?? controller.assetsById.get(instance.objectId)
                const selected = controller.selectedId === instance.instanceId
                return (
                  <div
                    key={instance.instanceId}
                    className={`${chrome.row} ${selected ? chrome.rowActive : chrome.rowIdle}`}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex flex-1 items-center gap-2 rounded px-2 py-1 text-left"
                      onClick={() => controller.selectFromOverlay(instance.instanceId)}
                    >
                      <ChromeThumbnail thumbnailUrl={asset?.thumbnailUrl} alt={asset?.name ?? instance.objectId} />
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-xs text-white/90">{asset?.name ?? instance.objectId}</span>
                          {asset?.variantLabel && (
                            <span className="flex-shrink-0 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] leading-none text-white/50">
                              {asset.variantLabel}
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-[10px] text-white/35">{instance.instanceId}</span>
                      </span>
                    </button>
                    <div className="flex flex-shrink-0 items-center gap-0.5 px-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <AppButton
                        className="h-7 w-7 justify-center"
                        onClick={(event) => {
                          event.stopPropagation()
                          controller.duplicateInstance(instance.instanceId)
                        }}
                        aria-label={`Duplicate ${asset?.name ?? instance.objectId}`}
                      >
                        <Copy size={14} weight="regular" />
                      </AppButton>
                      <AppButton
                        className="h-7 w-7 justify-center text-red-200"
                        onClick={(event) => {
                          event.stopPropagation()
                          controller.deleteInstance(instance.instanceId)
                        }}
                        aria-label={`Delete ${asset?.name ?? instance.objectId}`}
                      >
                        <Trash size={14} weight="regular" />
                      </AppButton>
                    </div>
                  </div>
                )
              })}
              {!controller.instances.length && (
                <div className="px-2 py-4 text-xs text-white/45">No object instances in this scene.</div>
              )}
              </div>
            </div>
          </ChromePanel>

          <ChromePanel className="pointer-events-auto min-h-0 overflow-hidden">
            <div className={chrome.sectionHeader}>
              <span>Assets</span>
              <div className="flex items-center gap-1 normal-case tracking-normal">
                <AppButton
                  active={controller.assetFilter === 'world'}
                  className={`h-7 justify-center ${controller.assetFilter === 'world' ? 'bg-white/15 opacity-100' : ''}`}
                  onClick={() => controller.setAssetFilter('world')}
                  aria-label="Show this world's objects"
                  title="World objects"
                >
                  <Cube size={14} weight="regular" />
                  World
                </AppButton>
                <AppButton
                  active={controller.assetFilter === 'all'}
                  className={`h-7 justify-center ${controller.assetFilter === 'all' ? 'bg-white/15 opacity-100' : ''}`}
                  onClick={() => controller.setAssetFilter('all')}
                  aria-label="Show all objects"
                  title="All objects"
                >
                  <GlobeSimple size={14} weight="regular" />
                  All
                </AppButton>
              </div>
            </div>
            <div className="max-h-[28vh] overflow-y-auto overflow-x-hidden">
              <div className="p-1 pr-3">
              {controller.visibleAssetLibrary.map((asset) => (
                <div
                  key={assetKey(asset)}
                  className="group mb-1 flex items-center gap-1 rounded opacity-80 transition-[background-color,opacity] hover:bg-white/10 hover:opacity-100"
                >
                  <button
                    type="button"
                    className="min-w-0 flex flex-1 items-center gap-2 rounded px-2 py-1 text-left"
                    onClick={() => controller.addAsset(asset)}
                  >
                    <ChromeThumbnail thumbnailUrl={asset.thumbnailUrl} alt={asset.name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs text-white/90">{asset.name}</span>
                      <span className="block truncate text-[10px] text-white/35">
                        {[asset.sourceWorldSlug, asset.variantLabel].filter(Boolean).join(' / ')}
                      </span>
                    </span>
                  </button>
                  <AppButton
                    className="mr-1 h-7 w-7 justify-center opacity-0 group-hover:opacity-100"
                    onClick={() => controller.addAsset(asset)}
                    aria-label={`Add ${asset.name} to scene`}
                    title={`Add ${asset.name}`}
                  >
                    <Plus size={14} weight="regular" />
                  </AppButton>
                </div>
              ))}
              {!controller.visibleAssetLibrary.length && (
                <div className="px-2 py-4 text-xs text-white/45">No object assets found.</div>
              )}
              </div>
            </div>
          </ChromePanel>
        </div>
      </div>
    </div>
  )
}
