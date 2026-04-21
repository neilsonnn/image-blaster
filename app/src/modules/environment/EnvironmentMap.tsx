import { useEffect } from 'react'
import { useThree, useLoader } from '@react-three/fiber'
import * as THREE from 'three'

interface Props {
  panoUrl: string
}

export function EnvironmentMap({ panoUrl }: Props) {
  const texture = useLoader(THREE.TextureLoader, panoUrl)
  const { scene } = useThree()

  useEffect(() => {
    texture.mapping = THREE.EquirectangularReflectionMapping
    texture.colorSpace = THREE.SRGBColorSpace
    scene.environment = texture
    return () => {
      if (scene.environment === texture) scene.environment = null
    }
  }, [texture, scene])

  return null
}
