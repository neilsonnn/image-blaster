import { useLocation } from 'wouter'
import type { WorldEntry } from '../types/world'

interface Props {
  worlds: WorldEntry[]
  activeSlug: string
}

export function WorldSidebar({ worlds, activeSlug }: Props) {
  const [, navigate] = useLocation()

  return (
    <aside className="
      fixed right-0 top-0 h-full z-10
      w-20 md:w-56
      flex flex-col gap-2 p-2 md:p-3
      bg-black/60 backdrop-blur-md overflow-y-auto
    ">
      {worlds.map(({ slug, world }) => {
        const isActive = slug === activeSlug
        const name = world.display_name || slug
        return (
          <button
            key={slug}
            onClick={() => navigate(`/${slug}`)}
            className={`
              flex flex-col items-center md:flex-row md:items-center gap-1 md:gap-3
              rounded-lg overflow-hidden p-1 md:p-2 text-left
              transition-all duration-200
              ${isActive ? 'ring-2 ring-white/80 bg-white/10' : 'hover:bg-white/10'}
            `}
          >
            <img
              src={world.assets.thumbnail_url}
              alt={name}
              className="w-14 h-14 md:w-10 md:h-10 rounded object-cover flex-shrink-0"
            />
            <span className="hidden md:block text-white text-xs font-medium truncate">
              {name}
            </span>
          </button>
        )
      })}
    </aside>
  )
}
