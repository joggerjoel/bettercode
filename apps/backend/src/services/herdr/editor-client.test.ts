import http from "node:http"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createEditorClient } from "./editor-client"

const servers: http.Server[] = []
afterEach(async () => { for (const server of servers.splice(0)) await new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()) }) })
async function viewer(handler: http.RequestListener) {
  const server = http.createServer(handler)
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Missing listener")
  return address.port
}
const document = { unit_id: "unit /one", profile: "review", phase: "running", tree: "/tmp/tree", candidate_commit: null, base_sha: null, findings: [], escalations: [] }
describe("Herdr editor client", () => {
  it("rejects non-loopback targets before any network request", () => {
    const request = vi.fn<typeof fetch>()
    for (const host of ["example.com", "127.0.0.1.example.com", "localhost", "0.0.0.0", "192.168.1.1"]) expect(() => createEditorClient({ host, port: 1234 }, request)).toThrow(/loopback/)
    for (const port of [0, -1, 65536, 1.5, NaN]) expect(() => createEditorClient({ port }, request)).toThrow(/port/)
    expect(request).not.toHaveBeenCalled()
  })
  it("reads and validates the editor with an encoded unit id and snapshot subset", async () => {
    const port = await viewer((request, response) => {
      const url = new URL(request.url ?? "", "http://localhost")
      response.setHeader("content-type", "application/json")
      if (url.pathname === "/v1/editor") {
        expect(url.searchParams.get("unit_id")).toBe(document.unit_id)
        response.end(JSON.stringify(document))
      } else response.end(JSON.stringify({ units: [{ unit_id: "u", phase: "running", profile_ignored: "x" }], snapshot_revision: 1 }))
    })
    const client = createEditorClient({ port })
    expect(await client.editor(document.unit_id)).toEqual(document)
    expect(await client.snapshot()).toEqual({ units: [{ unit_id: "u", phase: "running" }] })
  })
  it("refuses redirects without contacting their target", async () => {
    let targetCalls = 0
    const target = await viewer((_request, response) => { targetCalls++; response.end(JSON.stringify(document)) })
    const port = await viewer((_request, response) => { response.writeHead(302, { location: `http://127.0.0.1:${target}/v1/editor` }); response.end() })
    await expect(createEditorClient({ port }).editor(document.unit_id)).rejects.toThrow()
    expect(targetCalls).toBe(0)
  })
  it("rejects wrong units, unknown fields, invalid findings and hash lengths", async () => {
    let value: unknown = document
    const port = await viewer((_request, response) => response.end(JSON.stringify(value)))
    const client = createEditorClient({ port })
    for (const invalid of [ { ...document, unit_id: "other" }, { ...document, unexpected: true }, { ...document, candidate_commit: "a".repeat(41) }, { ...document, base_sha: "a".repeat(63) }, { ...document, findings: [{ finding_id: "f", severity: "info", verification: "test", issue: "x" }] } ]) {
      value = invalid
      await expect(client.editor(document.unit_id)).rejects.toThrow()
    }
    for (const length of [40, 64]) {
      value = { ...document, base_sha: "a".repeat(length) }
      expect((await client.editor(document.unit_id)).base_sha).toHaveLength(length)
    }
  })
  it("bounds viewer response size", async () => {
    const port = await viewer((_request, response) => response.end("x".repeat(2 * 1024 * 1024 + 1)))
    await expect(createEditorClient({ port }).snapshot()).rejects.toThrow(/too large/)
  })
})
