import { useEffect } from 'react'
import { RigidBody } from '@react-three/rapier'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { useDebugStore } from '../../store/debug'

interface Props {
  url: string
}

export function WorldCollider({ url }: Props) {
  const { scene } = useGLTF(url)
  const showColliders = useDebugStore((s) => s.showColliders)

  useEffect(() => {
    scene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      child.visible = showColliders
      const mats = Array.isArray(child.material) ? child.material : [child.material]
      mats.forEach((m: THREE.Material) => {
        (m as THREE.MeshBasicMaterial).wireframe = true
        ;(m as THREE.MeshBasicMaterial).color?.set(0x00ff00)
      })
    })
  }, [scene, showColliders])

  return (
    <RigidBody type="fixed" colliders="trimesh" rotation={[Math.PI, 0, 0]}>
      <primitive object={scene} />
    </RigidBody>
  )
}
