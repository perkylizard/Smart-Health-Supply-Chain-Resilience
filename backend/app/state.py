"""Mutable demo state: scenario, transfer decisions, staff entries. In-process now; Firestore adapter in Plan 5."""
import threading
import time
from typing import Protocol


class StateStore(Protocol):
    def get_scenario(self) -> dict: ...
    def set_scenario(self, name: str, intensity: float) -> dict: ...
    def transfer_status(self, transfer_id: str) -> dict | None: ...
    def set_transfer(self, transfer_id: str, status: str, reason: str | None = None) -> dict: ...
    def add_entry(self, entry: dict) -> dict: ...
    def entries(self, facility_id: str | None = None) -> list[dict]: ...


class InMemoryState:
    def __init__(self):
        self._lock = threading.Lock()
        self._scenario = {"name": "normal", "intensity": 1.0, "updated": time.time()}
        self._transfers: dict[str, dict] = {}
        self._entries: list[dict] = []

    def get_scenario(self) -> dict:
        return dict(self._scenario)

    def set_scenario(self, name: str, intensity: float) -> dict:
        with self._lock:
            self._scenario = {"name": name, "intensity": float(max(0.0, min(1.0, intensity))), "updated": time.time()}
            return dict(self._scenario)

    def transfer_status(self, transfer_id: str) -> dict | None:
        return self._transfers.get(transfer_id)

    def set_transfer(self, transfer_id: str, status: str, reason: str | None = None) -> dict:
        with self._lock:
            rec = {"transfer_id": transfer_id, "status": status, "reason": reason, "updated": time.time()}
            self._transfers[transfer_id] = rec
            return dict(rec)

    def all_transfers(self) -> dict[str, dict]:
        return dict(self._transfers)

    def add_entry(self, entry: dict) -> dict:
        with self._lock:
            rec = {**entry, "entry_id": f"e{len(self._entries) + 1}", "received": time.time()}
            self._entries.append(rec)
            return rec

    def entries(self, facility_id: str | None = None) -> list[dict]:
        return [e for e in self._entries if facility_id is None or e.get("facility_id") == facility_id]
