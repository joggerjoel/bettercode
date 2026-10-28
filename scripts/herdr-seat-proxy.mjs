/** Validate the raw request target before Vite's proxy can normalize it. */
export function isHerdrReadRequest(method, target) {
  if (method !== "GET" || typeof target !== "string") return false
  const pathname = target.split("?", 1)[0]
  if (pathname === "/api/v1/herdr/snapshot") return true
  const match = /^\/api\/v1\/herdr\/([^/]+)\/(editor|tree|file|diff)$/.exec(pathname)
  if (!match) return false
  try {
    const unitId = decodeURIComponent(match[1])
    return unitId !== "." && unitId !== ".." && !/[\\/]/.test(unitId)
      && encodeURIComponent(unitId) === match[1]
      && new URL(target, "http://127.0.0.1").pathname === pathname
  } catch {
    return false
  }
}

export function herdrSeatProxy({ port, token }) {
  return {
    plugins: [{ name: "herdr-read-only-proxy", configureServer(server) {
      server.middlewares.use((request, response, next) => {
        // Every raw /api/ request is checked before the proxy sees authority.
        if (request.url?.startsWith("/api/") && !isHerdrReadRequest(request.method, request.url)) {
          response.statusCode = 405
          response.end("Read-only review seat")
          return
        }
        next()
      })
    } }],
    server: { host: "127.0.0.1", port: 0, proxy: {
      "^/api/v1/herdr/": { target: `http://127.0.0.1:${port}`, headers: { Authorization: `Bearer ${token}` } },
    } },
  }
}
