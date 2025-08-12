import React, { useEffect, useMemo, useState } from "react";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const toISODate = (d) => d.toISOString().slice(0, 10);

function hashString(str) { let h = 5381; for (let i = 0; i < str.length; i++) h = (h * 33) ^ str.charCodeAt(i); return h >>> 0; }
function mulberry32(a) { return function () { let t = (a += 0x6D2B79F5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function addMinutes(date, mins) { const d = new Date(date); d.setMinutes(d.getMinutes() + mins); return d; }
function minutesToHHMM(mins) { const h = Math.floor(mins / 60); const m = mins % 60; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`; }

const AIRLINES = [
  { code: "LA", name: "LATAM" },
  { code: "H2", name: "SKY Airline" },
  { code: "JA", name: "JetSMART" },
  { code: "G3", name: "GOL" },
  { code: "AD", name: "Azul" },
];

const CABINS = [
  { value: "economy", label: "Econômica" },
  { value: "premium", label: "Premium Economy" },
  { value: "business", label: "Executiva" },
];

const DEFAULT_FORM = {
  origin: "GRU",
  destination: "SCL",
  departDate: toISODate(new Date(Date.now() + 1000 * 60 * 60 * 24 * 14)),
  returnDate: "",
  pax: 1,
  cabin: "economy",
};

function simulateProviderSearch(providerName, params, count = 5) {
  const seed = hashString(`${providerName}|${params.origin}|${params.destination}|${params.departDate}|${params.returnDate}|${params.pax}|${params.cabin}`);
  const rnd = mulberry32(seed);
  const flights = [];

  const basePrice = params.cabin === "business" ? 3200 : params.cabin === "premium" ? 1700 : 1100;

  for (let i = 0; i < count; i++) {
    const airline = AIRLINES[Math.floor(rnd() * AIRLINES.length)];
    const stops = rnd() < 0.65 ? 0 : rnd() < 0.85 ? 1 : 2;
    const dur = Math.floor(200 + rnd() * 340 + stops * (60 + rnd() * 80));

    const departMinutes = Math.floor(5 * 60 + rnd() * (18 * 60));
    const departDateTime = new Date(`${params.departDate}T00:00:00`);
    const departAt = addMinutes(departDateTime, departMinutes);
    const arriveAt = addMinutes(departAt, dur + (stops > 0 ? 45 * stops : 0));

    const priceNoise = (rnd() - 0.5) * 300;
    const stopsPenalty = stops * 60 * (rnd() + 0.5);
    const airlineSkew = airline.name.includes("LATAM") ? 80 : airline.name.includes("JetSMART") || airline.name.includes("SKY") ? -60 : 20;
    const paxFactor = Math.max(1, params.pax) ** 0.97;

    let price = Math.max(350, basePrice + priceNoise + stopsPenalty + airlineSkew) * paxFactor;
    price = Math.round(price / 5) * 5;

    flights.push({
      id: `${providerName}-${i}-${seed}`,
      provider: providerName,
      airline: airline.name,
      from: params.origin,
      to: params.destination,
      departAt: departAt.toISOString(),
      arriveAt: arriveAt.toISOString(),
      durationMinutes: dur,
      stops,
      cabin: params.cabin,
      price,
      bags: params.cabin === "economy" ? "1x 10kg" : params.cabin === "premium" ? "1x 10kg + 1x 23kg" : "2x 32kg",
      buyUrl:
        providerName === "LATAM"
          ? "https://www.latamairlines.com"
          : providerName === "SKY"
          ? "https://www.skyairline.com"
          : providerName === "JetSMART"
          ? "https://jetsmart.com"
          : providerName === "GOL"
          ? "https://www.voegol.com.br"
          : "https://www.voeazul.com.br",
    });
  }
  return flights;
}

async function aggregateSearch(params) {
  // Se existir VITE_API_URL, chama backend; senão, usa simulado no front
  const api = import.meta?.env?.VITE_API_URL;
  if (api) {
    const res = await fetch(`${api}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origin: params.origin,
        destination: params.destination,
        departDate: params.departDate,
        returnDate: params.returnDate || null,
        pax: params.pax,
        cabin: params.cabin,
      }),
    });
    if (!res.ok) throw new Error("Erro na API");
    const data = await res.json();
    return data.map((f) => ({
      id: `${f.provider}-${f.airline}-${f.departAt}`,
      provider: f.provider,
      airline: f.airline,
      from: f.from_,
      to: f.to,
      departAt: f.departAt,
      arriveAt: f.arriveAt,
      durationMinutes: f.durationMinutes,
      stops: f.stops,
      cabin: f.cabin,
      price: f.price,
      bags: f.bags,
      buyUrl: f.buyUrl || "#",
    }));
  }
  // fallback local
  const providers = ["LATAM", "SKY", "JetSMART", "GOL", "Azul"];
  const batches = providers.flatMap((p) => simulateProviderSearch(p, params, 4));
  await new Promise((r) => setTimeout(r, 400));
  return batches;
}

