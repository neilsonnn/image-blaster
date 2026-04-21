import { Suspense, useRef, useEffect, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Physics, RigidBody, CuboidCollider } from '@react-three/rapier'
import { SplatRenderer, type SplatRendererHandle } from '../modules/splat/SplatRenderer'
import { EnvironmentMap } from '../modules/environment/EnvironmentMap'
import { WorldCollider } from '../modules/collider/WorldCollider'
import { CharacterController, type CharacterControllerHandle } from '../modules/character/CharacterController'
import { SceneLoader } from '../modules/scene/SceneLoader'
import { AudioManager } from '../modules/audio/AudioManager'
import { getSplatUrl } from '../utils/worldLoader'
import { useDebugStore } from '../store/debug'
import type { World } from '../types/world'

const FADE_SPEED = 2.0

function SanityFloor() {
  const showColliders = useDebugStore((s) => s.showColliders)
  return (
    <RigidBody type="fixed" position={[0, -0.5, 0]}>
      <CuboidCollider args={[50, 0.5, 50]} />
      {showColliders && (
        <mesh>
          <boxGeometry args={[100, 1, 100]} />
          <meshBasicMaterial color={0x0000ff} wireframe />
        </mesh>
      )}
    </RigidBody>
  )
}

interface TransitionDriverProps {
  splatRef: React.RefObject<SplatRendererHandle | null>
  charRef: React.RefObject<CharacterControllerHandle | null>
  phaseRef: React.RefObject<'idle' | 'out' | 'in'>
  revealRef: React.RefObject<number>
  pendingWorld: React.RefObject<World | null>
  pendingSlug: React.RefObject<string | null>
  onSwap: (world: World, slug: string) => void
}

function TransitionDriver({
  splatRef,
  charRef,
  phaseRef,
  revealRef,
  pendingWorld,
  pendingSlug,
  onSwap,
}: TransitionDriverProps) {
  useFrame((_, delta) => {
    const splat = splatRef.current
    if (!splat) return

    if (phaseRef.current === 'out') {
      revealRef.current = Math.max(0, revealRef.current - delta * FADE_SPEED)
      splat.setReveal(revealRef.current)
      if (revealRef.current <= 0 && pendingWorld.current && pendingSlug.current) {
        const w = pendingWorld.current
        const s = pendingSlug.current
        pendingWorld.current = null
        pendingSlug.current = null
        charRef.current?.teleport()
        onSwap(w, s)
        phaseRef.current = 'in'
      }
    } else if (phaseRef.current === 'in') {
      revealRef.current = Math.min(1, revealRef.current + delta * FADE_SPEED)
      splat.setReveal(revealRef.current)
      if (revealRef.current >= 1) phaseRef.current = 'idle'
    }
  })

  return null
}

interface Props {
  world: World
  slug: string
}

export function WorldViewer({ world: desiredWorld, slug: desiredSlug }: Props) {
  const [activeWorld, setActiveWorld] = useState(desiredWorld)
  const [activeSlug, setActiveSlug] = useState(desiredSlug)

  const splatRef = useRef<SplatRendererHandle>(null)
  const charRef = useRef<CharacterControllerHandle>(null)
  const phaseRef = useRef<'idle' | 'out' | 'in'>('in')
  const revealRef = useRef(0)
  const pendingWorldRef = useRef<World | null>(null)
  const pendingSlugRef = useRef<string | null>(null)

  useEffect(() => {
    if (desiredSlug !== activeSlug) {
      pendingWorldRef.current = desiredWorld
      pendingSlugRef.current = desiredSlug
      phaseRef.current = 'out'
    }
  }, [desiredSlug, desiredWorld, activeSlug])

  const splatUrl = getSplatUrl(activeWorld)
  const { ground_plane_offset } = activeWorld.assets.splats.semantics_metadata

  return (
    <>
      <AudioManager slug={activeSlug} active />
      <Canvas
        camera={{ fov: 75, near: 0.1, far: 1000 }}
        className="w-full h-full"
        gl={{ antialias: false }}
      >
        <Suspense fallback={null}>
          <TransitionDriver
            splatRef={splatRef}
            charRef={charRef}
            phaseRef={phaseRef}
            revealRef={revealRef}
            pendingWorld={pendingWorldRef}
            pendingSlug={pendingSlugRef}
            onSwap={(w, s) => {
              setActiveWorld(w)
              setActiveSlug(s)
            }}
          />
          <Physics gravity={[0, -9.81, 0]}>
            <CharacterController ref={charRef} />
            <WorldCollider url={activeWorld.assets.mesh.collider_mesh_url} />
            <SanityFloor />
          </Physics>
          <SplatRenderer ref={splatRef} url={splatUrl} groundPlaneOffset={ground_plane_offset} />
          <EnvironmentMap panoUrl={activeWorld.assets.imagery.pano_url} />
          <SceneLoader slug={activeSlug} />
        </Suspense>
      </Canvas>
    </>
  )
}
