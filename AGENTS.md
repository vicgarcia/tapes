# Agent guidance

## Project overview
Tapes is a camera-recording application with a Go backend in `api/`, a React/TypeScript UI in `ui/`, and Docker-based deployment. Keep changes focused and follow established package boundaries and patterns. Prefer documenting current behavior over assuming the older `CLAUDE.md` description is authoritative.

## Comments and formatting
- Keep comments terse and useful: explain intent, constraints, non-obvious behavior, or public contracts. Do not narrate code or repeat what the code already makes clear.
- Apply the same comment standard to Go, JavaScript, and TypeScript. Write comments in clear, grammatical sentences; avoid shorthand, stale notes, decorative prose, and unnecessary commentary.
- In Go, document exported package-level names with a doc comment beginning with the name (for example, `// GetAll returns ...`). Add package comments when they clarify the package's purpose.
- Keep implementation comments next to the code they explain. Document important reasoning around security, concurrency, filesystem behavior, and external integrations.
- Preserve required directives and markers, including `//go:embed`, build tags, and generated-code markers, in their required form.
- In code and configuration files, group related statements or settings together and use blank lines between distinct logical blocks. Keep configuration comments terse and adjacent to the setting they describe.

## Go conventions
- Follow idiomatic Go and standard-library conventions. Run `gofmt` on changed Go files and keep imports organized: standard-library imports first, external dependencies second, and internal project imports last, with blank lines between groups.
- Use meaningful names and small, cohesive functions. Return errors to callers that can handle them, wrapping with `%w` when adding context. Check errors at the operation that produces them; avoid ignored errors unless intentional and documented.
- Do not panic for ordinary runtime failures. Clean up resources explicitly, using `defer` where appropriate.
- Keep APIs and data ownership clear. Avoid unnecessary global state, duplication, and abstractions that do not reduce complexity. Use context cancellation for work tied to a request or service lifecycle.
- Prefer standard-library facilities and established dependencies. Validate and constrain untrusted input, especially paths, identifiers, and request data. Do not expose secrets in responses or logs.
- Preserve structured logging through the logger package, using stable, descriptive messages and key/value attributes rather than string interpolation.

## JavaScript and TypeScript conventions
- Follow the existing React and TypeScript patterns; use the project's lint and typecheck scripts for relevant changes.
- Prefer explicit types and clear, descriptive names. Keep components and functions focused, use existing service layers for API interactions, and avoid duplicated logic or unnecessary abstractions.
- Handle asynchronous work and errors deliberately. Clean up effects and other resources when their lifecycle ends. Validate untrusted data at appropriate boundaries and do not expose secrets.
- Keep UI behavior accessible and maintain compatibility with backend API and JSON contracts. Update tests and documentation when behavior or contracts change.

## Configuration and deployment
- Keep Dockerfiles, Compose files, MediaMTX settings, environment templates, and other configuration consistent with existing conventions and documented runtime behavior.
- Group related settings into logical blocks separated by blank lines. Use concise comments to explain non-obvious choices; avoid comments that merely restate a setting.
- Avoid committing secrets or machine-specific values. When changing configuration, update relevant templates and documentation together and verify the resulting configuration with available project checks.

## Testing and review
- Add or update tests for behavior changes and edge cases. Keep tests deterministic and isolated; rely on external services only when the repository's integration setup provides them.
- Go sources are under `api/`. Use `factory-test ui`, `factory-test api`, or `factory-test stack` while working, and the full `factory-test` run before pushing. These forward to `./test.sh [ui|api|stack]`; no argument runs everything. Do not run project tests directly outside that workflow.
- Review `git diff` for correctness, scope, formatting, and stale comments before committing. Avoid generated files or unrelated formatting changes unless required.

## Repository map
- `api/main.go`: HTTP routes and service startup.
- `api/internal/`: authentication, camera discovery, HTTP handlers, logging, media operations, and environment helpers.
- `ui/`: React/TypeScript client.
- `test.sh`, `test/`, and `.factory/`: integration test setup and project test workflow.
- `Dockerfile`, `docker-compose.yml`, and `mediamtx.yml`: build and deployment configuration.
