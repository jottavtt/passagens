from typing import List, Optional
import datetime as dt
import httpx
from pydantic import BaseModel

CABIN_MAP = {
    "economy": "M",   # Economy
    "premium": "W",   # Premium Economy
    "business": "C",  # Business
}

class SearchQuery(BaseModel):
    origin: str
    destination: str
    departDate: str
    returnDate: Optional[str] = None
    pax: int = 1
    cabin: str = "economy"

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
    currency: str
    bags: str
    buyUrl: Optional[str] = None

def _fmt_date(d: str) -> str:
    # Kiwi aceita DD/MM/YYYY
    y, m, day = d.split("-")
    return f"{day}/{m}/{y}"

class KiwiAdapter:
    def __init__(self, base_url: str, api_key: str, default_currency: str = "BRL"):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.default_currency = default_currency

    async def search(self, q: SearchQuery) -> List[Flight]:
        params = {
            "fly_from": q.origin,
            "fly_to": q.destination,
            "date_from": _fmt_date(q.departDate),
            "date_to": _fmt_date(q.departDate),
            "adults": str(max(1, q.pax)),
            "curr": self.default_currency,
            "selected_cabins": CABIN_MAP.get(q.cabin, "M"),
            "limit": "30",
            "sort": "price",
        }
        if q.returnDate:
            params["return_from"] = _fmt_date(q.returnDate)
            params["return_to"] = _fmt_date(q.returnDate)

        headers = {"apikey": self.api_key}
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.get(f"{self.base_url}/v2/search", params=params, headers=headers)
            r.raise_for_status()
            payload = r.json()

        flights: List[Flight] = []
        for item in payload.get("data", []):
            price_total = float(item.get("price", 0))
            ccy = self.default_currency
            route = item.get("route", [])
            if not route:
                continue
            first = route[0]
            last = route[-1]

            # times are epoch seconds (UTC)
            def to_iso(ts):
                return dt.datetime.utcfromtimestamp(int(ts)).replace(tzinfo=dt.timezone.utc).isoformat()

            depart_at = to_iso(first.get("dTimeUTC"))
            arrive_at = to_iso(last.get("aTimeUTC"))
            from_ = first.get("flyFrom")
            to = last.get("flyTo")
            stops = max(0, len(route) - 1)

            duration_ms = item.get("duration", {}).get("total", 0) * 1000
            duration_min = max(0, int(duration_ms / 60000)) if duration_ms else 0

            carrier = first.get("airline") or (item.get("airlines", [None]) or [None])[0]

            bags = "1x 10kg" if q.cabin == "economy" else ("1x 10kg + 1x 23kg" if q.cabin == "premium" else "2x 32kg")

            flights.append(Flight(
                provider="Kiwi",
                airline=carrier or "UNK",
                from_=from_ or q.origin,
                to=to or q.destination,
                departAt=depart_at,
                arriveAt=arrive_at,
                durationMinutes=duration_min or item.get("duration", {}).get("total", 0)//60,
                stops=stops,
                cabin=q.cabin,
                price=round(price_total, 2),
                currency=ccy,
                bags=bags,
                buyUrl=item.get("deep_link"),
            ))

        flights.sort(key=lambda x: x.price)
        return [f.model_dump() for f in flights]
