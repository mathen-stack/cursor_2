# Resume Tailor

Web app that scrapes job links, extracts structured JD fields via OpenRouter (DeepSeek V4 Flash by default), and generates ATS-oriented resumes + cover letters as DOCX/PDF packages.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy env and add your OpenRouter key:

```bash
cp .env.example .env.local
```

Set `OPENROUTER_API_KEY` from [openrouter.ai/keys](https://openrouter.ai/keys).  
Default model is `deepseek/deepseek-v4-flash` (override with `OPENROUTER_MODEL`).  
Set `AUTH_SECRET` to a long random string in production (session cookies).

3. Run the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign up, then fill **Profile** before generating packages.

Accounts and profiles are stored in `data/app.json` on the server (local/dev). This file is not committed.

## Flow

1. Create an account (email + password) or sign in
2. Enter your profile: name, headline, contact, work history, education
3. Paste job URLs (one per line)
4. The app scrapes each posting in parallel, extracts the JD, and writes a tailored resume + cover letter from **your** saved profile

## Output

For each job link (in order):

```
output/
  Company_Name/
    jd.txt
    extracted_jd.txt
    Resume-{FirstName}.docx
    Resume-{FirstName}.pdf
    Coverletter-{FirstName}.docx
    Coverletter-{FirstName}.txt
  Company-Role.zip
    ...
```

Each completed job shows an ATS score (/100) in the UI.
Document files use `Resume-{FirstName}` / `Coverletter-{FirstName}`.
Zip files are named `{Company}-{Role}.zip`.
Download links appear after processing.
