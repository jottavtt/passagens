from typing import List
from dataclasses import dataclass
from datetime import datetime, timedelta
import random

@dataclass
class SearchQuery:
    origin: str
    destination: str
    departDate: str
    returnDate: str | None = None
    pax: int = 1
    cabin: str = "economy"

AIRLINES = ["LATAM", "SKY", "JetSMART", "GOL", "Azul"]

CABIN_BAGS = {
    "economy": "1x 10kg",
    "premium": "1x 10kg + 1x 23kg",
    "business": "2x 32kg",
}

random.seed(42)

def _minutes_to_iso(day: str, minutes: int) -> str:
    base = datetime.fromisoformat(day + "T00:00:00")
    return (base + timedelta(minutes=minutes)).isoformat()

def search_simulated(q: SearchQuery) -> List[dict]:
    base_price = {"economy": 1100, "premium": 1700, "business": 3200}[q.cabin]
    flights = []
    for i in range(10):
        airline = random.choice(AIRLINES)
        stops = random.choices([0, 1, 2], weights=[0.65, 0.25, 0.10])[0]
        duration = 200 + random.randint(0, 340) + stops * random.randint(45, 120)
        depart_min = 5 * 60 + random.randint(0, 18 * 60)
        arrive_min = depart_min + duration
        skew = 80 if airline == "LATAM" else (-60 if airline in ("SKY", "JetSMART") else 20)
        price = max(350, base_price + random.randint(-120, 180) + stops * random.randint(-40, 90) + skew) * (q.pax ** 0.97)
        price = round(price / 5) * 5
        flights.append(
            {
                "provider": "Simulado",
                "airline": airline,
                "from_": q.origin,
                "to": q.destination,
                "departAt": _minutes_to_iso(q.departDate, depart_min),
                "arriveAt": _minutes_to_iso(q.departDate, arrive_min),
                "durationMinutes": duration,
                "stops": stops,
                "cabin": q.cabin,
                "price": float(price),
                "currency": "BRL",
                "bags": CABIN_BAGS[q.cabin],
                "buyUrl": "https://google.com/search?q=passagens",
            }
        )
    flights.sort(key=lambda x: x["price"])
    return flights
