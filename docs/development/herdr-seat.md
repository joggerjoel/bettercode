# Herdr review seat

Build the backend with `npm run build:backend`, then launch the independent review entry:

```sh
BETTERC0DE_HERDR_VIEWER_PORT=VIEWER_PORT \
BETTERC0DE_HERDR_SOCKET_PATH=/absolute/path/to/disposable/daemon.sock \
node scripts/herdr-seat.mjs
```

Use the URL printed by the launcher. The viewer port must be a loopback listener. The socket path is trusted backend launch configuration; the UI cannot choose a socket, URL, tree or command. Omitting the socket keeps acknowledgement unavailable. The launcher creates a temporary backend data directory and cleans it up on exit.

The only mutation exposed through the review proxy is `POST /api/v1/herdr/:unitId/ack`, with a same-origin browser request and exactly `{ "escalation_id": "1", "decision": "approve" }`. Decisions are retry, skip, resolved, approve and stop. The backend re-fetches the selected unit's editor document and requires the escalation to remain open before sending the daemon's four-field ack command. A refusal stays visible beside the open escalation. Success re-fetches authoritative data. A timeout or incomplete reply is uncertain; the client never retries automatically.

For a disposable simulation, run `node scripts/fixtures/herdr-viewer.mjs /tmp/herdr-fixture.json`. Its descriptor gives `port`, `socketPath` and `tree`; use the first two as the launch variables above. It implements a real temporary Unix socket but simulates the daemon: retry/skip/resolved/stop refuse, approve removes the fixture escalation after 500ms. With the launcher running, `node scripts/herdr-seat-ack-smoke.mjs http://127.0.0.1:PORT/herdr.html` checks pending controls, refusal retention, then successful authoritative refresh. Run this smoke only against that disposable fixture; it acknowledges its escalation.

For actual Herdr daemon verification, replace both environment variables with the disposable actual viewer port and daemon socket path. This exercises the same production proxy/backend/socket path. Use a stopped disposable profile with zero workers and no provider credentials, never an operator's active state. The fixture smoke's scripted approval is intended only for the simulation; manually choose an appropriate decision for the actual disposable escalation.
