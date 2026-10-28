/** Run against scripts/fixtures/herdr-viewer.mjs + herdr-seat.mjs only. */
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
const url = new URL(process.argv[2])
assert.equal(url.hostname, "127.0.0.1")
assert.equal(url.pathname, "/herdr.html")
const session = `herdr-ack-smoke-${process.pid}`
function browser(...args) { return execFileSync("agent-browser", ["--session", session, ...args], { encoding: "utf8", timeout: 30000 }).trim() }
try {
  browser("open", url.href)
  browser("wait", "--text", "Inspect the null handling before continuing.")
  assert.match(browser("eval", "document.body.innerText"), /fixture/)
  const pending = browser("eval", `(async () => {
    const buttons = [...document.querySelectorAll('button')];
    buttons.find(b => b.textContent === 'retry').click();
    await new Promise(r => setTimeout(r, 20));
    return buttons.filter(b => ['retry','skip','resolved','approve','stop'].includes(b.textContent)).every(b => b.disabled);
  })()`)
  assert.equal(pending, "true", "all decision buttons disabled while awaiting daemon")
  browser("wait", "--text", "Fixture refusal: approval required")
  assert.match(browser("eval", "document.body.innerText"), /Inspect the null handling before continuing/)
  browser("eval", "[...document.querySelectorAll('button')].find(b => b.textContent === 'approve').click()")
  browser("wait", "--text", "No escalations")
  assert.doesNotMatch(browser("eval", "document.body.innerText"), /Inspect the null handling before continuing/)
  console.info("PASS: pending disabled, nested refusal retained escalation, success refreshed authority")
} finally { browser("close") }
