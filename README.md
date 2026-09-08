# Resume Tailor

Web app that extracts structured JD fields via OpenRouter (DeepSeek V4 Flash by default) from pasted job descriptions, and generates ATS-oriented resumes + cover letters as DOCX/PDF packages.

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

3. Run the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Flow

1. Enter your background (contact, experience, education)
2. Paste one or more job descriptions
3. The app extracts each JD and writes a tailored resume + cover letter using **your** background

## Output

For each job (in order):

```
output/
  Company_Name/
    jd.txt
    extracted_jd.txt
    Resume-{FirstName}.docx
    Resume-{FirstName}.pdf
    Coverletter-{FirstName}.docx
    Coverletter-{FirstName}.txt
  Clara-Software Engineer.zip
    ...
```

Each completed job shows an ATS score (/100) in the UI.
Document files use `Resume-{FirstName}` / `Coverletter-{FirstName}`.
Zip files are named `{Company}-{Role}.zip`.
Download links appear after processing.
