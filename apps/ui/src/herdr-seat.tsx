import { z } from "zod"
import { lazy, Suspense, useEffect, useRef, useState } from "react"
import { herdrEditorDocumentSchema, herdrSnapshotSchema, type EditorDocument, type HerdrDecision } from "@betterc0de/schema"
import { Button } from "@/components/ui/button"
import { HerdrDiffPanel } from "@/components/herdr/diff-panel"
import { HerdrFileTree } from "@/components/herdr/file-tree"
import { FindingsGutter } from "@/components/herdr/findings-gutter"
import { EscalationCard } from "@/components/herdr/escalation-card"
import { useReadResource, unitResource } from "@/components/herdr/read-resource"
const HerdrEditorPanel = lazy(() => import("@/components/herdr/editor-panel").then((module) => ({ default: module.HerdrEditorPanel })))

export function HerdrSeat({ onDecide }: { onDecide?: (escalationId: string, decision: HerdrDecision) => void }) {
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)
  const snapshot = useReadResource(`/api/v1/herdr/snapshot?refresh=${refresh}`, herdrSnapshotSchema)
  const units = snapshot.kind === "ready" ? snapshot.value.units : null
  useEffect(() => {
    if (units && (!selectedUnit || !units.some((unit) => unit.unit_id === selectedUnit))) setSelectedUnit(units[0]?.unit_id ?? null)
  }, [units, selectedUnit])
  return <main className="min-h-screen bg-background text-foreground">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-6 py-4">
      <div><h1 className="text-lg font-semibold">BetterC0de <span className="text-muted-foreground">/ Herdr review</span></h1><p className="text-sm text-muted-foreground">Inspect units, findings and candidate changes</p></div>
      <Button variant="outline" onClick={() => setRefresh((value) => value + 1)}>Refresh</Button>
    </header>
    <div className="grid min-h-[calc(100vh-85px)] md:grid-cols-[220px_minmax(0,1fr)]">
      <nav aria-label="Units" className="border-b border-border p-4 md:border-r md:border-b-0">
        <h2 className="mb-3 font-semibold">Units</h2>
        {snapshot.kind === "loading" && <p role="status" className="text-sm">Loading units…</p>}
        {snapshot.kind === "error" && <p role="alert" className="text-sm text-destructive">{snapshot.message}</p>}
        {units?.length === 0 && <p className="text-sm text-muted-foreground">No units available</p>}
        <ul className="space-y-2">{units?.map((unit) => <li key={unit.unit_id}><Button variant={selectedUnit === unit.unit_id ? "secondary" : "ghost"} aria-pressed={selectedUnit === unit.unit_id} className="h-auto w-full flex-col items-start whitespace-normal break-all py-2 text-left" onClick={() => setSelectedUnit(unit.unit_id)}>{unit.unit_id}<span className="text-xs text-muted-foreground">{unit.phase}</span></Button></li>)}</ul>
      </nav>
      {selectedUnit && units?.some((unit) => unit.unit_id === selectedUnit) ? <SelectedUnit key={`${selectedUnit}:${refresh}`} unitId={selectedUnit} onDecide={onDecide} /> : <p className="p-6 text-sm text-muted-foreground">Select a unit to review</p>}
    </div>
  </main>
}
function SelectedUnit({ unitId, onDecide }: { unitId: string; onDecide?: (id: string, decision: HerdrDecision) => void }) {
  const [revision, setRevision] = useState(0)
  const document = useReadResource(`${unitResource(unitId, "editor")}&revision=${revision}`, herdrEditorDocumentSchema)
  if (document.kind === "loading") return <p role="status" className="p-6">Loading unit…</p>
  if (document.kind === "error") return <p role="alert" className="p-6 text-destructive">{document.message}</p>
  if (document.value.unit_id !== unitId) return <p role="alert" className="p-6 text-destructive">The selected unit changed. Refresh to continue.</p>
  return <UnitReview key={revision} document={document.value} onDecide={onDecide} onRefresh={() => setRevision((value) => value + 1)} />
}
function UnitReview({ document, onDecide, onRefresh }: { document: EditorDocument; onDecide?: (id: string, decision: HerdrDecision) => void; onRefresh: () => void }) {
  const [file, setFile] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const active = useRef(true)
  const sending = useRef(false)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  async function decide(id: string, decision: HerdrDecision) {
    if (sending.current) return
    if (onDecide) { onDecide(id, decision); return }
    sending.current = true
    setPending(true)
    setNotice(null)
    try {
      const response = await fetch(unitResource(document.unit_id, "ack"), {
        method: "POST", headers: { "Content-Type": "application/json" }, redirect: "error",
        body: JSON.stringify({ escalation_id: id, decision }), signal: AbortSignal.timeout(10000),
      })
      const result = z.object({ ok: z.boolean().optional(), message: z.string().optional(), error: z.string().optional() }).parse(await response.json())
      if (!response.ok || result.ok !== true) throw new Error(result.message ?? result.error ?? "Daemon refused acknowledgement")
      if (active.current) onRefresh()
    } catch (error) {
      if (active.current) setNotice(error instanceof Error ? error.message : "Acknowledgement outcome is uncertain. Refresh before deciding again.")
    } finally {
      sending.current = false
      if (active.current) setPending(false)
    }
  }
  return <section className="min-w-0">
    <div className="border-b border-border px-6 py-3"><h2 className="font-semibold">{document.unit_id}</h2><p className="text-sm text-muted-foreground">{document.profile} · {document.phase}</p></div>
    <div className="grid min-w-0 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0"><div className="grid min-w-0 lg:grid-cols-[220px_minmax(0,1fr)]">
        <HerdrFileTree document={document} onOpen={setFile} />
        <div className="min-w-0 border-b border-border lg:border-l">{file ? <Suspense fallback={<p role="status" className="p-4">Loading editor…</p>}><HerdrEditorPanel key={file} document={document} path={file} /></Suspense> : <p className="p-6 text-sm text-muted-foreground">Choose a file to inspect</p>}</div>
      </div><HerdrDiffPanel document={document} /></div>
      <aside className="space-y-8 border-t border-border p-5 xl:border-t-0 xl:border-l">
        <FindingsGutter findings={document.findings} />
        <EscalationCard escalations={document.escalations} pending={pending} onDecide={(id, decision) => { void decide(id, decision) }} />
        {pending && <p role="status" className="text-sm text-muted-foreground">Sending decision…</p>}
        {notice && <p role="alert" className="text-sm text-muted-foreground">{notice}</p>}
      </aside>
    </div>
  </section>
}
