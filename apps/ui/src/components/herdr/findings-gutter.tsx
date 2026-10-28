import type { EditorDocument } from "@betterc0de/schema"

export function FindingsGutter({ findings }: Pick<EditorDocument, "findings">) {
  return <section aria-label="Findings" className="space-y-4">
    <h2 className="font-semibold">Findings <span className="text-muted-foreground">{findings.length}</span></h2>
    {findings.length === 0 && <p className="text-sm text-muted-foreground">No findings</p>}
    {findings.map((finding) => <article key={finding.finding_id} className="border-l-2 border-border pl-3">
      <h3 className={finding.severity === "blocking" ? "font-medium text-destructive" : "font-medium text-warning"}>{finding.severity === "blocking" ? "Blocking" : "Warning"}</h3>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm">{finding.issue}</p>
      <p className="mt-1 text-xs text-muted-foreground">{finding.verification}</p>
    </article>)}
  </section>
}
