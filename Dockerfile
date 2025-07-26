# build stage
FROM debian:bookworm-slim AS builder

# install build dependencies
RUN apt-get clean && apt-get update && \
    apt-get install -y curl software-properties-common cmake g++ wget unzip git sudo ca-certificates && \
    apt-get upgrade -y

# install node.js
RUN curl -sL https://deb.nodesource.com/setup_23.x | bash - && \
    apt-get update && \
    apt-get install -y nodejs

# install go
RUN add-apt-repository 'deb http://deb.debian.org/debian bookworm-backports main' && \
    apt-get update && \
    apt-get install -y golang-1.22 && \
    ln -s /usr/lib/go-1.22/bin/* /usr/local/bin/

# install opencv and gocv
WORKDIR /gocv
RUN git clone https://github.com/hybridgroup/gocv.git . && \
    make install

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
RUN CGO_ENABLED=1 GOOS=linux go build -a -ldflags '-linkmode external -extldflags "-static"' -o tapes .


# deploy stage
FROM debian:bookworm-slim

# install runtime dependencies for opencv and media processing
RUN apt-get update && \
    apt-get install -y \
        ca-certificates \
        libopencv-dev \
        libopencv-contrib-dev \
        ffmpeg \
        && rm -rf /var/lib/apt/lists/*

# create app user
RUN useradd -r -s /bin/false tapes

# create necessary directories
RUN mkdir -p /opt/tapes /data/cameras && \
    chown -R tapes:tapes /opt/tapes /data/cameras

# copy built application
COPY --from=builder /app/api/tapes /opt/tapes/
# COPY --from=builder /app/ui/dist /opt/tapes/ui/dist

# copy .env file if it exists
COPY .env* /opt/tapes/

# switch to app user
USER tapes

WORKDIR /opt/tapes

EXPOSE 8633

CMD ["./tapes"]
