from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape
from weasyprint import HTML

from app.models.schemas import CoverLetter, GenerationOptions, TailoredResume

TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates"
env = Environment(
    loader=FileSystemLoader(str(TEMPLATES_DIR)),
    autoescape=select_autoescape(["html", "xml"]),
)


def _clean_list(items: list[str]) -> list[str]:
    return [str(item).strip() for item in items if item and str(item).strip()]


def build_resume_pdf(resume: TailoredResume, options: GenerationOptions) -> bytes:
    template = env.get_template("resume.html")
    cleaned = resume.model_copy(
        update={
            "skills": _clean_list(resume.skills),
            "experiences": [
                exp.model_copy(update={"bullets": _clean_list(exp.bullets)}) for exp in resume.experiences
            ],
        }
    )
    html = template.render(resume=cleaned, options=options)
    return HTML(string=html).write_pdf()


def build_cover_letter_pdf(letter: CoverLetter, resume: TailoredResume) -> bytes:
    template = env.get_template("cover_letter.html")
    cleaned = letter.model_copy(update={"body_paragraphs": _clean_list(letter.body_paragraphs)})
    html = template.render(letter=cleaned, resume=resume)
    return HTML(string=html).write_pdf()
