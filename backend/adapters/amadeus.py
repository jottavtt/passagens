import time
from typing import List, Optional

import httpx
from pydantic import BaseModel

TRAVEL_CLASS = {
    "economy": "ECONOMY",
    "premium": "PREMIUM_ECONOMY",
    "business": "BUSINESS",
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

class AmadeusAdapter:
    def __init__(self, base_url: str, client_id: str, client_secret: str, default_currency: str = "BRL"):
        self.base_url = base_url.rstrip("/")
        self.client_id = client_id
        self.client_secret = client_secret
        self.default_currency = default_currency
        self._token = None
        self._token_exp = 0.0

    async def _get_token(self) -> str:
        if self._token and time.time() < self._token_exp - 30:
            return self._token
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post(
                f"{self.base_url}/v1/security/oauth2/token",
                data={
                    "grant_type": "client_credentials",
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            r.raise_for_status()
            data = r.json()
            self._token = data["access_token"]
            self._token_exp = time.time() + float(data.get("expires_in", 1799))
            return self._token

    async def search(self, q: SearchQuery) -> List[Flight]:
        token = await self._get_token()
        params = {
            "originLocationCode": q.origin,
            "destinationLocationCode": q.destination,
            "departureDate": q.departDate,
            "adults": str(max(1, q.pax)),
            "nonStop": "false",
            "currencyCode": self.default_currency,
            "max": "20",
            "travelClass": TRAVEL_CLASS.get(q.cabin, "ECONOMY"),
        }
        if q.returnDate:
            params["returnDate"] = q.returnDate

        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.get(
                f"{self.base_url}/v2/shopping/flight-offers",
                params=params,
                headers={"Authorization": f"Bearer {token}"},
            )
            r.raise_for_status()
            payload = r.json()

        flights: List[Flight] = []
        data = payload.get("data", [])
        for item in data:
            price_total = float(item.get("price", {}).get("total", 0))
            ccy = item.get("price", {}).get("currency", self.default_currency)
            validating = ",".join(item.get("validatingAirlineCodes", []) or [])

            itins = item.get("itineraries", [])
            if not itins:
                continue
            first = itins[0]
            segments = first.get("segments", [])
            if not segments:
                continue
            depart_at = segments[0].get("departure", {}).get("at")
            arrive_at = segments[-1].get("arrival", {}).get("at")
            from_ = segments[0].get("departure", {}).get("iataCode")
            to = segments[-1].get("arrival", {}).get("iataCode")
            stops = max(0, len(segments) - 1)
            duration_iso = first.get("duration", "PT0H0M")

            mins = 0
            num = ""
            for ch in duration_iso.replace("PT", ""):
                if ch.isdigit():
                    num += ch
                elif ch == 'H':
                    mins += int(num or 0) * 60
                    num = ""
                elif ch == 'M':
                    mins += int(num or 0)
                    num = ""

            carrier = segments[0].get("carrierCode") or validating or ""

            bags = "1x 10kg" if q.cabin == "economy" else ("1x 10kg + 1x 23kg" if q.cabin == "premium" else "2x 32kg")

            flights.append(
                Flight(
                    provider="Amadeus",
                    airline=carrier,
                    from_=from_,
                    to=to,
                    departAt=depart_at,
                    arriveAt=arrive_at,
                    durationMinutes=mins,
                    stops=stops,
                    cabin=q.cabin,
                    price=round(price_total, 2),
                    currency=ccy,
                    bags=bags,
                    buyUrl=None,
                )
            )

        flights.sort(key=lambda x: x.price)
        return [f.model_dump() for f in flights]
