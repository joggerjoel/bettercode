import "@/lib/monaco-setup"
import Editor from "@monaco-editor/react"
import { herdrFileSchema, type EditorDocument } from "@betterc0de/schema"
import { useReadResource, unitResource } from "./read-resource"

export function HerdrEditorPanel({ document, path }: { document: EditorDocument; path: string }) {
  const file = useReadResource(unitResource(document.unit_id, "file", document.tree, path), herdrFileSchema)
  if (file.kind === "loading") return <p role="status" className="p-4 text-sm">Loading file…</p>
  if (file.kind === "error") return <p role="alert" className="p-4 text-sm text-destructive">{file.message}</p>
  return <section aria-label="File preview" className="min-w-0">
    <h2 className="border-b border-border px-4 py-2 text-sm break-all">{path}</h2>
    <Editor height="440px" path={`${document.tree}/${path}`} value={file.value.content} theme="vs-dark"
      options={{ readOnly: true, domReadOnly: true, contextmenu: false, minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, automaticLayout: true }} />
  </section>
}
