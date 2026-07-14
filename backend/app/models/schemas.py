from enum import Enum
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, HttpUrl


class ResumeLength(str, Enum):
    one_page = "one_page"
    two_page = "two_page"


class Tone(str, Enum):
    professional = "professional"
    confident = "confident"
    conversational = "conversational"
    executive = "executive"


class TemplateStyle(str, Enum):
    classic = "classic"
    modern = "modern"
    minimal = "minimal"


class SeniorityLevel(str, Enum):
    junior = "junior"
    mid = "mid"
    senior = "senior"
    lead = "lead"
    executive = "executive"


class ExperienceItem(BaseModel):
    company: str = Field(..., min_length=1)
    role: str = Field(..., min_length=1)
    location: str = ""
    start_date: str = Field(..., description="e.g. Jan 2021")
    end_date: str = Field(..., description="e.g. Present or Mar 2024")
    bullets: list[str] = Field(default_factory=list)
    description: str = ""


class EducationItem(BaseModel):
    school: str = Field(..., min_length=1)
    degree: str = Field(..., min_length=1)
    field: str = ""
    location: str = ""
    start_date: str = ""
    end_date: str = ""
    details: str = ""


class CertificationItem(BaseModel):
    name: str = Field(..., min_length=1)
    issuer: str = ""
    date: str = ""
    credential_id: str = ""


class Profile(BaseModel):
    full_name: str = Field(..., min_length=1)
    location: str = ""
    email: EmailStr
    phone: str = ""
    linkedin_url: str = ""
    summary: str = ""
    skills: list[str] = Field(default_factory=list)
    experiences: list[ExperienceItem] = Field(default_factory=list, min_length=1)
    education: list[EducationItem] = Field(default_factory=list, min_length=1)
    certifications: list[CertificationItem] = Field(default_factory=list)


class GenerationOptions(BaseModel):
    resume_length: ResumeLength = ResumeLength.one_page
    tone: Tone = Tone.professional
    template: TemplateStyle = TemplateStyle.classic
    seniority_level: SeniorityLevel = SeniorityLevel.mid
    prioritize_ats_keywords: bool = True


class GenerateRequest(BaseModel):
    profile: Profile
    job_description: str = Field(..., min_length=50)
    job_title: str = ""
    company_name: str = ""
    options: GenerationOptions = Field(default_factory=GenerationOptions)


class GeneratedExperience(BaseModel):
    company: str
    role: str
    location: str = ""
    start_date: str = ""
    end_date: str = ""
    bullets: list[str] = Field(default_factory=list)


class GeneratedEducation(BaseModel):
    school: str
    degree: str
    field: str = ""
    location: str = ""
    start_date: str = ""
    end_date: str = ""
    details: str = ""


class GeneratedCertification(BaseModel):
    name: str
    issuer: str = ""
    date: str = ""


class TailoredResume(BaseModel):
    full_name: str
    location: str = ""
    email: str
    phone: str = ""
    linkedin_url: str = ""
    headline: str = ""
    summary: str
    skills: list[str] = Field(default_factory=list)
    experiences: list[GeneratedExperience] = Field(default_factory=list)
    education: list[GeneratedEducation] = Field(default_factory=list)
    certifications: list[GeneratedCertification] = Field(default_factory=list)


class CoverLetter(BaseModel):
    greeting: str = "Dear Hiring Manager,"
    body_paragraphs: list[str] = Field(default_factory=list)
    closing: str = "Sincerely,"
    signature_name: str = ""


class GenerateResponse(BaseModel):
    resume: TailoredResume
    cover_letter: CoverLetter
    matched_keywords: list[str] = Field(default_factory=list)
    options: GenerationOptions


class ExportRequest(BaseModel):
    resume: TailoredResume
    cover_letter: Optional[CoverLetter] = None
    options: GenerationOptions = Field(default_factory=GenerationOptions)
    format: str = Field(..., pattern="^(pdf|docx)$")
    document: str = Field(..., pattern="^(resume|cover_letter)$")
