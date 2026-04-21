import { useEffect, useState } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'

interface Props {
  slug: string
}

export function SceneLoader({ slug }: Props) {
  const { scene } = useThree()
  const [objects, setObjects] = useState<THREE.Object3D | null>(null)

  useEffect(() => {
    let cancelled = false
    const loader = new THREE.ObjectLoader()

    fetch(`/worlds/${slug}/scene/project.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then(async (json) => {
        if (!json || cancelled) return
        const loaded = await loader.parseAsync(json.scene)
        if (!cancelled) setObjects(loaded)
      })
      .catch(() => {/* no scene file — skip silently */})

    return () => {
      cancelled = true
      setObjects(null)
    }
  }, [slug, scene])

  if (!objects) return null
  return <primitive object={objects} />
}
