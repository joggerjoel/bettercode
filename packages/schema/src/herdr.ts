import { z } from "zod"

const revision = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/).nullable()
export const herdrFindingSchema = z.strictObject({
  finding_id: z.string(), severity: z.enum(["blocking", "warning"]),
  verification: z.enum(["test", "path_exists", "path_changed", "absence", "judgment"]), issue: z.string(),
})
export const herdrEscalationSchema = z.strictObject({ escalation_id: z.string(), kind: z.string(), detail: z.string() })
export const herdrEditorDocumentSchema = z.strictObject({
  unit_id: z.string().min(1), profile: z.string(), phase: z.string(), tree: z.string().min(1),
  candidate_commit: revision, base_sha: revision,
  findings: z.array(herdrFindingSchema), escalations: z.array(herdrEscalationSchema),
})
export const herdrSnapshotSchema = z.object({ units: z.array(z.object({ unit_id: z.string().min(1), phase: z.string() })) })
export const herdrTreeSchema = z.strictObject({ tree: z.string(), entries: z.array(z.strictObject({ name: z.string(), path: z.string(), directory: z.boolean() })), truncated: z.boolean() })
export const herdrFileSchema = z.strictObject({ path: z.string(), content: z.string() })
export const herdrDiffSchema = z.union([
  z.strictObject({ kind: z.literal("none") }),
  z.strictObject({ kind: z.literal("diff"), diff: z.string(), truncated: z.boolean(), totalBytes: z.number() }),
])
export const herdrDecisions = ["retry", "skip", "resolved", "approve", "stop"] as const
export type HerdrDecision = typeof herdrDecisions[number]
export type EditorDocument = z.infer<typeof herdrEditorDocumentSchema>
export type HerdrSnapshot = z.infer<typeof herdrSnapshotSchema>
export type HerdrTree = z.infer<typeof herdrTreeSchema>
export type HerdrDiff = z.infer<typeof herdrDiffSchema>
