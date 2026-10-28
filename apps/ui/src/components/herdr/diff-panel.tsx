import { herdrDiffSchema, type EditorDocument } from "@betterc0de/schema"
import { useReadResource, candidateDiffResource } from "./read-resource"

export function HerdrDiffPanel({ document }: { document: EditorDocument }) {
  if (document.base_sha === null || document.candidate_commit === null) return <p className="p-4 text-sm text-muted-foreground">No candidate diff</p>
  return <CandidateDiff document={document} />
}
function CandidateDiff({ document }: { document: EditorDocument }) {
  const diff = useReadResource(candidateDiffResource(document), herdrDiffSchema)
  if (diff.kind === "loading") return <p role="status" className="p-4 text-sm">Loading candidate diff…</p>
  if (diff.kind === "error") return <p role="alert" className="p-4 text-sm text-destructive">{diff.message}</p>
  if (diff.value.kind === "none") return <p className="p-4 text-sm text-muted-foreground">No candidate diff</p>
  return <section aria-label="Candidate diff" className="min-w-0 p-4">
    <h2 className="mb-3 font-semibold">Candidate diff</h2>
    {diff.value.truncated && <p role="status" className="mb-2 text-sm text-warning">Diff preview truncated ({diff.value.totalBytes} bytes total).</p>}
    <pre className="max-h-96 overflow-auto text-xs leading-5">{diff.value.diff || "No changes between revisions"}</pre>
  </section>
}
