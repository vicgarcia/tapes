# build
FROM gocv/opencv:4.12.0 AS builder

# install node.js
RUN apt-get update && \
    apt-get install -y curl && \
    curl -sL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs

# build react frontend
WORKDIR /app/ui
COPY ui/package*.json ./
RUN npm ci --only=production
COPY ui ./
RUN npm run build

# build go backend
WORKDIR /app/api
COPY api/go.mod api/go.sum ./
RUN go mod download
COPY api ./
RUN CGO_ENABLED=1 go build -o tapes .


# deploy
FROM gocv/opencv:4.12.0 AS deploy

# install minimal runtime dependencies
RUN apt-get update && \
    apt-get install -y \
        ca-certificates \
        ffmpeg \
        && rm -rf /var/lib/apt/lists/*

# copy opencv libraries from builder
COPY --from=builder /usr/local/lib/libopencv* /usr/local/lib/
COPY --from=builder /usr/local/lib/pkgconfig/opencv4.pc /usr/local/lib/pkgconfig/
RUN ldconfig

# create app user and directories
RUN useradd -r -s /bin/false tapes && \
    mkdir -p /opt/tapes /data/cameras && \
    chown -R tapes:tapes /opt/tapes /data/cameras

# copy built application
COPY --from=builder /app/api/tapes /opt/tapes/

# switch to app user
# USER tapes
WORKDIR /opt/tapes

EXPOSE 8080

CMD ["./tapes"]
