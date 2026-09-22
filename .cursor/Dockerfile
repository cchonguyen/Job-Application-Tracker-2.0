FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
        unzip \
    && rm -rf /var/lib/apt/lists/*

# Install Bun system-wide (the project is Bun-managed: bun.lock, bun run dev/build/test).
ENV BUN_INSTALL=/usr/local
RUN curl -fsSL https://bun.sh/install | bash \
    && bun --version

# Match Cloud Agent conventions with a non-root ubuntu user.
RUN useradd --create-home --shell /bin/bash ubuntu
USER ubuntu
