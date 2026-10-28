/** Validate the raw request target before Vite's proxy can normalize it. */
export function isHerdrReadRequest(method, target) {
  if (!["GET", "POST"].includes(method) || typeof target !== "string") return false
  const pathname = target.split("?", 1)[0]
  if (pathname === "/api/v1/herdr/snapshot") return method === "GET"
  const match = /^\/api\/v1\/herdr\/([^/]+)\/(editor|tree|file|diff|ack)$/.exec(pathname)
  if (!match || (match[2] === "ack" ? method !== "POST" : method !== "GET")) return false
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
        if (request.method === "POST" && request.headers.origin !== `http://${request.headers.host}`) {
          response.statusCode = 403
          response.end("Review decision requires same origin")
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
