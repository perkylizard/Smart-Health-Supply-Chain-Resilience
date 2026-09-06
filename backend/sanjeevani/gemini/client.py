"""Thin Gemini client: structured JSON output, media parts, backoff, and record/replay cassettes for tests.

Modes (env GEMINI_MODE or constructor): "replay" (default; never calls the API, needs a cassette),
"live" (calls the API; writes a cassette when a case name is given), "record" (alias of live that always writes)."""
import hashlib
import json
import os
import time
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from sanjeevani import paths
from sanjeevani.gemini.prompts import SYSTEM

CASSETTES = paths.ROOT / "backend" / "tests" / "cassettes"
DEFAULT_MODEL = "gemini-3.5-flash-lite"
# Free-tier limits are per model per minute; spread services across models and pace each one.
# Only models confirmed available to new free-tier accounts (2.5-series models are retired for new users).
SERVICE_MODEL = {"briefing": "gemini-3.5-flash-lite", "explain": "gemini-3.1-flash-lite", "ask_guided": "gemini-3.1-flash-lite",
                 "ask_sql": "gemini-3.5-flash-lite", "register": "gemini-3.5-flash", "voice": "gemini-3.5-flash", "brief": "gemini-3.1-flash-lite"}
MAX_RPM = int(os.environ.get("GEMINI_MAX_RPM", "12"))


class _Pacer:
    """Per-model sliding window: blocks so that no model sees more than MAX_RPM requests in any 60 s."""
    def __init__(self):
        import collections, threading
        self.hist = collections.defaultdict(collections.deque); self.lock = threading.Lock()

    def wait(self, model: str):
        while True:
            with self.lock:
                q = self.hist[model]; now = time.time()
                while q and now - q[0] > 60:
                    q.popleft()
                if len(q) < MAX_RPM:
                    q.append(now); return
                sleep_for = 60 - (now - q[0]) + 0.05
            time.sleep(min(max(sleep_for, 0.1), 61))


PACER = _Pacer()


class CassetteMiss(Exception):
    pass


class GeminiUnavailable(Exception):
    pass


def _load_env_key() -> str | None:
    if os.environ.get("GEMINI_API_KEY"):
        return os.environ["GEMINI_API_KEY"]
    env = paths.ROOT / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            if line.startswith("GEMINI_API_KEY=") and len(line.split("=", 1)[1].strip()) > 10:
                return line.split("=", 1)[1].strip()
    return None


class GeminiClient:
    def __init__(self, model: str | None = None, mode: str | None = None, api_key: str | None = None, transport: Any = None):
        self.model = model or os.environ.get("GEMINI_MODEL", DEFAULT_MODEL)
        self.mode = mode or os.environ.get("GEMINI_MODE", "replay")
        self.api_key = api_key or _load_env_key()
        self._transport = transport  # test hook: callable(prompt, schema, media, system) -> str (JSON text)
        self._client = None
        self.calls = 0

    @property
    def available(self) -> bool:
        return bool(self.api_key) or self._transport is not None

    def _sdk(self):
        if self._client is None:
            from google import genai
            self._client = genai.Client(api_key=self.api_key)
        return self._client

    @staticmethod
    def _key(model: str, prompt: str, schema_name: str, media: list[tuple[bytes, str]] | None, system: str) -> str:
        h = hashlib.sha256()
        h.update(model.encode()); h.update(prompt.encode()); h.update(schema_name.encode()); h.update(system.encode())
        for b, m in media or []:
            h.update(m.encode()); h.update(hashlib.sha256(b).digest())
        return h.hexdigest()[:24]

    def _cassette_path(self, service: str, case: str) -> Path:
        return CASSETTES / service / f"{case}.json"

    def model_for(self, service: str) -> str:
        if os.environ.get("GEMINI_MODEL"):
            return os.environ["GEMINI_MODEL"]
        return SERVICE_MODEL.get(service, self.model)

    def _call_live(self, prompt: str, schema: type[BaseModel], media, system: str, tools=None, model: str | None = None) -> str:
        if self._transport is not None:
            return self._transport(prompt, schema, media, system)
        if not self.api_key:
            raise GeminiUnavailable("no GEMINI_API_KEY")
        model = model or self.model
        from google.genai import types
        parts = [types.Part.from_text(text=prompt)]
        for b, mime in media or []:
            parts.append(types.Part.from_bytes(data=b, mime_type=mime))
        cfg = types.GenerateContentConfig(system_instruction=system, response_mime_type="application/json", response_schema=schema, temperature=0.2)
        delay = 2.0
        for attempt in range(4):
            try:
                PACER.wait(model)
                self.calls += 1
                r = self._sdk().models.generate_content(model=model, contents=[types.Content(role="user", parts=parts)], config=cfg)
                return r.text
            except Exception as e:  # SDK raises typed errors; retry on rate limit / unavailable
                msg = str(e)
                if attempt < 3 and any(code in msg for code in ("429", "503", "RESOURCE_EXHAUSTED", "UNAVAILABLE")):
                    time.sleep(delay); delay *= 2; continue
                raise

    def generate_json(self, prompt: str, schema: type[BaseModel], media: list[tuple[bytes, str]] | None = None,
                      service: str = "misc", case: str | None = None, system: str = SYSTEM) -> BaseModel:
        key = self._key(self.model, prompt, schema.__name__, media, system)
        path = self._cassette_path(service, case) if case else None
        if self.mode == "replay":
            if path and path.exists():
                rec = json.loads(path.read_text())
                return schema.model_validate_json(rec["response"])
            raise CassetteMiss(f"{service}/{case or key}")
        model = self.model_for(service)
        text = self._call_live(prompt, schema, media, system, model=model)
        out = schema.model_validate_json(text)
        if path and (self.mode == "record" or case):
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps({"key": key, "model": model, "service": service, "case": case,
                                        "prompt_head": prompt[:300], "response": text, "recorded": time.strftime("%Y-%m-%d")}, ensure_ascii=False, indent=1))
        return out
