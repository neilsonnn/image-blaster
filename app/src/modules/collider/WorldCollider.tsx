import { useEffect } from 'react'
import { RigidBody } from '@react-three/rapier'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { useDebugStore } from '../../store/debug'
import { ObjectRenderMode } from '../../types/world'

interface Props {
  url: string
  flipY?: boolean
}

export function WorldCollider({ url, flipY }: Props) {
  const { scene } = useGLTF(url)
  const objectRenderMode = useDebugStore((s) => s.objectRenderMode)
  const showColliderMesh = objectRenderMode !== ObjectRenderMode.Lit

  useEffect(() => {
    scene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      child.visible = showColliderMesh
      // Replace lit PBR materials with an unlit basic material so the wireframe
      // color stays constant regardless of lighting / env map.
      const old = Array.isArray(child.material) ? child.material : [child.material]
      old.forEach((m) => m?.dispose?.())
      child.material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        wireframe: true,
        toneMapped: false,
        fog: false,
      })
    })
  }, [scene, showColliderMesh])

  return (
    <RigidBody type="fixed" colliders="trimesh" rotation={[flipY ? Math.PI : 0, 0, 0]}>
      <primitive object={scene} />
    </RigidBody>
  )
}
