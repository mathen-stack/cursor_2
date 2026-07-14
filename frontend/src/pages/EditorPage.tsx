import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useAppState } from "@/context/AppState"
import type { CoverLetter, TailoredResume } from "@/types"

export function EditorPage() {
  const navigate = useNavigate()
  const { result, updateResume, updateCoverLetter } = useAppState()

  if (!result) {
    return (
      <div className="rounded-xl border border-border bg-cream/70 p-8 text-center">
        <h1 className="text-2xl font-semibold text-forest">Nothing to edit yet</h1>
        <p className="mt-2 text-sm text-muted">Generate documents from a profile and job description first.</p>
        <Button className="mt-6" onClick={() => navigate("/job")}>
          Go to Job Description
        </Button>
      </div>
    )
  }

  const resume = result.resume
  const letter = result.cover_letter

  const patchResume = (patch: Partial<TailoredResume>) => {
    updateResume({ ...resume, ...patch })
  }

  const patchLetter = (patch: Partial<CoverLetter>) => {
    updateCoverLetter({ ...letter, ...patch })
  }

  return (
    <div className="space-y-8 animate-[fadeUp_0.45s_ease-out]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gold-deep">Step 3</p>
          <h1 className="mt-1 text-3xl font-semibold text-forest">Resume & Cover Letter Editor</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted sm:text-base">
            Tweak the AI draft before you download. Changes are saved in this browser session.
          </p>
        </div>
        <Button onClick={() => navigate("/download")}>Continue to download</Button>
      </div>

      {result.matched_keywords.length > 0 && (
        <div className="rounded-xl border border-sage/80 bg-mist/50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-forest-soft">Matched keywords</p>
          <p className="mt-1 text-sm text-forest">{result.matched_keywords.join(" · ")}</p>
        </div>
      )}

      <section className="space-y-4 rounded-xl border border-border/80 bg-cream/60 p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-forest">Resume</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label className="mb-1.5 block">Full name</Label>
            <Input value={resume.full_name} onChange={(e) => patchResume({ full_name: e.target.value })} />
          </div>
          <div>
            <Label className="mb-1.5 block">Headline</Label>
            <Input value={resume.headline} onChange={(e) => patchResume({ headline: e.target.value })} />
          </div>
          <div>
            <Label className="mb-1.5 block">Email</Label>
            <Input value={resume.email} onChange={(e) => patchResume({ email: e.target.value })} />
          </div>
          <div>
            <Label className="mb-1.5 block">Phone</Label>
            <Input value={resume.phone} onChange={(e) => patchResume({ phone: e.target.value })} />
          </div>
          <div>
            <Label className="mb-1.5 block">Location</Label>
            <Input value={resume.location} onChange={(e) => patchResume({ location: e.target.value })} />
          </div>
          <div>
            <Label className="mb-1.5 block">LinkedIn</Label>
            <Input
              value={resume.linkedin_url}
              onChange={(e) => patchResume({ linkedin_url: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <Label className="mb-1.5 block">Summary</Label>
            <Textarea
              rows={4}
              value={resume.summary}
              onChange={(e) => patchResume({ summary: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <Label className="mb-1.5 block">Skills (comma-separated)</Label>
            <Input
              value={resume.skills.join(", ")}
              onChange={(e) =>
                patchResume({
                  skills: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </div>
        </div>

        <div className="space-y-5 pt-2">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">Experience</h3>
          {resume.experiences.map((exp, i) => (
            <div key={`${exp.company}-${i}`} className="space-y-3 rounded-lg border border-border/60 bg-paper/50 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="mb-1.5 block">Role</Label>
                  <Input
                    value={exp.role}
                    onChange={(e) => {
                      const experiences = [...resume.experiences]
                      experiences[i] = { ...exp, role: e.target.value }
                      patchResume({ experiences })
                    }}
                  />
                </div>
                <div>
                  <Label className="mb-1.5 block">Company</Label>
                  <Input
                    value={exp.company}
                    onChange={(e) => {
                      const experiences = [...resume.experiences]
                      experiences[i] = { ...exp, company: e.target.value }
                      patchResume({ experiences })
                    }}
                  />
                </div>
              </div>
              <div>
                <Label className="mb-1.5 block">Bullets (one per line)</Label>
                <Textarea
                  rows={4}
                  value={exp.bullets.join("\n")}
                  onChange={(e) => {
                    const experiences = [...resume.experiences]
                    experiences[i] = {
                      ...exp,
                      bullets: e.target.value
                        .split("\n")
                        .map((b) => b.trim())
                        .filter(Boolean),
                    }
                    patchResume({ experiences })
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-border/80 bg-cream/60 p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-forest">Cover letter</h2>
        <div>
          <Label className="mb-1.5 block">Greeting</Label>
          <Input value={letter.greeting} onChange={(e) => patchLetter({ greeting: e.target.value })} />
        </div>
        <div>
          <Label className="mb-1.5 block">Body (paragraphs separated by blank lines)</Label>
          <Textarea
            rows={10}
            value={letter.body_paragraphs.join("\n\n")}
            onChange={(e) =>
              patchLetter({
                body_paragraphs: e.target.value
                  .split(/\n\s*\n/)
                  .map((p) => p.trim())
                  .filter(Boolean),
              })
            }
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label className="mb-1.5 block">Closing</Label>
            <Input value={letter.closing} onChange={(e) => patchLetter({ closing: e.target.value })} />
          </div>
          <div>
            <Label className="mb-1.5 block">Signature</Label>
            <Input
              value={letter.signature_name}
              onChange={(e) => patchLetter({ signature_name: e.target.value })}
            />
          </div>
        </div>
      </section>

      <div className="flex flex-wrap justify-between gap-3">
        <Button type="button" variant="outline" onClick={() => navigate("/job")}>
          Back
        </Button>
        <Button size="lg" onClick={() => navigate("/download")}>
          Continue to download
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
