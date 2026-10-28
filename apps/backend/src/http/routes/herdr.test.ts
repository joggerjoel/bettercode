import type { EditorDocument } from "@betterc0de/schema"
import net from "node:net"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import http from "node:http"
import { execFileSync } from "node:child_process"
import { Hono } from "hono"
import { afterEach, describe, expect, it } from "vitest"
import { registerHerdrRoutes } from "./herdr"
import { resolveApprovedWorkspaceRoot } from "../../services/workspace/authorization"
import { HttpError } from "../../errors"

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
async function fixture(socketPath?: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "herdr-routes-"))
  cleanups.push(() => fs.rm(root, { recursive: true, force: true }))
  const tree = path.join(root, "unit")
  await fs.mkdir(tree)
  await fs.writeFile(path.join(tree, "review.ts"), "const result = null\n")
  await fs.writeFile(path.join(root, "private.txt"), "outside")
  await fs.symlink(path.join(root, "private.txt"), path.join(tree, "escape"))
  const document: EditorDocument = { unit_id: "u1", profile: "review", phase: "running", tree, candidate_commit: null, base_sha: null, findings: [], escalations: [] }
  const server = http.createServer((request, response) => response.end(JSON.stringify(request.url?.startsWith("/v1/snapshot") ? { units: [{ unit_id: "u1", phase: "running" }] } : document)))
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  cleanups.push(() => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()) }))
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Missing viewer listener")
  const api = new Hono()
  api.onError((error) => Response.json({ error: error.message }, { status: error instanceof HttpError ? error.statusCode : 500 }))
  registerHerdrRoutes(api, { herdrViewerPort: address.port, herdrSocketPath: socketPath })
  const request = (resource: string, relative = "") => api.request(`/herdr/u1/${resource}?${new URLSearchParams({ tree: document.tree, path: relative })}`)
  return { api, request, tree, document }
}
describe("Herdr read transport", () => {
  it("serves selected tree/files without globally registering the root", async () => {
    const { api, request, tree } = await fixture()
    expect((await api.request("/herdr/snapshot")).status).toBe(200)
    const document = await request("editor")
    expect(document.status).toBe(200)
    const listing = await (await request("tree")).json()
    expect(listing).toMatchObject({ tree, entries: [{ name: "review.ts", path: "review.ts", directory: false }] })
    expect(await (await request("file", "review.ts")).json()).toEqual({ path: "review.ts", content: "const result = null\n" })
    await expect(resolveApprovedWorkspaceRoot({}, tree)).rejects.toMatchObject({ code: "workspace_not_registered" })
    expect((await request("file", "../private.txt")).status).not.toBe(200)
    expect((await request("file", "escape")).status).not.toBe(200)
    expect((await api.request("/herdr/u1/file?path=review.ts")).status).toBe(409)
    expect((await api.request("/herdr/u1/tree", { method: "POST" })).status).toBe(404)
  })
  it("returns no candidate without invoking git in a non-repository", async () => {
    const { request, document } = await fixture()
    expect(await (await request("diff")).json()).toEqual({ kind: "none" })
    document.base_sha = "a".repeat(40)
    expect(await (await request("diff")).json()).toEqual({ kind: "none" })
    document.base_sha = null
    document.candidate_commit = "a".repeat(40)
    expect(await (await request("diff")).json()).toEqual({ kind: "none" })
  })
  it("re-fetches authoritative tree and rejects a stale selection", async () => {
    const { api, request, document, tree } = await fixture()
    expect((await request("editor")).status).toBe(200)
    document.tree = path.dirname(tree)
    expect((await api.request(`/herdr/u1/file?${new URLSearchParams({ tree, path: "review.ts" })}`)).status).toBe(409)
    document.tree = "relative/path"
    expect((await request("editor")).status).toBe(403)
  })
  it("reads the pinned revision diff without changing repository status", async () => {
    const { request, tree, document } = await fixture()
    const git = (...args: string[]) => execFileSync("git", args, { cwd: tree, encoding: "utf8" }).trim()
    git("init", "-q")
    git("add", "review.ts")
    git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "base")
    document.base_sha = git("rev-parse", "HEAD")
    await fs.writeFile(path.join(tree, "review.ts"), "const result = true\n")
    git("add", "review.ts")
    git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "candidate")
    document.candidate_commit = git("rev-parse", "HEAD")
    await fs.writeFile(path.join(tree, "review.ts"), "uncommitted\n")
    const before = git("status", "--porcelain")
    expect(await (await request("diff")).json()).toMatchObject({ kind: "diff", truncated: false, diff: expect.stringContaining("+const result = true") })
    expect(git("status", "--porcelain")).toBe(before)
  })
})

 it("acks only a freshly open escalation of the selected unit with closed input", async () => {
   const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ack-route-"))
   const socketPath = path.join(dir, "s")
   const commands: unknown[] = []
   const server = net.createServer((socket) => socket.once("data", (data) => { commands.push(JSON.parse(data.toString())); socket.end('{"ok":false,"error":{"message":"operator refused"}}\n') }))
   await new Promise<void>((resolve) => server.listen(socketPath, resolve))
   cleanups.push(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); await fs.rm(dir, { recursive: true, force: true }) })
   const { api, document } = await fixture(socketPath)
   const send = (body: unknown, unit = "u1") => api.request(`/herdr/${unit}/ack`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
   const body = { escalation_id: "12", decision: "approve" }
   expect((await send(body)).status).toBe(409)
   document.escalations.push({ escalation_id: "12", kind: "approval", detail: "Review" })
   expect((await send({ ...body, socketPath })).status).toBe(400)
   expect((await send({ ...body, decision: "merge" })).status).toBe(400)
   expect((await send(body, "other")).status).toBe(500)
   expect(commands).toHaveLength(0)
   expect(await (await send(body)).json()).toEqual({ ok: false, message: "operator refused" })
   expect(commands).toHaveLength(1)
   document.escalations = []
   expect((await send(body)).status).toBe(409)
   expect(commands).toHaveLength(1)
 })
