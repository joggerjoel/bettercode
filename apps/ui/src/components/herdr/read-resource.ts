import { useEffect, useState } from "react"
import type { EditorDocument } from "@betterc0de/schema"
import type { z } from "zod"

type Resource<T> = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; value: T }
export function useReadResource<T>(url: string, schema: z.ZodType<T>): Resource<T> {
  const [result, setResult] = useState<{ url: string; state: Resource<T> }>({ url, state: { kind: "loading" } })
  useEffect(() => {
    const controller = new AbortController()
    setResult({ url, state: { kind: "loading" } })
    void (async () => {
      try {
        const response = await fetch(url, { signal: controller.signal, redirect: "error" })
        if (!response.ok) throw new Error(response.status === 409 ? "The selected review changed. Refresh the unit." : `Unable to load review data (${response.status}).`)
        const raw: unknown = await response.json()
        const value = schema.parse(raw)
        if (!controller.signal.aborted) setResult({ url, state: { kind: "ready", value } })
      } catch (error) {
        if (!controller.signal.aborted) setResult({ url, state: { kind: "error", message: error instanceof Error ? error.message : "Unable to load review data." } })
      }
    })()
    return () => controller.abort()
  }, [url, schema])
  return result.url === url ? result.state : { kind: "loading" }
}
export function unitResource(unitId: string, resource: string, tree?: string, path?: string): string {
  const query = new URLSearchParams()
  if (tree !== undefined) query.set("tree", tree)
  if (path !== undefined) query.set("path", path)
  return `/api/v1/herdr/${encodeURIComponent(unitId)}/${resource}?${query}`
}

export function candidateDiffResource(document: EditorDocument): string {
  const query = new URLSearchParams({ tree: document.tree })
  if (document.base_sha !== null) query.set("base_sha", document.base_sha)
  if (document.candidate_commit !== null) query.set("candidate_commit", document.candidate_commit)
  return `/api/v1/herdr/${encodeURIComponent(document.unit_id)}/diff?${query}`
}
