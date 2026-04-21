import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

function worldsPlugin(): Plugin {
  const VIRTUAL_ID = 'virtual:worlds'
  const RESOLVED_ID = '\0' + VIRTUAL_ID
  const worldsDir = path.resolve(__dirname, '../worlds')

  function readWorlds() {
    if (!fs.existsSync(worldsDir)) return []
    return fs.readdirSync(worldsDir)
      .filter((slug) => {
        const f = path.join(worldsDir, slug, 'world', 'world.json')
        return fs.existsSync(f) && fs.statSync(f).isFile()
      })
      .map((slug) => {
        const raw = fs.readFileSync(path.join(worldsDir, slug, 'world', 'world.json'), 'utf-8')
        return { slug, world: JSON.parse(raw) }
      })
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
      if (file.startsWith(worldsDir) && file.endsWith('world.json')) {
        const mod = server.moduleGraph.getModuleById(RESOLVED_ID)
        if (mod) server.moduleGraph.invalidateModule(mod)
        server.ws.send({ type: 'full-reload' })
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), worldsPlugin()],
  server: { fs: { allow: ['..'] } },
})
