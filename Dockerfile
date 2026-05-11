FROM denoland/deno:2.3.3

RUN apt-get update && apt-get install -y --no-install-recommends libsqlite3-dev && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY deno.json .
COPY deno-backend/ deno-backend/
RUN deno cache deno-backend/main.ts

COPY . .

# Use the system sqlite3 library to avoid a runtime download from GitHub on every start
ENV DENO_SQLITE_PATH=/usr/lib/x86_64-linux-gnu/libsqlite3.so.0

# Redirect stderr → stdout so Railway captures startup errors in logs
CMD ["sh", "-c", "deno run --allow-net --allow-read --allow-write --allow-env --allow-ffi deno-backend/main.ts 2>&1"]
