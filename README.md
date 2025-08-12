# TarifaNinja — Buscador de Passagens (MVP)

<p align="left">
  <img src="https://img.shields.io/badge/FastAPI-0.115-009485" alt="FastAPI"/>
  <img src="https://img.shields.io/badge/React-18-61dafb" alt="React"/>
  <img src="https://img.shields.io/badge/Vite-5-646cff" alt="Vite"/>
  <img src="https://img.shields.io/badge/Redis-cache-dc382d" alt="Redis"/>
  <img src="https://img.shields.io/badge/License-MIT-green" alt="MIT"/>
</p>

Monorepo com **frontend (Vite + React + Tailwind)** e **backend (FastAPI + Amadeus)**.
Pronto para rodar localmente e fazer deploy (Render/Railway/Vercel).

## 🌳 Estrutura
```
tarifaninja/
├─ frontend/           # Vite + React + Tailwind (UI TarifaNinja)
└─ backend/            # FastAPI + adapters (Amadeus + simulado)
```

---

## 🚀 Como rodar

### 1) Backend (FastAPI)
```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Opcional: crie .env (copie de .env.example e preencha)
# Sem as chaves, o backend usa dados simulados.

uvicorn main:app --reload
# Abra http://127.0.0.1:8000/docs
```

### 2) Frontend (Vite + React + Tailwind)
```bash
cd frontend
npm install
# Ajuste .env.local (opcional) com a URL do backend:
# VITE_API_URL=http://127.0.0.1:8000

npm run dev
# Abra o link exibido (ex.: http://localhost:5173)
```

---

## ☁️ Deploy rápido (Render)

### Backend (Render)
1. Suba este repositório no GitHub.
2. No Render: **New +** → **Web Service** → selecione o repo.
3. Configure:
   - **Root Directory**: `backend`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port 8000`
4. Em **Environment → Add Environment Variable**:
   - `AMADEUS_BASE` = `https://test.api.amadeus.com`
   - `AMADEUS_CLIENT_ID` = *sua chave* (opcional)
   - `AMADEUS_CLIENT_SECRET` = *seu secret* (opcional)
   - `DEFAULT_CURRENCY` = `BRL`
5. Deploy e teste `GET /health`.

### Frontend (Netlify/Vercel)
- Configure a env `VITE_API_URL` apontando para a URL pública do backend Render.
- Build (Netlify): `npm run build`; Publish dir: `frontend/dist` (se usar monorepo, configure a root).
- No Vercel: importe o projeto apontando `frontend` como **Root Directory**.

---

## 🔐 Variáveis de ambiente

### Backend (`backend/.env` ou painel do provedor)
```
AMADEUS_BASE=https://test.api.amadeus.com
AMADEUS_CLIENT_ID=seu_client_id
AMADEUS_CLIENT_SECRET=seu_client_secret
DEFAULT_CURRENCY=BRL
```

### Frontend (`frontend/.env.local`)
```
VITE_API_URL=https://sua-api.onrender.com
```

---

## 🔗 Integração front ↔ back
O front chama `POST /search` com:
```json
{
  "origin": "GRU",
  "destination": "SCL",
  "departDate": "2025-09-10",
  "returnDate": null,
  "pax": 1,
  "cabin": "economy"
}
```
O back responde uma lista de voos normalizada.

---

## 📦 Como subir no GitHub (exemplo)
```bash
# Na pasta raíz 'tarifaninja/'
git init
git add .
git commit -m "TarifaNinja: frontend (Vite+React+Tailwind) + backend (FastAPI+Amadeus)"
# Crie o repositório no GitHub e copie a URL SSH/HTTPS
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/tarifaninja.git
git push -u origin main
```

---

## 📋 Licença
MIT

---

## 🧩 Provedores habilitados
- **Amadeus** (sandbox/live) — via `AMADEUS_CLIENT_ID`/`SECRET`
- **Kiwi/Tequila** — via `TEQUILA_API_KEY`
- **Simulado** — fallback automático (sem chaves)

O backend agrega os provedores **em paralelo** e faz **cache** (se `REDIS_URL` estiver definido).
