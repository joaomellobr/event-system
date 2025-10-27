# Quick Load Test for `/addEvent` (Circuit Breaker + Retry)

This short guide runs a burst of POST requests against `/addEvent` to exercise the **Circuit Breaker**, **retry with exponential backoff**, and **fail‑fast** behavior when the external service (`event.com`) becomes unstable.

## Prerequisites

- API and mock are running locally on port **3000**
- `curl` is available in your shell (Linux/macOS), or use the PowerShell version below on Windows

## Run (Linux/macOS – Bash/Zsh)

```bash
for i in $(seq 1 12); do
  curl -s -XPOST http://localhost:3000/addEvent     -H 'content-type: application/json'     -d '{"name":"hello","userId":"1"}'
  echo
done
```

### What this does

- Fires **12** POST requests to `/addEvent` back‑to‑back
- Sends the JSON payload `{"name":"hello","userId":"1"}`
- Prints each response on its own line (the `echo` just adds a newline)

## What to expect

The external mock accepts a few requests and then **returns 5xx** for a period (simulates overload). You should observe three phases:

1. **Success (CLOSED)** – while the mock still accepts requests
   ```json
   {"success": true}
   ```

2. **Transient failure with internal retries (still CLOSED)**
   The server attempts a few retries with exponential backoff, then gives up:
   ```json
   {"success": false, "error": "Upstream unavailable", "reason": "retry_exhausted"}
   ```

3. **Fail‑fast (OPEN)**
   After repeated failures within the configured window (e.g., 3 within 30s), the Circuit Breaker **opens**. The server stops calling the external service and immediately returns **503** with a `Retry-After` hint:
   ```json
   {"success": false, "error": "Service temporarily unavailable", "reason": "circuit_open", "retryAfter": 12}
   ```

4. **Recovery probe (HALF_OPEN)**
   When the cooldown elapses, the server allows a **single probe** request:
   - If it **succeeds**, the breaker **closes** and normal operation resumes.
   - If it **fails**, the breaker **reopens** with a longer cooldown (exponential backoff + jitter).

## Repeat or tweak the test

- Wait for `Retry-After` seconds and rerun the loop to witness **HALF_OPEN → CLOSED** or **HALF_OPEN → OPEN**.
- Increase iterations to generate more pressure:
  ```bash
  for i in $(seq 1 20); do ...; done
  ```
- Try a different user id:
  ```bash
  -d '{"name":"hello","userId":"3"}'
  ```

## Diagnostics & tips

- **Status codes only (no body):**
  ```bash
  for i in $(seq 1 12); do
    curl -s -o /dev/null -w "%{http_code}\n" -XPOST http://localhost:3000/addEvent       -H 'content-type: application/json'       -d '{"name":"hello","userId":"1"}'
  done
  ```

- **Measure latency (rough, single call):**
  ```bash
  time curl -s -XPOST http://localhost:3000/addEvent     -H 'content-type: application/json'     -d '{"name":"hello","userId":"1"}' > /dev/null
  ```

- **Seeing `circuit_open` immediately?**
  The mock was likely already in a failure phase. Wait for `Retry-After` seconds and run again to observe the **probe** and recovery.

## Windows (PowerShell)

```powershell
1..12 | ForEach-Object {
  curl.exe -s -X POST "http://localhost:3000/addEvent" `
    -H "content-type: application/json" `
    -d '{"name":"hello","userId":"1"}'
  Write-Host ""
}
```

## Why this test matters

- Proves the API **does not degrade** under downstream failures: it **fails fast**, is predictable, and informs clients when to retry.
- Demonstrates **retry with exponential backoff + jitter**, reducing load on the external dependency.
- Exercises the full Circuit Breaker lifecycle: **CLOSED → OPEN → HALF_OPEN → (CLOSED/OPEN)**.
