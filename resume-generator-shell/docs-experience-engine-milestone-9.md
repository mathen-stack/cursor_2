# Experience Engine Milestone 9

Milestone 9 integrates the completed Experience Engine into the full web
project as a production-shaped service.

## Added

- Provider-neutral production composition root
- Offline rule-based provider as the safe default
- Optional OpenAI-compatible structured-output adapter
- Timeouts, retry handling, strict JSON-schema requests, and provider errors
- Generation service with created, running, completed, rejected, and failed states
- In-memory and atomic JSON-file generation-history stores
- Per-run telemetry for duration, role count, bullet count, approval count, and regeneration attempts
- Structured logging without API-key or secret persistence
- API routes for generation, history, run lookup, and health
- Interactive Experience Engine preview UI
- Production integration, persistence, provider, and cross-JD isolation tests

## API

### Generate

`POST /api/experience/generate`

```json
{
  "profileId": "PROFILE-001",
  "jobDescriptionText": "...",
  "careerHistory": [
    {
      "experienceId": "EXP-001",
      "companyName": "Example Company",
      "startDate": "2022-01",
      "endDate": "Present"
    }
  ],
  "locale": "en-US"
}
```

### History

- `GET /api/experience/runs?limit=20`
- `GET /api/experience/runs/{generationId}`
- `GET /api/health`

## Isolation

Every request creates a fresh immutable JD and generation context. Store keys,
engine execution, telemetry, output, and history are scoped to the unique
`generationId`, `jdId`, and `jdHash`. API keys are never included in generation
records or logs.

## Provider configuration

The default `rule-based` mode runs without external network access. The optional
`openai-compatible` mode sends a strict JSON-schema chat-completions request to
the configured server. It is suitable for OpenAI-compatible providers that
support `response_format.type = json_schema`.
