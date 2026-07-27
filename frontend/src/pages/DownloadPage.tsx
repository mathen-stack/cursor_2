import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Download, FileText, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAppState } from "@/context/AppState"
import { downloadBlob, exportDocument } from "@/lib/api"

type DocKind = "resume" | "cover_letter"
type Fmt = "pdf" | "docx"

export function DownloadPage() {
  const navigate = useNavigate()
  const { result, options, reset } = useAppState()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!result) {
    return (
      <div className="rounded-xl border border-border bg-cream/70 p-8 text-center">
        <h1 className="text-2xl font-semibold text-forest">No documents ready</h1>
        <p className="mt-2 text-sm text-muted">Generate and review your materials first.</p>
        <Button className="mt-6" onClick={() => navigate("/job")}>
          Start generation
        </Button>
      </div>
    )
  }

  const handleDownload = async (document: DocKind, format: Fmt) => {
    const key = `${document}-${format}`
    setBusy(key)
    setError(null)
    try {
      const blob = await exportDocument({
        resume: result.resume,
        cover_letter: result.cover_letter,
        options: result.options ?? options,
        format,
        document,
      })
      const name =
        document === "resume"
          ? `tailored_resume.${format}`
          : `cover_letter.${format}`
      downloadBlob(blob, name)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed")
    } finally {
      setBusy(null)
    }
  }

  const cards: { title: string; desc: string; kind: DocKind }[] = [
    {
      title: "Tailored resume",
      desc: "Export the edited resume as PDF (WeasyPrint) or DOCX (python-docx).",
      kind: "resume",
    },
    {
      title: "Cover letter",
      desc: "Export the edited cover letter in the same formats.",
      kind: "cover_letter",
    },
  ]

  return (
    <div className="space-y-8 animate-[fadeUp_0.45s_ease-out]">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-gold-deep">Step 4</p>
        <h1 className="mt-1 text-3xl font-semibold text-forest">Download</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted sm:text-base">
          Grab PDF or DOCX for {result.resume.full_name}. Template style:{" "}
          <span className="text-forest font-medium">{result.options.template}</span>.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {cards.map((card) => (
          <div
            key={card.kind}
            className="rounded-xl border border-border/80 bg-cream/70 p-5 shadow-sm transition hover:border-sage"
          >
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-forest text-mist">
              <FileText className="h-5 w-5" />
            </div>
            <h2 className="font-display text-xl font-semibold text-forest">{card.title}</h2>
            <p className="mt-1 text-sm text-muted">{card.desc}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {(["pdf", "docx"] as Fmt[]).map((format) => {
                const key = `${card.kind}-${format}`
                return (
                  <Button
                    key={key}
                    variant={format === "pdf" ? "default" : "secondary"}
                    disabled={busy !== null}
                    onClick={() => void handleDownload(card.kind, format)}
                  >
                    {busy === key ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    {format.toUpperCase()}
                  </Button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {error && (
        <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap justify-between gap-3 border-t border-border pt-6">
        <Button variant="outline" onClick={() => navigate("/editor")}>
          Back to editor
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            reset()
            navigate("/profile")
          }}
        >
          Start a new application
        </Button>
      </div>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
