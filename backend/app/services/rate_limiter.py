from __future__ import annotations

import time
from typing import Dict, List
from collections import defaultdict
from fastapi import HTTPException, Request


class RateLimiter:
    """Simple in-memory IP-based rate limiter."""

    def __init__(self, max_requests: int = 5, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._requests: Dict[str, List[float]] = defaultdict(list)

    def check(self, request: Request) -> None:
        """Check if the request is within rate limits. Raises 429 if exceeded."""
        client_ip = self._get_client_ip(request)
        now = time.time()

        self._requests[client_ip] = [
            t
            for t in self._requests[client_ip]
            if now - t < self.window_seconds
        ]

        if len(self._requests[client_ip]) >= self.max_requests:
            raise HTTPException(
                status_code=429,
                detail=f"レート制限を超えました。{self.window_seconds}秒間に{self.max_requests}回までです。",
            )

        self._requests[client_ip].append(now)

    def _get_client_ip(self, request: Request) -> str:
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"


# Global rate limiter instance
chat_rate_limiter = RateLimiter(max_requests=5, window_seconds=60)
