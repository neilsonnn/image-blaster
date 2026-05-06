import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'
import { spawn } from 'child_process'

type WorldManifest = Record<string, unknown> & {
  assets?: Record<string, unknown> & {
    imagery?: Record<string, unknown>
    mesh?: Record<string, unknown>
    splats?: Record<string, unknown> & {
      spz_urls?: Record<string, string | undefined>
    }
  }
}

function worldsPlugin(): Plugin {
  const VIRTUAL_ID = 'virtual:worlds'
  const RESOLVED_ID = '\0' + VIRTUAL_ID
  const worldsDir = path.resolve(__dirname, '../worlds')
  const RESERVED_OUTPUT_DIRS = new Set(['world', 'sfx'])
  const MODEL_EXTENSIONS = new Set(['.glb'])
  const AUDIO_EXTENSIONS = new Set(['.mp3', '.ogg', '.wav', '.m4a', '.opus'])
  const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif'])
  const PROJECT_VERSION = 1
  const WORLD_SPZ_KEYS = new Set(['100k', '150k', '500k', 'full_res'])
  let activeWorldSlug: string | null = null
  let hotReloadEnabled = true

  function visibleFiles(dir: string) {
    if (!fs.existsSync(dir)) return []
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((file) => file.isFile() && !file.name.startsWith('.'))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  function readSourceImageVersions(slug: string) {
    const sourceDir = path.join(worldsDir, slug, 'source')
    const images = visibleFiles(sourceDir).filter(
      (f) => IMAGE_EXTENSIONS.has(path.extname(f.name).toLowerCase()),
    )
    return images
      .map((file) => ({ file, indexed: parseIndexedName(file.name) }))
      .sort((a, b) => {
        const aIndex = a.indexed?.index ?? Number.MAX_SAFE_INTEGER
        const bIndex = b.indexed?.index ?? Number.MAX_SAFE_INTEGER
        return aIndex - bIndex || a.file.name.localeCompare(b.file.name)
      })
      .map(({ file, indexed }) => ({
        url: `/worlds/${slug}/source/${file.name}`,
        label: indexed ? `v${indexed.index}` : path.basename(file.name, path.extname(file.name)),
        fileName: file.name,
        ...(indexed ? { index: indexed.index } : {}),
      }))
  }

  function readSourceImageUrl(slug: string): string | undefined {
    const versions = readSourceImageVersions(slug)
    return versions.find((version) => version.index === 0)?.url ?? versions[0]?.url
  }

  function readObjectAssets(slug: string) {
    const outputDir = path.join(worldsDir, slug, 'output')
    if (!fs.existsSync(outputDir)) return []

    return fs.readdirSync(outputDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !RESERVED_OUTPUT_DIRS.has(entry.name))
      .flatMap((entry) => {
        const objectDir = path.join(outputDir, entry.name)
        const files = visibleFiles(objectDir)
        const models = files
          .map((file) => ({ file, indexed: parseIndexedName(file.name) }))
          .filter(({ file }) => MODEL_EXTENSIONS.has(path.extname(file.name).toLowerCase()))
          .sort((a, b) => {
            const aIndex = a.indexed?.index ?? Number.MAX_SAFE_INTEGER
            const bIndex = b.indexed?.index ?? Number.MAX_SAFE_INTEGER
            return aIndex - bIndex || a.file.name.localeCompare(b.file.name)
          })

        if (!models.length) return []

        const objectJsonPath = path.join(objectDir, 'object.json')
        let displayName = entry.name
        if (fs.existsSync(objectJsonPath) && fs.statSync(objectJsonPath).isFile()) {
          try {
            const json = JSON.parse(fs.readFileSync(objectJsonPath, 'utf-8'))
            displayName = json.object?.name ?? json.name ?? displayName
          } catch {
            displayName = entry.name
          }
        }

        const thumbnailFor = (index?: number) => {
          const sameIndexImages = files.filter((file) => {
            if (!IMAGE_EXTENSIONS.has(path.extname(file.name).toLowerCase())) return false
            const parsed = parseIndexedName(file.name)
            return index === undefined || parsed?.index === index
          })
          return sameIndexImages.find((file) => file.name.includes('thumbnail')) ?? sameIndexImages[0]
        }

        return models.map(({ file, indexed }) => {
          const index = indexed?.index
          const variantLabel = index === undefined ? path.basename(file.name, path.extname(file.name)) : `v${index}`
          const thumbnail = thumbnailFor(index)
          return {
            id: index === undefined ? entry.name : `${entry.name}-${index}`,
            assetId: index === undefined ? `${slug}/${entry.name}` : `${slug}/${entry.name}/${index}`,
            sourceWorldSlug: slug,
            baseObjectId: entry.name,
            ...(index === undefined ? {} : { index }),
            variantLabel,
            fileName: file.name,
            name: displayName,
            url: `/worlds/${slug}/output/${entry.name}/${file.name}`,
            thumbnailUrl: thumbnail ? `/worlds/${slug}/output/${entry.name}/${thumbnail.name}` : undefined,
            sfxUrls: visibleFiles(path.join(objectDir, 'sfx'))
              .filter((file) => AUDIO_EXTENSIONS.has(path.extname(file.name).toLowerCase()))
              .map((file) => `/worlds/${slug}/output/${entry.name}/sfx/${file.name}`),
          }
        })
      })
  }

  function readWorldSfxUrls(slug: string) {
    return visibleFiles(path.join(worldsDir, slug, 'output', 'sfx'))
      .filter((file) => AUDIO_EXTENSIONS.has(path.extname(file.name).toLowerCase()))
      .map((file) => `/worlds/${slug}/output/sfx/${file.name}`)
  }

  function worldAssetUrl(slug: string, filename?: string) {
    return filename ? `/worlds/${slug}/output/world/${filename}` : ''
  }

  function localWorldAssetFilename(files: fs.Dirent[], predicate: (name: string) => boolean) {
    return files.find((file) => predicate(file.name))?.name
  }

  function assetKeyForFilename(key: string) {
    return key.replace(/[^a-z0-9_-]/gi, '_')
  }

  function parseIndexedName(fileName: string) {
    const match = fileName.match(/^(\d+)-(.+?)(\.[^.]+)$/)
    if (!match) return undefined
    return {
      index: Number(match[1]),
      slug: match[2],
      extension: match[3],
      name: fileName,
    }
  }

  function latestIndexedFile(files: fs.Dirent[], slug: string, extension?: string) {
    return files
      .map((file) => parseIndexedName(file.name))
      .filter((entry): entry is NonNullable<ReturnType<typeof parseIndexedName>> => {
        if (!entry) return false
        return entry.slug === slug && (!extension || entry.extension === extension)
      })
      .sort((a, b) => b.index - a.index)[0]
  }

  function latestNamedFile(files: fs.Dirent[], predicate: (entry: NonNullable<ReturnType<typeof parseIndexedName>>) => boolean) {
    return files
      .map((file) => parseIndexedName(file.name))
      .filter((entry): entry is NonNullable<ReturnType<typeof parseIndexedName>> => {
        if (!entry) return false
        return predicate(entry)
      })
      .sort((a, b) => b.index - a.index)[0]?.name
  }

  function fallbackWorldAssetFilename(files: fs.Dirent[], indexedPredicate: (name: string) => boolean, legacyPredicate: (name: string) => boolean) {
    return localWorldAssetFilename(files, indexedPredicate)
      ?? localWorldAssetFilename(files, legacyPredicate)
  }

  function emptyWorldManifest(slug: string, project?: Record<string, unknown>): WorldManifest {
    return {
      world_id: slug,
      display_name: String(project?.display_name || slug),
      world_marble_url: '',
      tags: null,
      world_prompt: null,
      created_at: typeof project?.created_at === 'string' ? project.created_at : null,
      updated_at: null,
      assets: {
        mesh: { collider_mesh_url: '' },
        imagery: { pano_url: '' },
        splats: {
          spz_urls: {},
          semantics_metadata: {
            metric_scale_factor: 1,
            ground_plane_offset: 0,
            flip_y: true,
          },
        },
        thumbnail_url: '',
        caption: '',
      },
    }
  }

  function readProjectManifest(slug: string) {
    const projectPath = path.join(worldsDir, slug, 'project.json')
    if (!fs.existsSync(projectPath) || !fs.statSync(projectPath).isFile()) return undefined
    try {
      const project = JSON.parse(fs.readFileSync(projectPath, 'utf-8')) as Record<string, unknown>
      return emptyWorldManifest(slug, project)
    } catch {
      return emptyWorldManifest(slug)
    }
  }

  function readWorldManifest(slug: string) {
    const worldDir = path.join(worldsDir, slug, 'output', 'world')
    const files = visibleFiles(worldDir)
    const latestWorld = latestIndexedFile(files, 'world', '.json')
    const legacyWorld = localWorldAssetFilename(files, (name) => name === 'world.json')
    const worldFile = latestWorld?.name ?? legacyWorld

    if (worldFile) {
      const raw = fs.readFileSync(path.join(worldDir, worldFile), 'utf-8')
      return {
        world: JSON.parse(raw) as WorldManifest,
        index: latestWorld?.index,
      }
    }

    const projectWorld = readProjectManifest(slug)
    return projectWorld ? { world: projectWorld, index: undefined } : undefined
  }

  function readWorldManifestForIndex(slug: string, index: number) {
    const worldDir = path.join(worldsDir, slug, 'output', 'world')
    const indexedPath = path.join(worldDir, `${index}-world.json`)
    if (fs.existsSync(indexedPath) && fs.statSync(indexedPath).isFile()) {
      return JSON.parse(fs.readFileSync(indexedPath, 'utf-8')) as WorldManifest
    }

    const legacyPath = path.join(worldDir, 'world.json')
    if (index === 0 && fs.existsSync(legacyPath) && fs.statSync(legacyPath).isFile()) {
      return JSON.parse(fs.readFileSync(legacyPath, 'utf-8')) as WorldManifest
    }

    return readProjectManifest(slug) ?? emptyWorldManifest(slug)
  }

  function withLocalWorldAssets(slug: string, world: WorldManifest, index?: number) {
    const files = visibleFiles(path.join(worldsDir, slug, 'output', 'world'))
    const existingSpzUrls = world.assets?.splats?.spz_urls ?? {}
    const spzUrls: Record<string, string> = {}

    for (const key of Object.keys(existingSpzUrls)) {
      const assetKey = assetKeyForFilename(key)
      const filename = index === undefined
        ? latestNamedFile(files, (entry) => entry.slug === `world-${assetKey}` && entry.extension === '.spz')
          ?? localWorldAssetFilename(files, (name) => name === `0-world-${assetKey}.spz`)
        : fallbackWorldAssetFilename(
          files,
          (name) => name === `${index}-world-${assetKey}.spz`,
          (name) => name === `0-world-${assetKey}.spz`,
        )
      if (filename) spzUrls[key] = worldAssetUrl(slug, filename)
    }

    for (const file of files) {
      const match = file.name.match(/^(\d+)-world-(100k|150k|500k|full_res)\.spz$/)
      if (match && (index === undefined || Number(match[1]) === index) && WORLD_SPZ_KEYS.has(match[2])) {
        spzUrls[match[2]] = worldAssetUrl(slug, file.name)
        continue
      }
      const legacyMatch = file.name.match(/^0-world-(100k|150k|500k|full_res)\.spz$/)
      if (legacyMatch && index !== undefined && WORLD_SPZ_KEYS.has(legacyMatch[1]) && !spzUrls[legacyMatch[1]]) {
        spzUrls[legacyMatch[1]] = worldAssetUrl(slug, file.name)
        continue
      }
      const keyOnlyMatch = file.name.match(/^world-(100k|150k|500k|full_res)\.spz$/)
      if (keyOnlyMatch && WORLD_SPZ_KEYS.has(keyOnlyMatch[1]) && !spzUrls[keyOnlyMatch[1]]) {
        spzUrls[keyOnlyMatch[1]] = worldAssetUrl(slug, file.name)
      }
    }

    const collider = index === undefined
      ? latestNamedFile(files, (entry) => entry.slug === 'world' && entry.extension === '.glb') ?? localWorldAssetFilename(files, (name) => name === '0-world.glb')
      : fallbackWorldAssetFilename(files, (name) => name === `${index}-world.glb`, (name) => name === '0-world.glb')
    const pano = index === undefined
      ? latestNamedFile(files, (entry) => entry.slug === 'world-pano' && IMAGE_EXTENSIONS.has(entry.extension.toLowerCase()))
        ?? localWorldAssetFilename(files, (name) => /^0-world-pano\.(png|jpe?g|webp|avif)$/i.test(name))
      : fallbackWorldAssetFilename(
        files,
        (name) => new RegExp(`^${index}-world-pano\\.(png|jpe?g|webp|avif)$`, 'i').test(name),
        (name) => /^0-world-pano\.(png|jpe?g|webp|avif)$/i.test(name),
      )
    const thumbnail = index === undefined
      ? latestNamedFile(files, (entry) => entry.slug === 'world-thumbnail' && IMAGE_EXTENSIONS.has(entry.extension.toLowerCase()))
        ?? localWorldAssetFilename(files, (name) => /^0-world-thumbnail\.(png|jpe?g|webp|avif)$/i.test(name))
      : fallbackWorldAssetFilename(
        files,
        (name) => new RegExp(`^${index}-world-thumbnail\\.(png|jpe?g|webp|avif)$`, 'i').test(name),
        (name) => /^0-world-thumbnail\.(png|jpe?g|webp|avif)$/i.test(name),
      )

    return {
      ...world,
      assets: {
        ...(world.assets ?? {}),
        mesh: {
          ...(world.assets?.mesh ?? {}),
          collider_mesh_url: worldAssetUrl(slug, collider),
        },
        imagery: {
          ...(world.assets?.imagery ?? {}),
          pano_url: worldAssetUrl(slug, pano),
        },
        splats: {
          ...(world.assets?.splats ?? {}),
          spz_urls: spzUrls,
          semantics_metadata: {
            metric_scale_factor: 1,
            ground_plane_offset: 0,
            flip_y: true,
            ...((world.assets?.splats?.semantics_metadata ?? {}) as Record<string, unknown>),
          },
        },
        thumbnail_url: worldAssetUrl(slug, thumbnail),
      },
    }
  }

  function worldAssetIndexes(slug: string) {
    const files = visibleFiles(path.join(worldsDir, slug, 'output', 'world'))
    const indexes = new Set<number>()
    for (const file of files) {
      const parsed = parseIndexedName(file.name)
      if (!parsed) continue
      if (
        parsed.slug === 'world' ||
        parsed.slug === 'world-pano' ||
        parsed.slug === 'world-thumbnail' ||
        /^world-(100k|150k|500k|full_res)$/.test(parsed.slug)
      ) {
        indexes.add(parsed.index)
      }
    }
    if (files.some((file) => file.name === 'world.json')) indexes.add(0)
    return [...indexes].sort((a, b) => a - b)
  }

  function readWorldVersions(slug: string) {
    const indexes = worldAssetIndexes(slug)
    const projectWorld = readProjectManifest(slug)
    if (!indexes.length && projectWorld) indexes.push(0)

    return indexes.map((index) => {
      const world = withLocalWorldAssets(slug, readWorldManifestForIndex(slug, index), index)
      const colliderUrl = String(world.assets?.mesh?.collider_mesh_url || '')
      const spzUrls = world.assets?.splats?.spz_urls ?? {}
      return {
        index,
        label: `v${index}`,
        world,
        complete: Boolean(colliderUrl && Object.keys(spzUrls).length),
      }
    })
  }

  function sceneProjectPath(slug: string) {
    const worldDir = path.resolve(worldsDir, slug)
    const isInsideWorlds = worldDir !== worldsDir && worldDir.startsWith(`${worldsDir}${path.sep}`)
    if (!isInsideWorlds) return null
    return path.join(worldDir, 'scene', 'project.json')
  }

  function sanitizePlacementProject(input: unknown) {
    if (!input || typeof input !== 'object') return undefined
    const record = input as Record<string, unknown>
    if (record.version !== PROJECT_VERSION || !Array.isArray(record.instances)) return undefined

    const instances = record.instances.flatMap((instance): Array<Record<string, unknown>> => {
      if (!instance || typeof instance !== 'object') return []
      const item = instance as Record<string, unknown>
      const { instanceId, objectId, assetId, physics, position, rotation, scale } = item
      const isVec3 = (value: unknown): value is [number, number, number] => (
        Array.isArray(value) &&
        value.length === 3 &&
        value.every((part) => typeof part === 'number' && Number.isFinite(part))
      )

      if (typeof instanceId !== 'string' || typeof objectId !== 'string') return []
      if (assetId !== undefined && typeof assetId !== 'string') return []
      if (physics !== undefined && physics !== 'rigidbody' && physics !== 'static') return []
      if (!isVec3(position) || !isVec3(rotation) || !isVec3(scale)) return []
      return [{ instanceId, objectId, ...(assetId ? { assetId } : {}), physics: physics ?? 'rigidbody', position, rotation, scale }]
    })

    return { version: PROJECT_VERSION, instances }
  }

  function readSceneProject(slug: string) {
    const filePath = sceneProjectPath(slug)
    if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return undefined
    try {
      return sanitizePlacementProject(JSON.parse(fs.readFileSync(filePath, 'utf-8')))
    } catch {
      return undefined
    }
  }

  function isSceneProjectFile(file: string) {
    return path.basename(file) === 'project.json' && path.basename(path.dirname(file)) === 'scene'
  }

  function hasHiddenPathPart(file: string) {
    const relative = path.relative(worldsDir, file)
    if (relative.startsWith('..') || path.isAbsolute(relative)) return false
    return relative.split(path.sep).some((part) => part.startsWith('.'))
  }

  function isTopLevelWorldDir(file: string) {
    const relative = path.relative(worldsDir, file)
    if (relative.startsWith('..') || path.isAbsolute(relative)) return false
    const parts = relative.split(path.sep)
    return parts.length === 1 && Boolean(parts[0]) && !parts[0].startsWith('.')
  }

  function isWorldProjectFile(file: string) {
    const relative = path.relative(worldsDir, file)
    if (relative.startsWith('..') || path.isAbsolute(relative)) return false
    const parts = relative.split(path.sep)
    return parts.length === 2 && parts[1] === 'project.json'
  }

  function isWorldManifestFile(file: string) {
    const relative = path.relative(worldsDir, file)
    if (relative.startsWith('..') || path.isAbsolute(relative)) return false
    const parts = relative.split(path.sep)
    return parts.length === 4 && parts[1] === 'output' && parts[2] === 'world' && (parts[3] === 'world.json' || /^\d+-world\.json$/.test(parts[3]))
  }

  function isWorldCatalogFile(file: string) {
    return isWorldProjectFile(file) || isWorldManifestFile(file)
  }

  function isActiveWorldOutputPath(file: string) {
    if (!activeWorldSlug) return false
    const outputDir = path.join(worldsDir, activeWorldSlug, 'output')
    const relative = path.relative(outputDir, file)
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
  }

  function worldSlugForFile(file: string) {
    const relative = path.relative(worldsDir, file)
    if (relative.startsWith('..') || path.isAbsolute(relative)) return null
    return relative.split(path.sep)[0] || null
  }

  function readWorlds() {
    if (!fs.existsSync(worldsDir)) return []
    const entries = fs.readdirSync(worldsDir)
      .filter((slug) => {
        const worldDir = path.join(worldsDir, slug)
        return fs.statSync(worldDir).isDirectory() && Boolean(readWorldManifest(slug))
      })
      .map((slug) => {
        const manifest = readWorldManifest(slug)
        if (!manifest) throw new Error(`No world manifest or project.json found for ${slug}`)
        const worldVersions = readWorldVersions(slug)
        const defaultWorld = worldVersions.at(-1)?.world ?? withLocalWorldAssets(slug, manifest.world, manifest.index)
        return {
          slug,
          world: defaultWorld,
          worldVersions,
          objectAssets: readObjectAssets(slug),
          allObjectAssets: [],
          sourceImageUrl: readSourceImageUrl(slug),
          sourceImageVersions: readSourceImageVersions(slug),
          worldSfxUrls: readWorldSfxUrls(slug),
          sceneProject: readSceneProject(slug),
        }
      })
    const allObjectAssets = entries.flatMap((entry) => entry.objectAssets)
    return entries.map((entry) => ({ ...entry, allObjectAssets }))
  }

  function openFolder(folderPath: string) {
    const command = process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'cmd'
        : 'xdg-open'
    const args = process.platform === 'win32'
      ? ['/c', 'start', '', folderPath]
      : [folderPath]
    const child = spawn(command, args, { detached: true, stdio: 'ignore' })
    child.unref()
  }

  return {
    name: 'worlds',
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID
    },
    load(id) {
      if (id === RESOLVED_ID) {
        return `export default ${JSON.stringify(readWorlds())}`
      }
    },
    handleHotUpdate({ file, server }) {
      const RELOAD_EXTENSIONS = new Set(['.glb', '.spz', '.mp3', '.ogg', '.wav', '.m4a', '.opus', '.json'])
      const worldSlug = worldSlugForFile(file)
      if (!worldSlug) return
      if (hasHiddenPathPart(file)) return []
      const shouldReloadWorldsModule = isWorldCatalogFile(file) || isActiveWorldOutputPath(file) || (RELOAD_EXTENSIONS.has(path.extname(file).toLowerCase()) && !isSceneProjectFile(file))
      if (!shouldReloadWorldsModule) return
      if (!hotReloadEnabled) return []
      if (activeWorldSlug !== null && worldSlug !== activeWorldSlug && !isWorldCatalogFile(file)) return []
      if (shouldReloadWorldsModule) {
        const mod = server.moduleGraph.getModuleById(RESOLVED_ID)
        if (mod) server.moduleGraph.invalidateModule(mod)
        server.ws.send({ type: 'full-reload' })
        return []
      }
    },
    configureServer(server) {
      server.watcher.add(worldsDir)
      const invalidateWorldsModule = () => {
        const mod = server.moduleGraph.getModuleById(RESOLVED_ID)
        if (mod) server.moduleGraph.invalidateModule(mod)
      }
      const reloadWorldsModule = () => {
        invalidateWorldsModule()
        server.ws.send({ type: 'full-reload' })
      }
      server.watcher.on('add', (file) => {
        if (!hotReloadEnabled || hasHiddenPathPart(file) || (!isActiveWorldOutputPath(file) && !isWorldCatalogFile(file))) return
        reloadWorldsModule()
      })
      server.watcher.on('unlink', (file) => {
        if (!hotReloadEnabled || hasHiddenPathPart(file) || (!isActiveWorldOutputPath(file) && !isWorldCatalogFile(file))) return
        reloadWorldsModule()
      })
      server.watcher.on('addDir', (file) => {
        if (!hotReloadEnabled || hasHiddenPathPart(file) || (!isTopLevelWorldDir(file) && !isActiveWorldOutputPath(file))) return
        reloadWorldsModule()
      })
      server.watcher.on('unlinkDir', (file) => {
        if (!hotReloadEnabled || hasHiddenPathPart(file) || (!isTopLevelWorldDir(file) && !isActiveWorldOutputPath(file))) return
        reloadWorldsModule()
      })
      const MIME: Record<string, string> = {
        '.spz': 'application/octet-stream',
        '.glb': 'model/gltf-binary',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.jpg': 'image/jpeg',
        '.mp3': 'audio/mpeg',
        '.ogg': 'audio/ogg',
        '.wav': 'audio/wav',
        '.m4a': 'audio/mp4',
        '.opus': 'audio/ogg',
        '.json': 'application/json',
      }
      server.middlewares.use('/__active-world', (req, res) => {
        const requestUrl = new URL(req.url || '/', 'http://localhost')
        const slug = requestUrl.searchParams.get('slug')
        if (!slug) {
          res.statusCode = 400
          res.end('Missing slug')
          return
        }

        const worldDir = path.resolve(worldsDir, slug)
        const isInsideWorlds = worldDir !== worldsDir && worldDir.startsWith(`${worldsDir}${path.sep}`)
        if (!isInsideWorlds) {
          res.statusCode = 400
          res.end('Invalid slug')
          return
        }

        activeWorldSlug = slug
        res.statusCode = 204
        res.end()
      })
      server.middlewares.use('/__hot-reload', (req, res) => {
        const requestUrl = new URL(req.url || '/', 'http://localhost')
        const enabled = requestUrl.searchParams.get('enabled')
        if (enabled !== 'true' && enabled !== 'false') {
          res.statusCode = 400
          res.end('Missing enabled')
          return
        }

        hotReloadEnabled = enabled === 'true'
        res.statusCode = 204
        res.end()
      })
      server.middlewares.use('/__open-world-folder', (req, res) => {
        const requestUrl = new URL(req.url || '/', 'http://localhost')
        const slug = requestUrl.searchParams.get('slug')
        const target = requestUrl.searchParams.get('target')
        const asset = requestUrl.searchParams.get('asset')
        if (!slug) {
          res.statusCode = 400
          res.end('Missing slug')
          return
        }

        const worldDir = path.resolve(worldsDir, slug)
        const isInsideWorlds = worldDir !== worldsDir && worldDir.startsWith(`${worldsDir}${path.sep}`)
        if (!isInsideWorlds) {
          res.statusCode = 404
          res.end('Not found')
          return
        }

        const folderPath = (() => {
          if (target === 'scene') return path.join(worldDir, 'scene')
          if (target === 'world-asset') return path.join(worldDir, 'output', 'world')
          if (target === 'object-asset') return asset ? path.join(worldDir, 'output', asset) : undefined
          return worldDir
        })()
        if (!folderPath) {
          res.statusCode = 400
          res.end('Missing asset')
          return
        }
        const resolvedFolderPath = path.resolve(folderPath)
        const isInsideWorld = resolvedFolderPath === worldDir || resolvedFolderPath.startsWith(`${worldDir}${path.sep}`)
        if (!isInsideWorld) {
          res.statusCode = 404
          res.end('Not found')
          return
        }

        if (target === 'scene') {
          fs.mkdirSync(resolvedFolderPath, { recursive: true })
        } else if (!fs.existsSync(resolvedFolderPath) || !fs.statSync(resolvedFolderPath).isDirectory()) {
          res.statusCode = 404
          res.end('Not found')
          return
        }

        openFolder(resolvedFolderPath)
        res.statusCode = 204
        res.end()
      })
      server.middlewares.use('/__scene-project', (req, res) => {
        res.setHeader('Cache-Control', 'no-store')
        const requestUrl = new URL(req.url || '/', 'http://localhost')
        const slug = requestUrl.searchParams.get('slug')
        if (!slug) {
          res.statusCode = 400
          res.end('Missing slug')
          return
        }

        const filePath = sceneProjectPath(slug)
        if (!filePath) {
          res.statusCode = 400
          res.end('Invalid slug')
          return
        }

        if (req.method === 'GET') {
          const project = readSceneProject(slug)
          if (!project) {
            res.statusCode = 404
            res.end('Not found')
            return
          }

          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(project, null, 2))
          return
        }

        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method not allowed')
          return
        }

        let body = ''
        req.setEncoding('utf-8')
        req.on('data', (chunk) => {
          body += chunk
        })
        req.on('end', () => {
          try {
            const project = sanitizePlacementProject(JSON.parse(body))
            if (!project) {
              res.statusCode = 400
              res.end('Invalid project')
              return
            }

            fs.mkdirSync(path.dirname(filePath), { recursive: true })
            fs.writeFileSync(filePath, `${JSON.stringify(project, null, 2)}\n`)
            invalidateWorldsModule()
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(project))
          } catch {
            res.statusCode = 400
            res.end('Invalid JSON')
          }
        })
      })
      server.middlewares.use('/worlds', (req, res, next) => {
        const requestPath = decodeURIComponent((req.url || '/').split('?')[0])
        const filePath = path.resolve(worldsDir, `.${requestPath}`)
        const isInsideWorlds = filePath === worldsDir || filePath.startsWith(`${worldsDir}${path.sep}`)

        if (!isInsideWorlds) {
          res.statusCode = 404
          res.end('Not found')
          return
        }

        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const ext = path.extname(filePath).toLowerCase()
          res.setHeader('Content-Type', MIME[ext] ?? 'application/octet-stream')
          fs.createReadStream(filePath).pipe(res)
        } else if (path.extname(requestPath)) {
          res.statusCode = 404
          res.end('Not found')
        } else {
          next()
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), worldsPlugin()],
  server: { fs: { allow: ['..'] } },
})
