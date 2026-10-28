import { herdrDecisions, type EditorDocument, type HerdrDecision } from "@betterc0de/schema"
import { Button } from "@/components/ui/button"

export function EscalationCard({ escalations, onDecide }: Pick<EditorDocument, "escalations"> & {
  onDecide: (escalationId: string, decision: HerdrDecision) => void
}) {
  return <section aria-label="Escalations" className="space-y-4">
    <h2 className="font-semibold">Escalations <span className="text-muted-foreground">{escalations.length}</span></h2>
    {escalations.length === 0 && <p className="text-sm text-muted-foreground">No escalations</p>}
    {escalations.map((escalation) => <article key={escalation.escalation_id} className="space-y-2 border-t border-border pt-3">
      <h3 className="font-medium">{escalation.kind}</h3>
      <p className="whitespace-pre-wrap break-words text-sm">{escalation.detail}</p>
      <div className="flex flex-wrap gap-2">{herdrDecisions.map((decision) =>
        <Button key={decision} variant="outline" size="sm" onClick={() => onDecide(escalation.escalation_id, decision)}>{decision}</Button>,
      )}</div>
    </article>)}
  </section>
}
