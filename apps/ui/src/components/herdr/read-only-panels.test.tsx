import { Children, isValidElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { herdrDecisions, type EditorDocument } from "@betterc0de/schema"
import { EscalationCard } from "./escalation-card"
import { HerdrDiffPanel } from "./diff-panel"

const document: EditorDocument = { unit_id: "u", profile: "p", phase: "review", tree: "/tmp/tree", base_sha: null, candidate_commit: null, findings: [], escalations: [] }
function callbacks(node: ReactNode): (() => void)[] {
  return Children.toArray(node).flatMap((child) => {
    if (!isValidElement<{ children?: ReactNode; onClick?: () => void }>(child)) return []
    return [...(child.props.onClick ? [child.props.onClick] : []), ...callbacks(child.props.children)]
  })
}
describe("read-only review panels", () => {
  it("does not start a diff request if either revision is absent", () => {
    const request = vi.spyOn(globalThis, "fetch")
    try {
      for (const revisions of [{ base_sha: null, candidate_commit: null }, { base_sha: "a".repeat(40), candidate_commit: null }, { base_sha: null, candidate_commit: "b".repeat(40) }]) {
        expect(renderToStaticMarkup(<HerdrDiffPanel document={{ ...document, ...revisions }} />)).toContain("No candidate diff")
      }
      expect(request).not.toHaveBeenCalled()
    } finally { request.mockRestore() }
  })
  it("delegates exactly the five decisions to the supplied callback without fetching", () => {
    const onDecide = vi.fn()
    const request = vi.spyOn(globalThis, "fetch")
    try {
      const panel = EscalationCard({ escalations: [{ escalation_id: "e1", kind: "approval", detail: "Review required" }], onDecide })
      const html = renderToStaticMarkup(panel)
      expect(html).toContain("Review required")
      const buttons = callbacks(panel)
      expect(buttons).toHaveLength(5)
      buttons.forEach((click) => click())
      expect(onDecide.mock.calls).toEqual(herdrDecisions.map((decision) => ["e1", decision]))
      expect(request).not.toHaveBeenCalled()
    } finally { request.mockRestore() }
  })
})
