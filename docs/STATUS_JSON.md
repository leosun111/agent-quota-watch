# status.json contract

`quota_bridge.py` expects a JSON document roughly like:

```json
{
  "ts": 1786355040608,
  "agents": [
    {
      "id": "claude",
      "label": "CLAUDE",
      "remain5h": 52,
      "remain7d": 93,
      "resetIn": 8447
    },
    {
      "id": "codex",
      "label": "CODEX",
      "remain5h": null,
      "remain7d": 69,
      "resetIn": 496800
    }
  ],
  "grok": {
    "status": "ok",
    "observedAt": 1786355051928,
    "remain7d": 58,
    "used7d": 42,
    "resetAt": 1786567740000,
    "breakdown": [],
    "extraCredits": { "currency": "USD", "amount": 0 },
    "error": null
  }
}
```

| Field | Meaning |
|-------|---------|
| `remain5h` / `remain7d` | Remaining percent 0–100 |
| `resetIn` | Seconds until reset (used for Claude 5h / Codex weekly when absolute time missing) |
| `grok.resetAt` | Unix ms epoch |
| `grok.status` | `ok` or `error` |

You can point `--status-url` at any HTTP endpoint that returns this shape.
