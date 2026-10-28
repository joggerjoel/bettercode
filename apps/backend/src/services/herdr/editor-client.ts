import { z } from "zod"
import { herdrEditorDocumentSchema, herdrSnapshotSchema } from "@betterc0de/schema"

export function createEditorClient(config: { port: number; host?: string }, request: typeof fetch = fetch) {
  const host = config.host ?? "127.0.0.1"
  if (!["127.0.0.1", "::1", "[::1]"].includes(host)) throw new Error("Herdr viewer must use a loopback address")
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) throw new Error("Invalid Herdr viewer port")
  const origin = `http://${host.includes(":") ? "[::1]" : host}:${config.port}`
  async function read<T>(route: string, schema: z.ZodType<T>): Promise<T> {
    const response = await request(`${origin}${route}`, { redirect: "error", signal: AbortSignal.timeout(5000) })
    if (!response.ok) throw new Error(`Herdr viewer returned ${response.status}`)
    const reader = response.body?.getReader()
    if (!reader) throw new Error("Empty Herdr viewer response")
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        size += chunk.value.byteLength
        if (size > 2 * 1024 * 1024) throw new Error("Herdr viewer response too large")
        chunks.push(chunk.value)
      }
    } finally { await reader.cancel() }
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"))
    return schema.parse(value)
  }
  return {
    snapshot: () => read("/v1/snapshot", herdrSnapshotSchema),
    async editor(unitId: string) {
      const document = await read(`/v1/editor?unit_id=${encodeURIComponent(unitId)}`, herdrEditorDocumentSchema)
      if (document.unit_id !== unitId) throw new Error("Herdr viewer returned a different unit")
      return document
    },
  }
}
