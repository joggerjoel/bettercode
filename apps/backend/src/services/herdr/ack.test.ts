import net from "node:net"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { postAck } from "./ack"

describe("postAck", () => {
  it("does not mistake accepted writes or an early close for delivery and never retries", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "ack-close-"))
    const socketPath = path.join(dir, "s")
    let connections = 0
    const server = net.createServer((socket) => { connections++; socket.once("data", () => socket.end()) })
    await new Promise<void>((resolve) => server.listen(socketPath, resolve))
    try {
      await expect(postAck(socketPath, "1", "resolved")).rejects.toThrow(/without a complete reply/)
      expect(connections).toBe(1)
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
      await rm(dir, { recursive: true, force: true })
    }
  })
  it("bounds a silent reply and never retries an uncertain operation", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "ack-timeout-"))
    const socketPath = path.join(dir, "s")
    let connections = 0
    const server = net.createServer((socket) => { connections++; socket.resume() })
    await new Promise<void>((resolve) => server.listen(socketPath, resolve))
    try {
      await expect(postAck(socketPath, "1", "retry")).rejects.toThrow(/timed out.*uncertain/)
      expect(connections).toBe(1)
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
      await rm(dir, { recursive: true, force: true })
    }
  }, 10000)
  it("writes exactly one daemon command and preserves success and refusals", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "ack-"))
    const socketPath = path.join(dir, "s")
    const commands: unknown[] = []
    let reply: unknown = { ok: true }
    const server = net.createServer((socket) => socket.once("data", (data) => {
      commands.push(JSON.parse(data.toString()))
      socket.end(JSON.stringify(reply) + "\n")
    }))
    await new Promise<void>((resolve) => server.listen(socketPath, resolve))
    try {
      expect(await postAck(socketPath, "12", "approve")).toEqual({ ok: true })
      expect(commands).toEqual([{ cmd: "ack", op_id: expect.any(String), escalation_id: 12, decision: "approve" }])
      for (const decision of ["merge", "", "APPROVE"]) await expect(postAck(socketPath, "12", decision)).rejects.toThrow()
      for (const id of ["1.2", "1e2", "0x10", "9007199254740992", "-1"]) await expect(postAck(socketPath, id, "retry")).rejects.toThrow()
      expect(commands).toHaveLength(1)
      reply = { ok: false, message: "refused" }
      expect(await postAck(socketPath, "12", "stop")).toEqual({ ok: false, message: "refused" })
      reply = { ok: false, error: { message: "Still running", code: "busy" } }
      expect(await postAck(socketPath, "12", "retry")).toEqual({ ok: false, message: "Still running" })
      reply = { ok: "true" }
      await expect(postAck(socketPath, "12", "skip")).rejects.toThrow(/reply/)
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
      await rm(dir, { recursive: true, force: true })
    }
  })
})
