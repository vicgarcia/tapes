# Build the frontend.
FROM node:20.19.5-slim AS node
WORKDIR /app/ui
COPY ui/package*.json ./
RUN npm ci
COPY ui/ ./
RUN npm run build

# Build the API with the frontend embedded.
FROM golang:1.26.10-bookworm AS golang
WORKDIR /app
COPY api/go.mod api/go.sum ./api/
WORKDIR /app/api
RUN go mod download
COPY api/ ./
COPY --from=node /app/api/dist ./dist
RUN CGO_ENABLED=0 go build -o /tapes .

# Run the application in a minimal Alpine image.
FROM alpine:3.21
RUN apk add --no-cache ca-certificates && adduser -D -u 1000 tapes
COPY --from=golang /tapes /opt/tapes/tapes
USER 1000
EXPOSE 8671
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1:8671/health || exit 1
ENTRYPOINT ["/opt/tapes/tapes"]
