import { Link } from "react-router-dom"
import { ArrowRight, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"

export function HomePage() {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-forest via-forest-soft to-moss text-mist shadow-lg">
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, rgba(196,163,90,0.35), transparent 40%), radial-gradient(circle at 80% 60%, rgba(232,240,234,0.12), transparent 35%)",
        }}
      />
      <div className="relative grid gap-10 px-6 py-12 sm:px-10 sm:py-16 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
        <div className="animate-[fadeUp_0.7s_ease-out]">
          <p className="mb-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
            TailorCV
          </p>
          <h1 className="max-w-xl text-xl font-medium leading-snug text-mist/95 sm:text-2xl">
            Turn your profile and a job posting into a tailored resume and cover letter.
          </h1>
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-sage sm:text-base">
            Four focused steps: build your profile, paste the job description, edit the AI draft,
            then download PDF or DOCX.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" variant="gold">
              <Link to="/profile">
                Start with your profile
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-mist/30 bg-transparent text-mist hover:bg-mist/10">
              <Link to="/job">I already have a profile</Link>
            </Button>
          </div>
        </div>

        <div className="animate-[fadeUp_0.9s_ease-out] rounded-xl border border-mist/15 bg-ink/20 p-5 backdrop-blur-sm">
          <div className="mb-3 flex items-center gap-2 text-gold">
            <Sparkles className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">MVP flow</span>
          </div>
          <ol className="space-y-3 text-sm text-mist/90">
            <li className="flex gap-3">
              <span className="font-display text-gold">01</span>
              <span>Profile Builder — contact, experience, education, certifications</span>
            </li>
            <li className="flex gap-3">
              <span className="font-display text-gold">02</span>
              <span>Job Description — length, tone, template, seniority, ATS keywords</span>
            </li>
            <li className="flex gap-3">
              <span className="font-display text-gold">03</span>
              <span>Editor — refine resume and cover letter before export</span>
            </li>
            <li className="flex gap-3">
              <span className="font-display text-gold">04</span>
              <span>Download — PDF via WeasyPrint or DOCX via python-docx</span>
            </li>
          </ol>
        </div>
      </div>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </section>
  )
}
