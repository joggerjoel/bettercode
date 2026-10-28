import { useState } from "react"
import { herdrTreeSchema, type EditorDocument } from "@betterc0de/schema"
import { Button } from "@/components/ui/button"
import { useReadResource, unitResource } from "./read-resource"

export function HerdrFileTree({ document, onOpen }: { document: EditorDocument; onOpen: (path: string) => void }) {
  const [directory, setDirectory] = useState("")
  const tree = useReadResource(unitResource(document.unit_id, "tree", document.tree, directory), herdrTreeSchema)
  return <nav aria-label="Workspace files" className="min-w-0 p-4">
    <h2 className="font-semibold">Files</h2>
    <p className="my-3 break-all text-xs text-muted-foreground">{document.tree}</p>
    {directory && <Button variant="ghost" size="sm" onClick={() => setDirectory(directory.split("/").slice(0, -1).join("/"))}>← Parent folder</Button>}
    {tree.kind === "loading" && <p role="status" className="text-sm">Loading files…</p>}
    {tree.kind === "error" && <p role="alert" className="text-sm text-destructive">{tree.message}</p>}
    {tree.kind === "ready" && <>
      <ul className="space-y-1">{tree.value.entries.map((entry) => <li key={entry.path}>
        <Button variant="ghost" className="h-auto min-h-9 w-full justify-start whitespace-normal break-all text-left" onClick={() => entry.directory ? setDirectory(entry.path) : onOpen(entry.path)}>{entry.directory ? "▸ " : ""}{entry.name}</Button>
      </li>)}</ul>
      {tree.value.entries.length === 0 && <p className="text-sm text-muted-foreground">Empty folder</p>}
      {tree.value.truncated && <p role="status" className="text-sm text-warning">File listing truncated</p>}
    </>}
  </nav>
}
