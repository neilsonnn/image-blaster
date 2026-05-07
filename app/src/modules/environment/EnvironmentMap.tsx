import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react'
import { useThree, useLoader } from '@react-three/fiber'
import * as THREE from 'three'

export interface EnvironmentMapHandle {
  setIntensity: (amount: number) => void
}

interface Props {
  panoUrl: string
  intensity: number
}

const BACKGROUND_BLURRINESS = 0.4

export const EnvironmentMap = forwardRef<EnvironmentMapHandle, Props>(
  function EnvironmentMap({ panoUrl, intensity }, ref) {
    const texture = useLoader(THREE.TextureLoader, panoUrl)
    const { scene } = useThree()
    const transitionAmountRef = useRef(1)

    const applyIntensity = useCallback(() => {
      const v = transitionAmountRef.current * intensity
      scene.environmentIntensity = v
      scene.backgroundIntensity = v
    }, [intensity, scene])

    useEffect(() => {
      texture.mapping = THREE.EquirectangularReflectionMapping
      texture.colorSpace = THREE.SRGBColorSpace
      scene.environment = texture
      scene.background = texture
      scene.backgroundBlurriness = BACKGROUND_BLURRINESS
      scene.environmentRotation = new THREE.Euler(0, Math.PI / 2, 0)
      scene.backgroundRotation = new THREE.Euler(0, Math.PI / 2, 0)
      applyIntensity()
      return () => {
        if (scene.environment === texture) scene.environment = null
        if (scene.background === texture) scene.background = null
      }
    }, [texture, scene, applyIntensity])

    useEffect(() => {
      applyIntensity()
    }, [applyIntensity])

    useImperativeHandle(ref, () => ({
      setIntensity: (amount: number) => {
        transitionAmountRef.current = amount
        applyIntensity()
      },
    }), [applyIntensity])

    return null
  },
)
