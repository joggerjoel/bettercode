import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { FindingsGutter } from "./findings-gutter"

describe("FindingsGutter", () => {
  it("shows severity and the finding without prompt controls", () => {
    const html = renderToStaticMarkup(<FindingsGutter findings={[
      { finding_id: "f1", severity: "blocking", verification: "test", issue: "Fix the null check." },
    ]} />)
    expect(html).toMatch(/<h[1-6][^>]*>Blocking<\/h[1-6]>/)
    expect(html).toContain("Fix the null check.")
    for (const label of ["Fix this", "Send", "Paste"]) {
      expect(html).not.toMatch(new RegExp(`<button[^>]*>.*${label}`))
    }
  })
})
