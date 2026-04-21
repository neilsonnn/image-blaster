import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { Physics, RigidBody, CuboidCollider } from '@react-three/rapier'
import { SplatRenderer } from '../modules/splat/SplatRenderer'
import { EnvironmentMap } from '../modules/environment/EnvironmentMap'
import { WorldCollider } from '../modules/collider/WorldCollider'
import { CharacterController } from '../modules/character/CharacterController'
// import { PostProcessing } from '../modules/postprocessing/PostProcessing'
import { SceneLoader } from '../modules/scene/SceneLoader'
import { AudioManager } from '../modules/audio/AudioManager'
import { getSplatUrl } from '../utils/worldLoader'
import { useDebugStore } from '../store/debug'
import type { World } from '../types/world'

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

interface Props {
  world: World
  slug: string
}

export function WorldViewer({ world, slug }: Props) {
  const splatUrl = getSplatUrl(world)
  const { ground_plane_offset } = world.assets.splats.semantics_metadata

  return (
    <>
      <AudioManager slug={slug} active />
      <Canvas
        camera={{ fov: 75, near: 0.1, far: 1000 }}
        className="w-full h-full"
        gl={{ antialias: false }}
      >
        <Suspense fallback={null}>
          <Physics gravity={[0, -9.81, 0]}>
            <CharacterController />
            <WorldCollider url={world.assets.mesh.collider_mesh_url} />
            <SanityFloor />
          </Physics>
          <SplatRenderer url={splatUrl} opacity={1} groundPlaneOffset={ground_plane_offset} />
          <EnvironmentMap panoUrl={world.assets.imagery.pano_url} />
          <SceneLoader slug={slug} />
          {/* <PostProcessing /> */}
        </Suspense>
      </Canvas>
    </>
  )
}
