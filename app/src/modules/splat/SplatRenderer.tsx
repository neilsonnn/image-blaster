import { useMemo, useRef, forwardRef, useImperativeHandle } from 'react'
import { extend, useThree } from '@react-three/fiber'
import { SplatMesh, SparkRenderer, dyno } from '@sparkjsdev/spark'

const SparkRendererEl = extend(SparkRenderer)
const SplatMeshEl = extend(SplatMesh)

export interface SplatRendererHandle {
  setReveal: (amount: number) => void
}

interface Props {
  url: string
  groundPlaneOffset?: number
}

// Create modifier + revealFloat once per component instance
function makeRevealModifier() {
  const revealFloat = dyno.dynoFloat(1)
  const modifierDyno = dyno.dyno({
    inTypes: { gsplat: dyno.Gsplat, reveal: 'float' as const },
    outTypes: { gsplat: dyno.Gsplat },
    inputs: { reveal: revealFloat },
    statements: ({ inputs, outputs }) => [
      `${outputs.gsplat} = ${inputs.gsplat};`,
      `${outputs.gsplat}.scales = mix(vec3(0.002), ${inputs.gsplat}.scales, smoothstep(0.0, 1.0, ${inputs.reveal}));`,
    ],
  })
  const modifier = dyno.dynoBlock(
    { gsplat: dyno.Gsplat },
    { gsplat: dyno.Gsplat },
    ({ gsplat }) => ({ gsplat: modifierDyno.apply({ gsplat }).gsplat }),
  )
  return { revealFloat, modifier }
}

export const SplatRenderer = forwardRef<SplatRendererHandle, Props>(
  ({ url, groundPlaneOffset = 0 }, ref) => {
    const renderer = useThree((state) => state.gl)
    const splatRef = useRef<SplatMesh>(null)

    const { revealFloat, modifier } = useRef(makeRevealModifier()).current

    useImperativeHandle(ref, () => ({
      setReveal: (amount: number) => {
        revealFloat.value = amount
        splatRef.current?.updateVersion()
      },
    }))

    const sparkArgs = useMemo(() => ({ renderer }), [renderer])
    const splatArgs = useMemo(
      () => ({ url, objectModifier: modifier }),
      // modifier is stable — only url triggers a new SplatMesh
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [url],
    )

    return (
      <SparkRendererEl args={[sparkArgs]}>
        <group position={[0, -groundPlaneOffset, 0]} rotation={[Math.PI, 0, 0]}>
          <SplatMeshEl ref={splatRef} args={[splatArgs]} />
        </group>
      </SparkRendererEl>
    )
  },
)
