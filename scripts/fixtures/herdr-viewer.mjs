import http from "node:http"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const descriptor = process.argv[2]
if (!descriptor) throw new Error("Usage: node scripts/fixtures/herdr-viewer.mjs <descriptor.json>")
const tree = await fs.mkdtemp(path.join(os.tmpdir(), "herdr-viewer-fixture-"))
await fs.writeFile(path.join(tree, "review.ts"), "export function label(value: string | null) {\n  return value.trim()\n}\n")
const document = {
  unit_id: "unit-1", profile: "fixture", phase: "review", tree, candidate_commit: null, base_sha: null,
  findings: [{ finding_id: "finding-1", severity: "blocking", verification: "test", issue: "Fix the null check." }],
  escalations: [{ escalation_id: "escalation-1", kind: "review required", detail: "Inspect the null handling before continuing." }],
}
const server = http.createServer((request, response) => {
  if (request.method !== "GET") { response.writeHead(405); response.end(); return }
  const url = new URL(request.url ?? "/", "http://127.0.0.1")
  response.setHeader("content-type", "application/json")
  if (url.pathname === "/v1/snapshot") response.end(JSON.stringify({ units: [{ unit_id: document.unit_id, phase: document.phase }] }))
  else if (url.pathname === "/v1/editor" && url.searchParams.get("unit_id") === document.unit_id) response.end(JSON.stringify(document))
  else { response.writeHead(404); response.end(JSON.stringify({ error: "Not found" })) }
})
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
const address = server.address()
if (!address || typeof address === "string") throw new Error("Missing fixture listener")
await fs.writeFile(descriptor, JSON.stringify({ port: address.port, tree }), { mode: 0o600 })
console.info(`Disposable Herdr viewer fixture listening on port ${address.port}`)
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => {
  server.closeAllConnections()
  server.close(() => { void fs.rm(tree, { recursive: true, force: true }).then(() => process.exit(0)) })
})
