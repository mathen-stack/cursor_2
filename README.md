# TailorCV

MVP platform that generates a **tailored resume** and **cover letter** from a candidate profile + job description, using a fixed prompt that includes resume length, tone, template, seniority level, and ATS keyword priority.

## Screens

1. **Profile Builder** — name, location, email, phone, LinkedIn, experience, education, certifications
2. **Job Description Input** — posting + generation options
3. **Resume & Cover Letter Editor** — review and edit AI output
4. **Download** — PDF (WeasyPrint) or DOCX (python-docx)

## Stack

| Layer | Tech |
|--------|------|
| Frontend | React + Vite + TypeScript |
| UI | Tailwind CSS + shadcn-style Radix components |
| Forms | React Hook Form + Zod |
| Routing | React Router |
| Backend | Python + FastAPI |
| Validation | Pydantic |
| AI | OpenAI API (`gpt-4o-mini` by default) |
| DOCX | python-docx |
| PDF | HTML/CSS + WeasyPrint |
| DB / Auth / Storage (ready) | Supabase PostgreSQL, Auth, Storage |
| Hosting | Frontend → Vercel/Netlify · Backend → Render |

## Quick start

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Set OPENAI_API_KEY, or leave MOCK_AI=true for offline demos
uvicorn app.main:app --reload --port 8000
```

API docs: http://127.0.0.1:8000/docs

### Frontend

```bash
cd frontend
npm install
npm run dev
```

App: http://localhost:5173  
Vite proxies `/api` to the FastAPI server.

## Tests

```bash
cd backend
source .venv/bin/activate
pytest -q
```

```bash
cd frontend
npm run build
npm run lint
```

## Environment

**Backend** (`backend/.env`)

- `OPENAI_API_KEY` — required for live generation
- `OPENAI_MODEL` — default `gpt-4o-mini`
- `MOCK_AI=true` — deterministic mock output (no OpenAI call)
- `CORS_ORIGINS` — comma-separated origins
- `SUPABASE_URL` / `SUPABASE_KEY` — optional; schema in `supabase/schema.sql`

**Frontend** (`frontend/.env`)

- `VITE_API_URL` — leave empty in local dev (uses Vite proxy); set to your Render URL in production

## API

- `POST /api/generate` — profile + job description + options → tailored resume & cover letter JSON
- `POST /api/export` — resume/cover letter JSON → PDF or DOCX file
- `GET /api/health` — health check

## Supabase (next step)

The MVP keeps draft state in the browser (`localStorage`) so you can ship without a database.  
`supabase/schema.sql` defines tables for profiles, generations, and file metadata when you wire Auth + Storage.

## Deploy sketch

1. **Render** — deploy `backend` with `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
2. **Vercel/Netlify** — deploy `frontend` build (`npm run build`), set `VITE_API_URL` to the Render URL
3. Add Render origin to `CORS_ORIGINS`
