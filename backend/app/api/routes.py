from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from app.models.schemas import ExportRequest, GenerateRequest, GenerateResponse
from app.services import ai, docx_export, pdf_export

router = APIRouter(prefix="/api")


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/generate", response_model=GenerateResponse)
def generate(req: GenerateRequest) -> GenerateResponse:
    try:
        return ai.generate_documents(req)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Generation failed: {exc}") from exc


@router.post("/export")
def export_document(req: ExportRequest) -> Response:
    try:
        if req.document == "resume":
            if req.format == "docx":
                content = docx_export.build_resume_docx(req.resume, req.options)
                media = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                filename = "tailored_resume.docx"
            else:
                content = pdf_export.build_resume_pdf(req.resume, req.options)
                media = "application/pdf"
                filename = "tailored_resume.pdf"
        else:
            if not req.cover_letter:
                raise HTTPException(status_code=400, detail="cover_letter is required")
            if req.format == "docx":
                content = docx_export.build_cover_letter_docx(req.cover_letter, req.resume)
                media = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                filename = "cover_letter.docx"
            else:
                content = pdf_export.build_cover_letter_pdf(req.cover_letter, req.resume)
                media = "application/pdf"
                filename = "cover_letter.pdf"
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Export failed: {exc}") from exc

    return Response(
        content=content,
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
