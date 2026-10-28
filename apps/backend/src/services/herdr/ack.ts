import { randomUUID } from "node:crypto"
import net from "node:net"
import { z } from "zod"
import { herdrDecisions } from "@betterc0de/schema"

export const ackDecisionSchema = z.enum(herdrDecisions)
export const escalationIdSchema = z.string().regex(/^\d+$/).refine((id) => Number.isSafeInteger(Number(id)), "Escalation ID must be a base-10 safe integer")
const replySchema = z.union([
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), message: z.string().optional(), error: z.object({ message: z.string() }).optional() }),
])
export type AckResult = { ok: true } | { ok: false; message: string }

export async function postAck(socketPath: string, escalationId: string, decision: string): Promise<AckResult> {
  const id = escalationIdSchema.parse(escalationId)
  const validatedDecision = ackDecisionSchema.parse(decision)
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath)
    let reply = ""
    let settled = false
    const timer = setTimeout(() => finish(new Error("Daemon reply timed out; outcome is uncertain. Refresh before deciding again.")), 5000)
    function finish(error?: Error, result?: AckResult) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.destroy()
      if (error) reject(error)
      else if (result) resolve(result)
    }
    socket.once("connect", () => socket.write(JSON.stringify({ cmd: "ack", op_id: randomUUID(), escalation_id: Number(id), decision: validatedDecision }) + "\n"))
    socket.on("data", (chunk: Buffer) => {
      if (Buffer.byteLength(reply) + chunk.length > 65536) return finish(new Error("Daemon reply exceeded limit; outcome is uncertain"))
      reply += chunk.toString("utf8")
      const newline = reply.indexOf("\n")
      if (newline < 0) return
      try {
        const parsed = replySchema.parse(JSON.parse(reply.slice(0, newline)))
        finish(undefined, parsed.ok ? { ok: true } : { ok: false, message: parsed.error?.message ?? parsed.message ?? "Daemon refused acknowledgement" })
      } catch { finish(new Error("Invalid daemon reply; outcome is uncertain. Refresh before deciding again.")) }
    })
    socket.once("error", (error) => finish(new Error(`Daemon connection failed: ${error.message}; outcome may be uncertain`)))
    socket.once("close", () => finish(new Error("Daemon closed without a complete reply; outcome is uncertain")))
  })
}
