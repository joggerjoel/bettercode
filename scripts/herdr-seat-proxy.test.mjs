import assert from "node:assert/strict"
import http from "node:http"
import { test } from "node:test"
import { createServer } from "vite"
import { herdrSeatProxy } from "./herdr-seat-proxy.mjs"

function request(port, path, method = "GET", headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ headers, host: "127.0.0.1", port, path, method }, (res) => {
      let body = ""
      res.setEncoding("utf8")
      res.on("data", (chunk) => { body += chunk })
      res.on("end", () => resolve({ status: res.statusCode, body }))
    })
    req.on("error", reject)
    req.end()
  })
}

test("real Vite proxy authenticates only canonical Herdr reads", async () => {
  const received = []
  const upstream = http.createServer((req, res) => {
    received.push({ path: req.url, authorization: req.headers.authorization })
    res.end("fixture read")
  })
  let vite
  try {
    await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve))
    vite = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, ...herdrSeatProxy({ port: upstream.address().port, token: "synthetic-review-token" }) })
    await vite.listen()
    const port = vite.httpServer.address().port
    for (const target of [
      "/api/v1/herdr/%2e%2e/settings", "/api/v1/herdr/../settings",
      "/api/v1/herdr/u/../../settings", "/api/v1/herdr/u%2F..%2F../editor",
      "/api/v1/herdr/u%5C../editor", "/api/v1/herdr/%2e/editor",
      "/api/v1/herdr/u/editor/extra", "/api/v1/herdr/u/ack",
      "/api/v1/herdr/snapshot/extra", "/api/v1/settings",
      "/api/v1/herdr/u//editor", "/api/v1/herdr/%zz/editor",
    ]) {
      assert.equal((await request(port, target)).status, 405, target)
    }
    assert.equal((await request(port, "/api/v1/herdr/u/editor", "POST")).status, 405)
    assert.deepEqual(received, [], "rejected requests never reach authenticated upstream")
    for (const target of ["/api/v1/herdr/snapshot?refresh=1", ...["editor", "tree", "file", "diff"].map((resource) => `/api/v1/herdr/unit%201/${resource}?tree=%2Ftmp%2Ffixture&path=review.ts`)]) {
      assert.deepEqual(await request(port, target), { status: 200, body: "fixture read" })
      assert.deepEqual(received.at(-1), { path: target, authorization: "Bearer synthetic-review-token" })
    }
    assert.equal(received.length, 5)
    assert.equal((await request(port, "/api/v1/herdr/u/ack", "POST", { Origin: "https://evil.example" })).status, 403)
    assert.equal(received.length, 5)
    assert.equal((await request(port, "/api/v1/herdr/u/ack", "POST", { Origin: `http://127.0.0.1:${port}` })).status, 200)
    assert.equal(received.length, 6)
    for (const target of ["/api/v1/herdr/%2e%2e/ack", "/api/v1/herdr/u/ack/extra", "/api/v1/settings"]) assert.equal((await request(port, target, "POST")).status, 405)
  } finally {
    await vite?.close()
    upstream.closeAllConnections()
    await new Promise((resolve) => upstream.close(resolve))
  }
})
