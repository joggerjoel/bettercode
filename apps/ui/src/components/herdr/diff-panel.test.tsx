import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import type { EditorDocument } from "@betterc0de/schema"
import { HerdrDiffPanel } from "./diff-panel"
import { useReadResource } from "./read-resource"

vi.mock("./read-resource", async (original) => ({ ...await original<typeof import("./read-resource")>(), useReadResource: vi.fn(() => ({ kind: "loading" })) }))
const document: EditorDocument = { unit_id: "u", profile: "p", phase: "review", tree: "/tmp/tree", base_sha: "a".repeat(40), candidate_commit: "b".repeat(40), findings: [], escalations: [] }
describe("candidate diff identity", () => {
  it("requests the displayed pair and changes its resource on either revision", () => {
    const urls = []
    for (const revisions of [{}, { candidate_commit: "c".repeat(40) }, { base_sha: "d".repeat(40) }]) {
      const displayed = { ...document, ...revisions }
      renderToStaticMarkup(<HerdrDiffPanel document={displayed} />)
      const url = vi.mocked(useReadResource).mock.lastCall?.[0]
      expect(url).toBeDefined()
      const parsed = new URL(url ?? "", "http://localhost")
      expect(parsed.searchParams.get("tree")).toBe(displayed.tree)
      expect(parsed.searchParams.get("base_sha")).toBe(displayed.base_sha)
      expect(parsed.searchParams.get("candidate_commit")).toBe(displayed.candidate_commit)
      urls.push(url)
    }
    expect(new Set(urls).size).toBe(3)
  })
})
