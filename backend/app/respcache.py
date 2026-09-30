"""Read-only responses cached per state version.

Every GET answer (alerts, scores, transfers, requests...) is a pure function of the loaded data and the in-memory
state. The state bumps a version on each change (a count, an approval, a delivery, a scenario), so an answer is reused
until something actually changes, instead of re-applying counts and re-encoding whole tables on every request.
Gemini routes (/ai/) keep their own caches and are never cached here."""
import collections
import threading

SKIP_PREFIXES = ("/ai/", "/federated/run", "/health")
MAX_ENTRIES = 600
MAX_BODY = 4_000_000


class ResponseCache:
    def __init__(self, app, version):
        self.app, self.version = app, version  # version: () -> int
        self.cache: "collections.OrderedDict[tuple, tuple]" = collections.OrderedDict()
        self.lock = threading.Lock()
        self.hits = self.misses = 0

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope.get("method") != "GET" or scope.get("path", "").startswith(SKIP_PREFIXES):
            return await self.app(scope, receive, send)
        key = (scope["path"], scope.get("query_string", b""), self.version())
        with self.lock:
            hit = self.cache.get(key)
            if hit:
                self.cache.move_to_end(key)
        if hit:
            self.hits += 1
            status, headers, body = hit
            await send({"type": "http.response.start", "status": status, "headers": headers + [(b"content-length", str(len(body)).encode()), (b"x-cache", b"hit")]})
            await send({"type": "http.response.body", "body": body, "more_body": False})
            return
        self.misses += 1
        start, chunks = {}, []

        async def capture(message):
            if message["type"] == "http.response.start":
                start.update(message)
            elif message["type"] == "http.response.body":
                chunks.append(message.get("body", b""))
            await send(message)

        await self.app(scope, receive, capture)
        body = b"".join(chunks)
        ctype = dict(start.get("headers", [])).get(b"content-type", b"")
        # a page still waiting on a background computation must be fetched again, not remembered
        if start.get("status") == 200 and ctype.startswith(b"application/json") and len(body) <= MAX_BODY and b'"rank_pending":true' not in body.replace(b" ", b""):
            with self.lock:
                self.cache[key] = (200, [h for h in start.get("headers", []) if h[0].lower() not in (b"content-length", b"content-encoding", b"vary")], body)
                while len(self.cache) > MAX_ENTRIES:
                    self.cache.popitem(last=False)
