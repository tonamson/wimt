# Headroom proxy — install latest from PyPI on each (cache-busted) build.
# Docs: https://headroom-docs.vercel.app/docs/proxy#docker
FROM python:3.11-slim

WORKDIR /app

# build-essential required at install time (hnswlib C++ extension); removed after.
RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential \
  && rm -rf /var/lib/apt/lists/*

# Bump HEADROOM_CACHEBUST (or pass a timestamp) to invalidate this layer and
# reinstall the newest headroom-ai from PyPI.
ARG HEADROOM_CACHEBUST=0
ARG HEADROOM_VERSION=

RUN echo "headroom cachebust=${HEADROOM_CACHEBUST} version=${HEADROOM_VERSION:-latest}" \
  && if [ -n "$HEADROOM_VERSION" ]; then \
       pip install --no-cache-dir "headroom-ai[proxy]==${HEADROOM_VERSION}"; \
     else \
       pip install --no-cache-dir --upgrade "headroom-ai[proxy]"; \
     fi \
  && apt-get purge -y build-essential \
  && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/*

EXPOSE 8787

# Default; docker-compose overrides with full CLI flags.
CMD ["headroom", "proxy", "--host", "0.0.0.0", "--port", "8787"]
