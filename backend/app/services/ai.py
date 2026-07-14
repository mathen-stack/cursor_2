import json
import logging
from typing import Any

from openai import OpenAI

from app.config import get_settings
from app.models.schemas import (
    CoverLetter,
    GenerateRequest,
    GenerateResponse,
    GeneratedCertification,
    GeneratedEducation,
    GeneratedExperience,
    TailoredResume,
)
from app.services.prompt import SYSTEM_PROMPT, build_user_prompt

logger = logging.getLogger(__name__)


def _mock_response(req: GenerateRequest) -> GenerateResponse:
    p = req.profile
    keywords = []
    jd_lower = req.job_description.lower()
    for token in ["python", "react", "fastapi", "typescript", "aws", "sql", "leadership", "api"]:
        if token in jd_lower:
            keywords.append(token)

    resume = TailoredResume(
        full_name=p.full_name,
        location=p.location,
        email=str(p.email),
        phone=p.phone,
        linkedin_url=p.linkedin_url,
        headline=req.job_title or (p.experiences[0].role if p.experiences else "Professional"),
        summary=(
            p.summary
            or (
                f"{p.full_name.split()[0]} is a {req.options.seniority_level.value}-level professional "
                f"with experience across {', '.join(e.role for e in p.experiences[:2])}. "
                f"Excited to contribute to {req.company_name or 'the team'} with a "
                f"{req.options.tone.value} focus on impact and measurable results."
            )
        ),
        skills=p.skills
        or list(
            {
                *(keywords or ["collaboration", "problem solving"]),
                "communication",
                "stakeholder management",
            }
        ),
        experiences=[
            GeneratedExperience(
                company=e.company,
                role=e.role,
                location=e.location,
                start_date=e.start_date,
                end_date=e.end_date,
                bullets=e.bullets
                or [
                    f"Delivered outcomes aligned to {req.job_title or 'role'} priorities at {e.company}.",
                    f"Collaborated cross-functionally to ship improvements for {req.company_name or 'customers'}.",
                    "Improved process efficiency and documented results for leadership review.",
                ],
            )
            for e in p.experiences
        ],
        education=[
            GeneratedEducation(
                school=ed.school,
                degree=ed.degree,
                field=ed.field,
                location=ed.location,
                start_date=ed.start_date,
                end_date=ed.end_date,
                details=ed.details,
            )
            for ed in p.education
        ],
        certifications=[
            GeneratedCertification(name=c.name, issuer=c.issuer, date=c.date) for c in p.certifications
        ],
    )

    company = req.company_name or "your company"
    role = req.job_title or "this role"
    cover = CoverLetter(
        greeting=f"Dear {company} Hiring Team," if req.company_name else "Dear Hiring Manager,",
        body_paragraphs=[
            (
                f"I am writing to apply for the {role} position"
                f"{f' at {company}' if req.company_name else ''}. "
                f"My background in {p.experiences[0].role if p.experiences else 'my field'} "
                f"maps closely to the needs described in your posting."
            ),
            (
                "In recent roles I have focused on delivering measurable impact, "
                "collaborating across teams, and communicating clearly with stakeholders. "
                f"I would bring a {req.options.tone.value} approach and "
                f"{req.options.seniority_level.value}-level ownership to the work."
            ),
            (
                f"I would welcome the chance to discuss how I can help {company} succeed. "
                "Thank you for your time and consideration."
            ),
        ],
        closing="Sincerely,",
        signature_name=p.full_name,
    )

    return GenerateResponse(
        resume=resume,
        cover_letter=cover,
        matched_keywords=keywords,
        options=req.options,
    )


def _parse_payload(data: dict[str, Any], req: GenerateRequest) -> GenerateResponse:
    resume_data = data.get("resume", data)
    cover_data = data.get("cover_letter", {})
    resume = TailoredResume.model_validate(resume_data)
    # Preserve contact fields from profile if model omitted them
    resume.full_name = resume.full_name or req.profile.full_name
    resume.email = resume.email or str(req.profile.email)
    resume.phone = resume.phone or req.profile.phone
    resume.location = resume.location or req.profile.location
    resume.linkedin_url = resume.linkedin_url or req.profile.linkedin_url

    cover = CoverLetter.model_validate(cover_data) if cover_data else CoverLetter()
    if not cover.signature_name:
        cover.signature_name = req.profile.full_name

    return GenerateResponse(
        resume=resume,
        cover_letter=cover,
        matched_keywords=list(data.get("matched_keywords") or []),
        options=req.options,
    )


def generate_documents(req: GenerateRequest) -> GenerateResponse:
    settings = get_settings()
    if settings.mock_ai or not settings.openai_api_key:
        logger.info("Using mock AI generation (mock_ai=%s, key_set=%s)", settings.mock_ai, bool(settings.openai_api_key))
        return _mock_response(req)

    client = OpenAI(api_key=settings.openai_api_key)
    user_prompt = build_user_prompt(
        profile=req.profile,
        job_description=req.job_description,
        job_title=req.job_title,
        company_name=req.company_name,
        options=req.options,
    )

    completion = client.chat.completions.create(
        model=settings.openai_model,
        temperature=0.4,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
    )
    content = completion.choices[0].message.content or "{}"
    data = json.loads(content)
    return _parse_payload(data, req)
