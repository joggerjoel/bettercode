import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"
import { createServer } from "vite"

const viewerPort = Number(process.env.BETTERC0DE_HERDR_VIEWER_PORT)
if (!Number.isInteger(viewerPort) || viewerPort < 1 || viewerPort > 65535) {
  throw new Error("Set BETTERC0DE_HERDR_VIEWER_PORT to the loopback viewer port (1–65535).")
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const require = createRequire(import.meta.url)
const { startNodeBackend } = require(path.join(root, "apps/backend/dist/inProcess.js"))
const dataDir = await mkdtemp(path.join(os.tmpdir(), "betterc0de-herdr-seat-"))
let backend
let server
let stopping = false
async function stop() {
  if (stopping) return
  stopping = true
  try { await server?.close() } finally {
    try { await backend?.stop() } finally { await rm(dataDir, { recursive: true, force: true }) }
  }
}
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { void stop().then(() => process.exit(0), () => process.exit(1)) })
try {
  backend = await startNodeBackend({ dataDir, preferredPort: 0 })
  server = await createServer({
    configFile: path.join(root, "apps/ui/vite.herdr.config.ts"),
    plugins: [{ name: "herdr-read-only-proxy", configureServer(server) {
      server.middlewares.use((request, response, next) => {
    if (request.url?.startsWith("/api/") && (request.method !== "GET" || !request.url.startsWith("/api/v1/herdr/"))) {
      response.statusCode = 405
      response.end("Read-only review seat")
      return
    }
    next()
  })
    } }],
    server: { host: "127.0.0.1", port: 0, proxy: {
      // Only the review GET surface is proxied. The token never reaches the renderer.
      "^/api/v1/herdr/": { target: `http://127.0.0.1:${backend.port}`, headers: { Authorization: `Bearer ${backend.token}` } },
    } },
  })
  await server.listen()
  const address = server.httpServer?.address()
  if (!address || typeof address === "string") throw new Error("Herdr seat listener unavailable")
  console.info(`Herdr review: http://127.0.0.1:${address.port}/herdr.html`)
} catch (error) {
  await stop()
  throw error
}
