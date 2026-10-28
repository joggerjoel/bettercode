import { z } from "zod"
import { postAck, ackDecisionSchema, escalationIdSchema } from "../../services/herdr/ack"
import path from "node:path"
import type { Hono } from "hono"
import type { ServerConfig } from "../../config"
import { HttpError } from "../../errors"
import { createEditorClient } from "../../services/herdr/editor-client"
import { resolveReadOnlyWorkspaceRoot } from "../../services/workspace/authorization"
import { readWorkspaceFile, resolveWorkspaceOperationPath } from "../../services/workspace/files"
import { listDirectory } from "../../services/filesystem-browser"
import { diffRange } from "../../services/git/diff"

export function registerHerdrRoutes(api: Hono, config: Pick<ServerConfig, "herdrViewerPort" | "herdrSocketPath">): void {
  const client = config.herdrViewerPort === undefined ? null : createEditorClient({ port: config.herdrViewerPort })
  api.post("/herdr/:unitId/ack", async (c) => {
    if (!client || !config.herdrSocketPath) throw new HttpError(503, "Herdr acknowledgement is not configured")
    const parsed = z.strictObject({ escalation_id: escalationIdSchema, decision: ackDecisionSchema }).safeParse(await c.req.json().catch(() => { throw new HttpError(400, "Invalid acknowledgement JSON") }))
    if (!parsed.success) throw new HttpError(400, "Invalid acknowledgement")
    const unitId = c.req.param("unitId")
    const document = await client.editor(unitId)
    if (document.unit_id !== unitId || !document.escalations.some((entry) => entry.escalation_id === parsed.data.escalation_id)) throw new HttpError(409, "Escalation is no longer open for the selected unit. Refresh to continue.")
    return c.json(await postAck(config.herdrSocketPath, parsed.data.escalation_id, parsed.data.decision))
  })
  api.get("/herdr/snapshot", async (c) => {
    if (!client) throw new HttpError(503, "Herdr viewer is not configured")
    return c.json(await client.snapshot())
  })
  api.get("/herdr/:unitId/:resource", async (c) => {
    if (!client) throw new HttpError(503, "Herdr viewer is not configured")
    const resource = c.req.param("resource")
    if (!["editor", "tree", "file", "diff"].includes(resource)) return c.notFound()
    const document = await client.editor(c.req.param("unitId"))
    const root = await resolveReadOnlyWorkspaceRoot(document.tree)
    if (resource === "editor") return c.json(document)
    if (c.req.query("tree") !== document.tree) throw new HttpError(409, "The selected workspace changed. Refresh the unit.")
    if (resource === "diff") {
      if (document.base_sha === null || document.candidate_commit === null) return c.json({ kind: "none" })
      return c.json({ kind: "diff", ...await diffRange(root, document.base_sha, document.candidate_commit) })
    }
    const relative = c.req.query("path") ?? ""
    if (resource === "file") {
      const file = await readWorkspaceFile(root, relative, 2 * 1024 * 1024, { expectedCanonicalRoot: root })
      return c.json({ path: relative, content: file.content.toString("utf8") })
    }
    const { target } = await resolveWorkspaceOperationPath(root, relative)
    const listing = await listDirectory(target)
    return c.json({ tree: document.tree, truncated: listing.truncated, entries: listing.entries.filter((entry) => !entry.isSymlink).map((entry) => ({
      name: entry.name, path: path.relative(root, entry.path), directory: entry.isDir,
    })) })
  })
}
