import os, json, asyncio, hashlib
from typing import List, Optional

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator

# Redis cache (opcional)
REDIS_URL = os.getenv("REDIS_URL")
SEARCH_TTL_SECONDS = int(os.getenv("SEARCH_TTL_SECONDS", "900"))  # 15 min
redis = None
if REDIS_URL:
    try:
        import redis.asyncio as redis_async  # type: ignore
        redis = redis_async.from_url(REDIS_URL, decode_responses=True)
    except Exception as e:
        redis = None

AMADEUS_BASE = os.getenv("AMADEUS_BASE", "https://test.api.amadeus.com")
AMADEUS_CLIENT_ID = os.getenv("AMADEUS_CLIENT_ID")
AMADEUS_CLIENT_SECRET = os.getenv("AMADEUS_CLIENT_SECRET")
DEFAULT_CURRENCY = os.getenv("DEFAULT_CURRENCY", "BRL")

TEQUILA_BASE = os.getenv("TEQUILA_BASE", "https://tequila-api.kiwi.com")
TEQUILA_API_KEY = os.getenv("TEQUILA_API_KEY")

class SearchQuery(BaseModel):
    origin: str
    destination: str
    departDate: str  # YYYY-MM-DD
    returnDate: Optional[str] = None
    pax: int = 1
    cabin: str = "economy"  # economy | premium | business

    @field_validator("origin", "destination")
    @classmethod
    def iata_upper(cls, v: str) -> str:
        v = v.strip().upper()
        if len(v) != 3:
            raise ValueError("IATA deve ter 3 letras, ex.: GRU, SCL")
        return v

    @field_validator("cabin")
    @classmethod
    def cabin_ok(cls, v: str) -> str:
        allowed = {"economy", "premium", "business"}
        if v not in allowed:
            raise ValueError(f"cabin deve ser um de {allowed}")
        return v

class Flight(BaseModel):
    provider: str
    airline: str
    from_: str
    to: str
    departAt: str
    arriveAt: str
    durationMinutes: int
    stops: int
    cabin: str
    price: float
    currency: str = DEFAULT_CURRENCY
    bags: str
    buyUrl: Optional[str] = None

app = FastAPI(title="TarifaNinja API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Adapters
from adapters.simulated import search_simulated
from adapters.amadeus import AmadeusAdapter
from adapters.kiwi import KiwiAdapter

amadeus = None
if AMADEUS_CLIENT_ID and AMADEUS_CLIENT_SECRET:
    amadeus = AmadeusAdapter(
        base_url=AMADEUS_BASE,
        client_id=AMADEUS_CLIENT_ID,
        client_secret=AMADEUS_CLIENT_SECRET,
        default_currency=DEFAULT_CURRENCY,
    )

kiwi = None
if TEQUILA_API_KEY:
    kiwi = KiwiAdapter(base_url=TEQUILA_BASE, api_key=TEQUILA_API_KEY, default_currency=DEFAULT_CURRENCY)

def _cache_key(q: SearchQuery) -> str:
    s = json.dumps(q.model_dump(), sort_keys=True)
    return "search:" + hashlib.sha1(s.encode()).hexdigest()

@app.get("/health")
async def health():
    return {"ok": True, "amadeus": bool(amadeus is not None), "kiwi": bool(kiwi is not None), "cache": bool(redis is not None)}

@app.post("/search", response_model=List[Flight])
async def search(q: SearchQuery):
    # cache
    if redis:
        key = _cache_key(q)
        cached = await redis.get(key)
        if cached:
            return json.loads(cached)

    tasks = []
    # BFF strategy: tente provedores reais em paralelo; se nenhum ativo, use simulado.
    if amadeus is not None:
        tasks.append(asyncio.create_task(amadeus.search(q)))
    if kiwi is not None:
        tasks.append(asyncio.create_task(kiwi.search(q)))

    results: List[dict] = []
    if tasks:
        done = await asyncio.gather(*tasks, return_exceptions=True)
        for r in done:
            if isinstance(r, Exception):
                continue
            if r:
                results.extend(r)

    # Sempre garante pelo menos algo: simulador
    if not results:
        results = search_simulated(q)

    # Ordena e deduplica (airline+departAt)
    seen = set()
    uniq = []
    for f in sorted(results, key=lambda x: x.get("price", 9e9)):
        key = (f.get("airline"), f.get("departAt"))
        if key in seen:
            continue
        seen.add(key)
        uniq.append(f)

    if redis:
        try:
            await redis.setex(_cache_key(q), SEARCH_TTL_SECONDS, json.dumps(uniq))
        except Exception:
            pass

    return uniq
