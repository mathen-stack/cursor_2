from app.models.schemas import GenerationOptions, Profile


SYSTEM_PROMPT = """You are an expert resume writer and career coach.
You rewrite candidate materials so they align tightly with a target job description.
Always return valid JSON that matches the requested schema exactly.
Never invent employers, degrees, or certifications the candidate did not provide.
You may rephrase, reorder, emphasize, and quantify achievements using the candidate's real experience.
When ATS keyword prioritization is enabled, weave relevant job-description keywords naturally into the summary, skills, and bullets.
Keep language truthful, specific, and free of fluff.
"""


def build_user_prompt(
    profile: Profile,
    job_description: str,
    job_title: str,
    company_name: str,
    options: GenerationOptions,
) -> str:
    length_guide = {
        "one_page": "Target roughly one page: concise summary, 3–5 bullets per recent role, trim older roles.",
        "two_page": "Allow up to two pages: richer bullets and slightly longer summary when warranted.",
    }[options.resume_length.value]

    ats_guide = (
        "Prioritize ATS keywords from the job description; mirror phrasing where accurate."
        if options.prioritize_ats_keywords
        else "Optimize for human readability; include keywords only when they fit naturally."
    )

    experiences = "\n".join(
        [
            f"- {e.role} at {e.company} ({e.start_date} – {e.end_date})"
            f"{f', {e.location}' if e.location else ''}"
            f"\n  Description: {e.description or '(none)'}"
            f"\n  Bullets: {'; '.join(e.bullets) if e.bullets else '(none)'}"
            for e in profile.experiences
        ]
    )
    education = "\n".join(
        [
            f"- {e.degree}{f' in {e.field}' if e.field else ''} at {e.school}"
            f" ({e.start_date} – {e.end_date})"
            for e in profile.education
        ]
    )
    certifications = (
        "\n".join(
            [
                f"- {c.name}"
                f"{f' — {c.issuer}' if c.issuer else ''}"
                f"{f' ({c.date})' if c.date else ''}"
                for c in profile.certifications
            ]
        )
        or "(none)"
    )
    skills = ", ".join(profile.skills) if profile.skills else "(infer relevant skills from experience)"

    return f"""Rewrite this candidate profile into a tailored resume and cover letter.

## Generation options
- Resume length: {options.resume_length.value} — {length_guide}
- Tone: {options.tone.value}
- Template style hint: {options.template.value} (affects wording density, not layout JSON)
- Seniority level to write for: {options.seniority_level.value}
- ATS keywords: {ats_guide}

## Target role
- Job title: {job_title or "(not specified)"}
- Company: {company_name or "(not specified)"}

## Job description
{job_description}

## Candidate profile
- Name: {profile.full_name}
- Location: {profile.location or "(not specified)"}
- Email: {profile.email}
- Phone: {profile.phone or "(not specified)"}
- LinkedIn: {profile.linkedin_url or "(not specified)"}
- Existing summary: {profile.summary or "(none)"}
- Skills: {skills}

### Experience
{experiences}

### Education
{education}

### Certifications
{certifications}

## Output JSON schema
{{
  "resume": {{
    "full_name": "string",
    "location": "string",
    "email": "string",
    "phone": "string",
    "linkedin_url": "string",
    "headline": "string — role-aligned title line",
    "summary": "string — 3–5 sentences",
    "skills": ["string"],
    "experiences": [
      {{
        "company": "string",
        "role": "string",
        "location": "string",
        "start_date": "string",
        "end_date": "string",
        "bullets": ["string — achievement-focused"]
      }}
    ],
    "education": [
      {{
        "school": "string",
        "degree": "string",
        "field": "string",
        "location": "string",
        "start_date": "string",
        "end_date": "string",
        "details": "string"
      }}
    ],
    "certifications": [
      {{
        "name": "string",
        "issuer": "string",
        "date": "string"
      }}
    ]
  }},
  "cover_letter": {{
    "greeting": "string",
    "body_paragraphs": ["string — 3 short paragraphs"],
    "closing": "string",
    "signature_name": "string"
  }},
  "matched_keywords": ["string — keywords from the JD that appear in the tailored materials"]
}}
"""
