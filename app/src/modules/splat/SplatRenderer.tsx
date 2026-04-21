import { useMemo, useRef, useEffect } from 'react'
import { extend, useThree } from '@react-three/fiber'
import { SplatMesh, SparkRenderer } from '@sparkjsdev/spark'

const SparkRendererEl = extend(SparkRenderer)
const SplatMeshEl = extend(SplatMesh)

interface Props {
  url: string
  opacity: number
  groundPlaneOffset?: number
}

export function SplatRenderer({ url, opacity, groundPlaneOffset = 0 }: Props) {
  const renderer = useThree((state) => state.gl)
  const splatRef = useRef<SplatMesh>(null)

  const sparkArgs = useMemo(() => ({ renderer }), [renderer])
  const splatArgs = useMemo(() => ({ url }), [url])

  useEffect(() => {
    if (splatRef.current) {
      splatRef.current.opacity = opacity
    }
  }, [opacity])

  return (
    <SparkRendererEl args={[sparkArgs]}>
      <group position={[0, -groundPlaneOffset, 0]} rotation={[Math.PI, 0, 0]}>
        <SplatMeshEl ref={splatRef} args={[splatArgs]} />
      </group>
    </SparkRendererEl>
  )
}