function Badge({ children }) {
  return <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium">{children}</span>;
}
function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded-lg bg-gray-200/70 dark:bg-gray-700/40 ${className}`} />;
}

function ResultCard({ flight }) {
  const depart = new Date(flight.departAt);
  const arrive = new Date(flight.arriveAt);
  return (
    <div className="rounded-2xl border p-4 shadow-sm hover:shadow-md transition">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center text-xs font-semibold">
            {flight.airline.split(" ").map((s) => s[0]).join("")}
          </div>
          <div>
            <div className="text-sm text-gray-500">{flight.airline}</div>
            <div className="text-xs text-gray-400">{flight.provider}</div>
          </div>
        </div>
        <div className="flex-1 grid grid-cols-3 items-center gap-2">
          <div className="text-center">
            <div className="text-xl font-semibold">{depart.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div>
            <div className="text-xs text-gray-500">{flight.from}</div>
          </div>
          <div className="text-center">
            <div className="text-sm text-gray-500">{minutesToHHMM(flight.durationMinutes)}</div>
            <div className="text-[11px] text-gray-400">{flight.stops === 0 ? "Direto" : `${flight.stops} parada${flight.stops > 1 ? "s" : ""}`}</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-semibold">{arrive.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div>
            <div className="text-xs text-gray-500">{flight.to}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold">{BRL.format(flight.price)}</div>
          <div className="flex items-center justify-end gap-2 mt-1">
            <Badge>{flight.cabin}</Badge>
            <Badge>{flight.bags}</Badge>
          </div>
          <a className="mt-3 inline-flex items-center justify-center rounded-xl border px-3 py-1.5 text-sm font-medium hover:bg-gray-50" href={flight.buyUrl} target="_blank" rel="noreferrer">
            Ver no site
          </a>
        </div>
      </div>
    </div>
  );
}

function FlexibleDates({ params, onPickDate }) {
  const days = useMemo(() => {
    if (!params.departDate) return [];
    const base = new Date(`${params.departDate}T00:00:00`);
    return Array.from({ length: 7 }).map((_, i) => addMinutes(base, (i - 3) * 24 * 60));
  }, [params.departDate]);

  const items = days.map((d) => {
    const fakeParams = { ...params, departDate: d.toISOString().slice(0,10) };
    const batch = simulateProviderSearch("LATAM", fakeParams, 3)
      .concat(simulateProviderSearch("SKY", fakeParams, 2))
      .concat(simulateProviderSearch("JetSMART", fakeParams, 2));
    const min = Math.min(...batch.map((x) => x.price));
    return { date: d, minPrice: min };
  });

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {items.map((it) => (
        <button key={it.date.toISOString()} className="min-w-[120px] rounded-xl border px-3 py-2 text-left hover:bg-gray-50" onClick={() => onPickDate(it.date.toISOString().slice(0,10))}>
          <div className="text-xs text-gray-500">{it.date.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}</div>
          <div className="text-sm font-semibold">{BRL.format(it.minPrice)}</div>
        </button>
      ))}
    </div>
  );
}

function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : initialValue; } catch { return initialValue; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }, [key, value]);
  return [value, setValue];
}

export default function App() {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [sortBy, setSortBy] = useState("price");
  const [filters, setFilters] = useState({ stops: "any", airlines: new Set(), cabin: "any" });
  const [alerts, setAlerts] = useLocalStorage("tn_alerts", []);
  const [alertPrice, setAlertPrice] = useState(1200);

  const sortedFiltered = useMemo(() => {
    let list = [...results];
    if (filters.stops !== "any") { const val = Number(filters.stops); list = list.filter((f) => f.stops === val); }
    if (filters.airlines.size > 0) { list = list.filter((f) => filters.airlines.has(f.airline)); }
    if (filters.cabin !== "any") { list = list.filter((f) => f.cabin === filters.cabin); }
    list.sort((a, b) => {
      switch (sortBy) {
        case "duration": return a.durationMinutes - b.durationMinutes;
        case "depart": return new Date(a.departAt) - new Date(b.departAt);
        case "price":
        default: return a.price - b.price;
      }
    });
    return list;
  }, [results, sortBy, filters]);

  async function onSearch(e) {
    e?.preventDefault();
    setLoading(true);
    try { const res = await aggregateSearch(form); setResults(res); }
    finally { setLoading(false); }
  }

  function addAlert() {
    const a = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...form, threshold: alertPrice };
    setAlerts([a, ...alerts]);
  }

  async function checkAlerts() {
    if (alerts.length === 0) return;
    setLoading(true);
    try {
      const checks = await Promise.all(alerts.map(async (a) => {
        const res = await aggregateSearch(a);
        const best = Math.min(...res.map((x) => x.price));
        return { id: a.id, best };
      }));
      const hits = checks.filter((c, i) => c.best <= alerts[i].threshold);
      if (hits.length > 0) {
        alert("🎉 Encontramos ofertas abaixo do seu alvo em " + hits.length + " alerta(s)!\n" + hits.map((h) => {
          const a = alerts.find((x) => x.id === h.id);
          return `${a.origin}→${a.destination} em ${a.departDate}: ${BRL.format(h.best)} (alvo ${BRL.format(a.threshold)})`;
        }).join("\n"));
      } else {
        alert("Sem ofertas abaixo do alvo agora. Tente mais tarde.");
      }
    } finally { setLoading(false); }
  }

  useEffect(() => { onSearch(); }, []);

  return (
    <div className="min-h-screen bg-white text-gray-900 antialiased">
      <header className="sticky top-0 z-10 backdrop-blur border-b">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-2xl bg-gradient-to-br from-indigo-500 via-sky-500 to-emerald-400" />
            <div>
              <div className="text-lg font-bold tracking-tight">TarifaNinja</div>
              <div className="text-xs text-gray-500">Encontre voos baratos rapidamente</div>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2">
            <button onClick={checkAlerts} className="rounded-xl border px-3 py-1.5 text-sm font-medium hover:bg-gray-50">
              Verificar alertas
            </button>
            <a className="rounded-xl border px-3 py-1.5 text-sm font-medium hover:bg-gray-50" href="#como-funciona">Como funciona</a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-24">
        <form onSubmit={onSearch} className="mt-6 grid grid-cols-1 gap-3 rounded-2xl border p-4 shadow-sm md:grid-cols-12">
          <div className="md:col-span-2">
            <label className="text-xs text-gray-500">Origem</label>
            <input className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring" value={form.origin}
              onChange={(e) => setForm({ ...form, origin: e.target.value.toUpperCase().slice(0, 3) })} placeholder="GRU" required />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-gray-500">Destino</label>
            <input className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring" value={form.destination}
              onChange={(e) => setForm({ ...form, destination: e.target.value.toUpperCase().slice(0, 3) })} placeholder="SCL" required />
          </div>
          <div className="md:col-span-3">
            <label className="text-xs text-gray-500">Data de ida</label>
            <input type="date" className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring" value={form.departDate}
              onChange={(e) => setForm({ ...form, departDate: e.target.value })} required />
          </div>
          <div className="md:col-span-3">
            <label className="text-xs text-gray-500">Data de volta (opcional)</label>
            <input type="date" className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring" value={form.returnDate}
              onChange={(e) => setForm({ ...form, returnDate: e.target.value })} />
          </div>
          <div className="md:col-span-1">
            <label className="text-xs text-gray-500">Pax</label>
            <input type="number" min={1} max={9} className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring" value={form.pax}
              onChange={(e) => setForm({ ...form, pax: Math.max(1, Math.min(9, Number(e.target.value))) })} />
          </div>
          <div className="md:col-span-1">
            <label className="text-xs text-gray-500">Classe</label>
            <select className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring" value={form.cabin}
              onChange={(e) => setForm({ ...form, cabin: e.target.value })}>
              {CABINS.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
            </select>
          </div>
          <div className="md:col-span-12 flex flex-wrap items-end justify-between gap-3">
            <div className="flex items-center gap-3">
              <button type="submit" className="rounded-xl bg-black px-4 py-2 text-white hover:opacity-90" disabled={loading}>
                {loading ? "Buscando..." : "Buscar voos"}
              </button>
              <div className="hidden md:block text-xs text-gray-500">Dados simulados para MVP</div>
            </div>
            <div className="flex items-center gap-2">
              <input type="number" className="w-28 rounded-xl border px-2 py-1 text-sm" value={alertPrice}
                onChange={(e) => setAlertPrice(Number(e.target.value))} min={100} step={10} />
              <button type="button" className="rounded-xl border px-3 py-1.5 text-sm hover:bg-gray-50" onClick={addAlert}>
                Criar alerta ≤ {BRL.format(alertPrice)}
              </button>
            </div>
          </div>
        </form>

        {form.departDate && (
          <section className="mt-4">
            <div className="mb-2 text-sm font-semibold">Datas próximas</div>
            <FlexibleDates params={form} onPickDate={(d) => setForm((f) => ({ ...f, departDate: d }))} />
          </section>
        )}

        <section className="mt-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <label className="text-sm">Ordenar por</label>
            <select className="rounded-xl border px-2 py-1 text-sm" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="price">Preço</option>
              <option value="duration">Duração</option>
              <option value="depart">Horário de partida</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <select className="rounded-xl border px-2 py-1 text-sm" value={filters.stops} onChange={(e) => setFilters((f) => ({ ...f, stops: e.target.value }))}>
              <option value="any">Paradas: qualquer</option>
              <option value={0}>Direto</option>
              <option value={1}>1 parada</option>
              <option value={2}>2 paradas</option>
            </select>
            <select className="rounded-xl border px-2 py-1 text-sm" value={filters.cabin} onChange={(e) => setFilters((f) => ({ ...f, cabin: e.target.value }))}>
              <option value="any">Cabine: qualquer</option>
              {CABINS.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
            </select>
            <details className="rounded-xl border px-3 py-1">
              <summary className="text-sm cursor-pointer select-none">Cias</summary>
              <div className="mt-2 flex flex-col gap-1">
                {AIRLINES.map((a) => (
                  <label key={a.code} className="flex items-center gap-2 text-sm">
                    <input type="checkbox"
                      checked={filters.airlines.has(a.name)}
                      onChange={(e) => setFilters((f) => { const s = new Set(f.airlines); if (e.target.checked) s.add(a.name); else s.delete(a.name); return { ...f, airlines: s }; })}
                    />{a.name}
                  </label>
                ))}
                <button type="button" className="mt-1 self-start text-xs text-blue-600" onClick={() => setFilters((f) => ({ ...f, airlines: new Set() }))}>Limpar</button>
              </div>
            </details>
          </div>
        </section>

        <section className="mt-4 grid grid-cols-1 gap-3">
          {loading && (<><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></>)}
          {!loading && sortedFiltered.length === 0 && (<div className="rounded-2xl border p-6 text-center text-sm text-gray-500">Nenhum voo encontrado com os filtros atuais.</div>)}
          {!loading && sortedFiltered.map((f) => (<ResultCard key={f.id} flight={f} />))}
        </section>

        <section className="mt-10" id="alertas">
          <h2 className="text-lg font-semibold">Seus alertas ({alerts.length})</h2>
          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
            {alerts.map((a) => (
              <div key={a.id} className="rounded-2xl border p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm">
                    <div className="font-medium">{a.origin} → {a.destination} • {a.departDate || "data flexível"}</div>
                    <div className="text-gray-500">Alvo: {BRL.format(a.threshold)} • {a.cabin} • {a.pax} pax</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="rounded-xl border px-2 py-1 text-xs hover:bg-gray-50" onClick={() => setForm({ ...a })}>Usar na busca</button>
                    <button className="rounded-xl border px-2 py-1 text-xs hover:bg-gray-50" onClick={() => setAlerts(alerts.filter((x) => x.id !== a.id))}>Excluir</button>
                  </div>
                </div>
              </div>
            ))}
            {alerts.length === 0 && (<div className="text-sm text-gray-500">Crie um alerta para ser avisado quando o preço cair.</div>)}
          </div>
        </section>

        <section className="mt-16" id="como-funciona">
          <h2 className="text-xl font-bold">Como integrar com APIs reais</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-gray-700">
            <li>Crie adapters por provedor (ex.: <code>amadeusAdapter.search(params)</code>) que retornem o mesmo formato desta lista de voos.</li>
            <li>No <code>aggregateSearch</code>, troque o simulador por chamadas ao backend com sua <code>API_KEY</code>.</li>
            <li>Opcional: adicione cache (Redis) e um job para alertas por e-mail.</li>
          </ol>
        </section>
      </main>

      <footer className="border-t py-8 text-center text-xs text-gray-500">
        TarifaNinja • MVP demonstrativo (dados simulados). © {new Date().getFullYear()}
      </footer>
    </div>
  );
}
