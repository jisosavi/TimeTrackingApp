FROM denoland/deno:2.3.3

RUN apt-get update && apt-get install -y --no-install-recommends libsqlite3-dev && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY deno.json .
COPY deno-backend/ deno-backend/
RUN deno cache deno-backend/main.ts

COPY . .

CMD ["deno", "run", "--allow-net", "--allow-read", "--allow-write", "--allow-env", "--allow-ffi", "deno-backend/main.ts"]
