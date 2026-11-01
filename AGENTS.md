# Agent guidance

## Project overview
Tapes is a camera-recording application with a Go backend in `api/`, a React/TypeScript UI in `ui/`, and Docker-based deployment. Keep changes focused and follow the established package boundaries and project patterns. Prefer documenting current behavior over assuming the older `CLAUDE.md` description is authoritative.

## Comments and documentation
- Comments should explain intent, constraints, non-obvious behavior, or public contracts—not narrate the code or repeat what the next line already says. Remove or update comments when the implementation changes.
- Write comments in clear, grammatical sentences. Use normal capitalization and punctuation; avoid conversational shorthand, stale status notes, decorative checkmarks, and excessive prose.
- In Go, document every exported package-level name with a doc comment that starts with its name (for example, `// GetAll returns ...`). Package comments should describe the package when its purpose is not self-evident.
- Keep implementation comments close to the relevant code. Explain why a choice is necessary, especially around security, concurrency, filesystem behavior, or external-service integration. Do not add comments that merely restate an operation.
- Preserve required compiler directives such as `//go:embed`; they are not prose comments. Keep generated-code markers and build tags in their required forms.
- In TypeScript/JS, add comments only where types and code do not make the intent clear. Keep user-facing documentation and code comments distinct.

## Go conventions
- Follow idiomatic Go and the standard library's conventions. Use `gofmt` (and project checks) for all Go changes; keep imports grouped and let tooling format them.
- Use meaningful names and small, cohesive functions. Return errors to callers when they can handle them; add context with `%w` when wrapping errors. Avoid ignored errors except when intentionally safe and documented.
- Check errors at the operation that produces them. Do not panic for ordinary runtime failures. Keep resource cleanup explicit with `defer` where appropriate.
- Keep APIs and data ownership clear. Avoid unnecessary global state, duplicated logic, and abstractions that do not reduce complexity. Use context cancellation for work that needs to stop with a request or service lifecycle.
- Prefer standard library facilities and established dependencies. Validate and constrain untrusted input, especially paths, identifiers, and request data. Do not expose secrets in responses or logs.
- Preserve existing structured logging via the logger package; use stable, descriptive messages and key/value attributes rather than string interpolation.
- Add or update tests for behavior changes and edge cases. Tests should be deterministic, isolated, and avoid depending on external services unless the repository's integration setup explicitly provides them.

## UI and API changes
- Follow existing React/TypeScript patterns and keep API interactions in the service layer where established. Use the project lint and typecheck scripts for relevant UI changes.
- Keep HTTP handlers focused on request parsing, validation, response status/headers, and delegation to business logic. Return appropriate status codes and avoid leaking internal errors to clients.
- Maintain compatibility between backend JSON/API behavior and UI consumers; update tests and documentation when contracts change.

## Commands and verification
- Go sources are under `api/`; run `gofmt` on changed Go files and test the Go packages through the repository's `factory-test` workflow.
- For UI changes, run the available lint and typecheck scripts in `ui/` through the project's prescribed test workflow.
- Review `git diff` before committing. Do not make generated files or unrelated formatting changes unless required.

## Repository map
- `api/main.go`: HTTP routes and service startup.
- `api/internal/`: authentication, camera discovery, HTTP handlers, logging, media operations, and environment helpers.
- `ui/`: React/TypeScript client.
- `test.sh`, `test/`, and `.factory/`: integration test setup and project test workflow.
- `Dockerfile`, `docker-compose.yml`, `mediamtx.yml`: build and deployment configuration.
