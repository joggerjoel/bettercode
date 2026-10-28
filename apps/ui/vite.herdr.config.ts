import path from "node:path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  root: __dirname,
  base: "./",
  plugins: [react(), tailwindcss(), {
    name: "verify-independent-herdr-seat",
    generateBundle() {
      const modules = Array.from(this.getModuleIds()).filter((id) => !id.includes("node_modules")).sort()
      const forbidden = modules.filter((id) => /\/(App\.tsx|use-app-shell-bundles\.ts|chat-store\.ts|chatApi\.ts)$/.test(id))
      if (forbidden.length) this.error(`Herdr seat imports chat shell: ${forbidden.join(", ")}`)
      this.emitFile({ type: "asset", fileName: "herdr-import-graph.json", source: JSON.stringify(modules, null, 2) })
    },
  }],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  optimizeDeps: { entries: ["herdr.html"], include: ["monaco-editor"] },
  worker: { format: "es" },
  build: { target: "esnext", outDir: "dist-herdr", rollupOptions: { input: path.resolve(__dirname, "herdr.html") } },
  server: { host: "127.0.0.1" },
})
