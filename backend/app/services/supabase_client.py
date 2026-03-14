"""
Supabase REST API client that works with new key format (sb_secret_*, sb_publishable_*).
Drop-in replacement for supabase-py Client with compatible interface.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional
import httpx


class _Result:
    """Mimics supabase-py execute() result."""
    def __init__(self, data: Any):
        self.data = data


class _QueryBuilder:
    """Chainable query builder that mimics supabase-py table operations."""

    def __init__(self, base_url: str, table: str, service_key: str):
        self._base_url = base_url
        self._table = table
        self._service_key = service_key
        self._method = "GET"
        self._select_cols = "*"
        self._filters: List[str] = []
        self._order_param: Optional[str] = None
        self._limit_val: Optional[int] = None
        self._range_start: Optional[int] = None
        self._range_end: Optional[int] = None
        self._body: Any = None
        self._prefer: Optional[str] = None

    def _headers(self) -> Dict[str, str]:
        h = {
            "apikey": self._service_key,
            "Authorization": f"Bearer {self._service_key}",
            "Content-Type": "application/json",
        }
        if self._prefer:
            h["Prefer"] = self._prefer
        elif self._method == "POST":
            h["Prefer"] = "return=representation"
        elif self._method == "PATCH":
            h["Prefer"] = "return=representation"
        elif self._method == "DELETE":
            h["Prefer"] = "return=representation"
        return h

    def select(self, columns: str = "*") -> "_QueryBuilder":
        self._method = "GET"
        self._select_cols = columns
        return self

    def insert(self, data: Any) -> "_QueryBuilder":
        self._method = "POST"
        self._body = data
        return self

    def update(self, data: dict) -> "_QueryBuilder":
        self._method = "PATCH"
        self._body = data
        return self

    def upsert(self, data: Any) -> "_QueryBuilder":
        self._method = "POST"
        self._body = data
        self._prefer = "return=representation,resolution=merge-duplicates"
        return self

    def delete(self) -> "_QueryBuilder":
        self._method = "DELETE"
        return self

    def eq(self, column: str, value: Any) -> "_QueryBuilder":
        self._filters.append(f"{column}=eq.{value}")
        return self

    def order(self, column: str, desc: bool = False) -> "_QueryBuilder":
        direction = "desc" if desc else "asc"
        self._order_param = f"{column}.{direction}"
        return self

    def limit(self, count: int) -> "_QueryBuilder":
        self._limit_val = count
        return self

    def range(self, start: int, end: int) -> "_QueryBuilder":
        self._range_start = start
        self._range_end = end
        return self

    def execute(self) -> _Result:
        url = f"{self._base_url}/rest/v1/{self._table}"
        params: Dict[str, str] = {}

        if self._method == "GET":
            params["select"] = self._select_cols

        for f in self._filters:
            key, val = f.split("=", 1)
            params[key] = val

        if self._order_param:
            params["order"] = self._order_param

        if self._limit_val is not None:
            params["limit"] = str(self._limit_val)

        headers = self._headers()

        if self._range_start is not None and self._range_end is not None:
            headers["Range"] = f"{self._range_start}-{self._range_end}"
            headers["Range-Unit"] = "items"

        with httpx.Client(timeout=30.0) as client:
            if self._method == "GET":
                r = client.get(url, params=params, headers=headers)
            elif self._method == "POST":
                r = client.post(url, params=params, headers=headers, json=self._body)
            elif self._method == "PATCH":
                r = client.patch(url, params=params, headers=headers, json=self._body)
            elif self._method == "DELETE":
                r = client.delete(url, params=params, headers=headers)
            else:
                raise ValueError(f"Unsupported method: {self._method}")

        r.raise_for_status()
        try:
            data = r.json()
        except Exception:
            data = []
        return _Result(data)


class _RpcBuilder:
    """Builder for RPC calls."""

    def __init__(self, base_url: str, function_name: str, params: dict, service_key: str):
        self._base_url = base_url
        self._function_name = function_name
        self._params = params
        self._service_key = service_key

    def execute(self) -> _Result:
        url = f"{self._base_url}/rest/v1/rpc/{self._function_name}"
        headers = {
            "apikey": self._service_key,
            "Authorization": f"Bearer {self._service_key}",
            "Content-Type": "application/json",
        }
        with httpx.Client(timeout=30.0) as client:
            r = client.post(url, headers=headers, json=self._params)
        r.raise_for_status()
        return _Result(r.json())


class _AuthSession:
    def __init__(self, access_token: str):
        self.access_token = access_token


class _AuthUser:
    def __init__(self, email: str):
        self.email = email


class _AuthResponse:
    def __init__(self, session: _AuthSession, user: _AuthUser):
        self.session = session
        self.user = user


class _AuthClient:
    """Auth client using GoTrue REST API."""

    def __init__(self, base_url: str, anon_key: str):
        self._base_url = base_url
        self._anon_key = anon_key

    def sign_in_with_password(self, credentials: dict) -> _AuthResponse:
        url = f"{self._base_url}/auth/v1/token?grant_type=password"
        headers = {
            "apikey": self._anon_key,
            "Content-Type": "application/json",
        }
        with httpx.Client(timeout=15.0) as client:
            r = client.post(url, headers=headers, json=credentials)

        if r.status_code != 200:
            error_data = r.json() if r.text else {}
            msg = error_data.get("msg", error_data.get("error_description", "Login failed"))
            raise Exception(msg)

        data = r.json()
        return _AuthResponse(
            session=_AuthSession(access_token=data["access_token"]),
            user=_AuthUser(email=data["user"]["email"]),
        )


class _StorageBucket:
    """Storage bucket operations."""

    def __init__(self, base_url: str, service_key: str, bucket_name: str):
        self._base_url = base_url
        self._service_key = service_key
        self._bucket_name = bucket_name

    def upload(self, path: str, file: bytes, file_options: Optional[dict] = None) -> None:
        url = f"{self._base_url}/storage/v1/object/{self._bucket_name}/{path}"
        content_type = "application/octet-stream"
        if file_options and "content-type" in file_options:
            content_type = file_options["content-type"]

        headers = {
            "apikey": self._service_key,
            "Authorization": f"Bearer {self._service_key}",
            "Content-Type": content_type,
        }
        with httpx.Client(timeout=60.0) as client:
            r = client.post(url, headers=headers, content=file)
        r.raise_for_status()

    def remove(self, paths: List[str]) -> None:
        url = f"{self._base_url}/storage/v1/object/{self._bucket_name}"
        headers = {
            "apikey": self._service_key,
            "Authorization": f"Bearer {self._service_key}",
            "Content-Type": "application/json",
        }
        with httpx.Client(timeout=30.0) as client:
            r = client.delete(url, headers=headers, json={"prefixes": paths})
        # Ignore 404 errors for file removal
        if r.status_code not in (200, 204, 404):
            r.raise_for_status()


class _StorageClient:
    def __init__(self, base_url: str, service_key: str):
        self._base_url = base_url
        self._service_key = service_key

    def from_(self, bucket_name: str) -> _StorageBucket:
        return _StorageBucket(self._base_url, self._service_key, bucket_name)


class SupabaseRestClient:
    """
    Supabase REST API client compatible with new key format.
    Provides same interface as supabase-py Client.
    """

    def __init__(self, url: str, service_key: str, anon_key: str):
        self._url = url.rstrip("/")
        self._service_key = service_key
        self._anon_key = anon_key
        self.auth = _AuthClient(self._url, self._anon_key)
        self.storage = _StorageClient(self._url, self._service_key)

    def table(self, name: str) -> _QueryBuilder:
        return _QueryBuilder(self._url, name, self._service_key)

    def rpc(self, function_name: str, params: Optional[dict] = None) -> _RpcBuilder:
        return _RpcBuilder(self._url, function_name, params or {}, self._service_key)
