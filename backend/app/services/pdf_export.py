from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape
from weasyprint import HTML

from app.models.schemas import CoverLetter, GenerationOptions, TailoredResume

TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates"
env = Environment(
    loader=FileSystemLoader(str(TEMPLATES_DIR)),
    autoescape=select_autoescape(["html", "xml"]),
)


def build_resume_pdf(resume: TailoredResume, options: GenerationOptions) -> bytes:
    template = env.get_template("resume.html")
    html = template.render(resume=resume, options=options)
    return HTML(string=html).write_pdf()


def build_cover_letter_pdf(letter: CoverLetter, resume: TailoredResume) -> bytes:
    template = env.get_template("cover_letter.html")
    html = template.render(letter=letter, resume=resume)
    return HTML(string=html).write_pdf()
