"""API smoke tests for TailorCV generate + export flows."""

from __future__ import annotations

import os

os.environ["MOCK_AI"] = "true"

from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app

get_settings.cache_clear()

client = TestClient(app)

SAMPLE_PROFILE = {
    "full_name": "Alex Rivera",
    "location": "Austin, TX",
    "email": "alex@email.com",
    "phone": "+1 555-010-2030",
    "linkedin_url": "https://linkedin.com/in/alex",
    "summary": "Backend engineer with 5 years experience.",
    "skills": ["Python", "React", "SQL"],
    "experiences": [
        {
            "company": "Acme",
            "role": "Software Engineer",
            "location": "Austin, TX",
            "start_date": "Jan 2021",
            "end_date": "Present",
            "bullets": ["Built APIs with FastAPI", "Improved latency by 30%"],
            "description": "Owned backend services",
        }
    ],
    "education": [
        {
            "school": "UT Austin",
            "degree": "B.S.",
            "field": "Computer Science",
            "location": "Austin, TX",
            "start_date": "2015",
            "end_date": "2019",
            "details": "",
        }
    ],
    "certifications": [{"name": "AWS SAA", "issuer": "Amazon", "date": "2023", "credential_id": "abc"}],
}

SAMPLE_GENERATE = {
    "profile": SAMPLE_PROFILE,
    "job_description": (
        "We are looking for a Senior Backend Engineer with Python, FastAPI, AWS, SQL, "
        "and leadership experience. You will design APIs and mentor juniors."
    ),
    "job_title": "Senior Backend Engineer",
    "company_name": "Nova Labs",
    "options": {
        "resume_length": "one_page",
        "tone": "professional",
        "template": "classic",
        "seniority_level": "senior",
        "prioritize_ats_keywords": True,
    },
}


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_generate_mock():
    r = client.post("/api/generate", json=SAMPLE_GENERATE)
    assert r.status_code == 200
    data = r.json()
    assert data["resume"]["full_name"] == "Alex Rivera"
    assert data["resume"]["headline"]
    assert data["cover_letter"]["signature_name"] == "Alex Rivera"
    assert "python" in data["matched_keywords"]


def test_generate_rejects_short_jd():
    payload = {**SAMPLE_GENERATE, "job_description": "too short"}
    r = client.post("/api/generate", json=payload)
    assert r.status_code == 422


def test_generate_rejects_invalid_email():
    payload = {
        **SAMPLE_GENERATE,
        "profile": {**SAMPLE_PROFILE, "email": "not-an-email"},
    }
    r = client.post("/api/generate", json=payload)
    assert r.status_code == 422


def test_export_resume_and_cover_letter_formats():
    gen = client.post("/api/generate", json=SAMPLE_GENERATE)
    assert gen.status_code == 200
    data = gen.json()

    for document in ("resume", "cover_letter"):
        for fmt in ("docx", "pdf"):
            r = client.post(
                "/api/export",
                json={
                    "resume": data["resume"],
                    "cover_letter": data["cover_letter"],
                    "options": data["options"],
                    "format": fmt,
                    "document": document,
                },
            )
            assert r.status_code == 200, r.text
            assert len(r.content) > 1000


def test_export_cover_letter_requires_body():
    gen = client.post("/api/generate", json=SAMPLE_GENERATE)
    data = gen.json()
    r = client.post(
        "/api/export",
        json={
            "resume": data["resume"],
            "options": data["options"],
            "format": "docx",
            "document": "cover_letter",
        },
    )
    assert r.status_code == 400


def test_export_skips_empty_bullets_in_docx():
    gen = client.post("/api/generate", json=SAMPLE_GENERATE)
    data = gen.json()
    data["resume"]["experiences"][0]["bullets"] = ["Real bullet", "", "  ", "Another"]
    r = client.post(
        "/api/export",
        json={
            "resume": data["resume"],
            "cover_letter": data["cover_letter"],
            "options": data["options"],
            "format": "docx",
            "document": "resume",
        },
    )
    assert r.status_code == 200
    assert len(r.content) > 1000
