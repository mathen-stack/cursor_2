import { useState } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useNavigate } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAppState } from "@/context/AppState"
import { generateDocuments } from "@/lib/api"
import { jobFormSchema, type JobFormValues } from "@/lib/schemas"

export function JobPage() {
  const navigate = useNavigate()
  const { profile, job, options, setJob, setResult } = useAppState()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const form = useForm<JobFormValues>({
    resolver: zodResolver(jobFormSchema),
    defaultValues: {
      job_title: job?.job_title ?? "",
      company_name: job?.company_name ?? "",
      job_description: job?.job_description ?? "",
      resume_length: options.resume_length,
      tone: options.tone,
      template: options.template,
      seniority_level: options.seniority_level,
      prioritize_ats_keywords: options.prioritize_ats_keywords,
    },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    if (!profile) {
      navigate("/profile")
      return
    }
    setError(null)
    setLoading(true)
    const nextOptions = {
      resume_length: values.resume_length,
      tone: values.tone,
      template: values.template,
      seniority_level: values.seniority_level,
      prioritize_ats_keywords: values.prioritize_ats_keywords,
    }
    const nextJob = {
      job_title: values.job_title,
      company_name: values.company_name,
      job_description: values.job_description,
    }
    setJob(nextJob, nextOptions)
    try {
      const result = await generateDocuments({
        profile,
        ...nextJob,
        options: nextOptions,
      })
      setResult(result)
      navigate("/editor")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed")
    } finally {
      setLoading(false)
    }
  })

  if (!profile) {
    return (
      <div className="rounded-xl border border-border bg-cream/70 p-8 text-center">
        <h1 className="text-2xl font-semibold text-forest">Add your profile first</h1>
        <p className="mt-2 text-sm text-muted">Generation needs contact, experience, and education.</p>
        <Button className="mt-6" onClick={() => navigate("/profile")}>
          Go to Profile Builder
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-[fadeUp_0.45s_ease-out]">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-gold-deep">Step 2</p>
        <h1 className="mt-1 text-3xl font-semibold text-forest">Job Description</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted sm:text-base">
          Paste the posting and set generation options — length, tone, template, seniority, and ATS
          keyword priority.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <section className="space-y-4 rounded-xl border border-border/80 bg-cream/60 p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5 block">Job title</Label>
              <Input {...form.register("job_title")} placeholder="Senior Backend Engineer" />
            </div>
            <div>
              <Label className="mb-1.5 block">Company</Label>
              <Input {...form.register("company_name")} placeholder="Acme Corp" />
            </div>
          </div>
          <div>
            <Label className="mb-1.5 block">Job description *</Label>
            <Textarea
              {...form.register("job_description")}
              rows={12}
              placeholder="Paste the full job description here…"
              className="min-h-[220px] font-mono text-[13px]"
            />
            {form.formState.errors.job_description && (
              <p className="mt-1 text-xs text-danger">{form.formState.errors.job_description.message}</p>
            )}
          </div>
        </section>

        <section className="space-y-4 rounded-xl border border-border/80 bg-cream/60 p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-forest">Generation options</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Controller
              control={form.control}
              name="resume_length"
              render={({ field }) => (
                <div>
                  <Label className="mb-1.5 block">Resume length</Label>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="one_page">One page</SelectItem>
                      <SelectItem value="two_page">Two pages</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            />
            <Controller
              control={form.control}
              name="tone"
              render={({ field }) => (
                <div>
                  <Label className="mb-1.5 block">Tone</Label>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="professional">Professional</SelectItem>
                      <SelectItem value="confident">Confident</SelectItem>
                      <SelectItem value="conversational">Conversational</SelectItem>
                      <SelectItem value="executive">Executive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            />
            <Controller
              control={form.control}
              name="template"
              render={({ field }) => (
                <div>
                  <Label className="mb-1.5 block">Template</Label>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="classic">Classic</SelectItem>
                      <SelectItem value="modern">Modern</SelectItem>
                      <SelectItem value="minimal">Minimal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            />
            <Controller
              control={form.control}
              name="seniority_level"
              render={({ field }) => (
                <div>
                  <Label className="mb-1.5 block">Seniority level</Label>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="junior">Junior</SelectItem>
                      <SelectItem value="mid">Mid</SelectItem>
                      <SelectItem value="senior">Senior</SelectItem>
                      <SelectItem value="lead">Lead</SelectItem>
                      <SelectItem value="executive">Executive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            />
          </div>
          <Controller
            control={form.control}
            name="prioritize_ats_keywords"
            render={({ field }) => (
              <label className="flex items-start gap-3 rounded-md border border-border/70 bg-mist/40 p-3 cursor-pointer">
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(v) => field.onChange(v === true)}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-medium text-forest">Prioritize ATS keywords</span>
                  <span className="text-xs text-muted">
                    Weave relevant job-description keywords into the summary, skills, and bullets.
                  </span>
                </span>
              </label>
            )}
          />
        </section>

        {error && (
          <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="flex flex-wrap justify-between gap-3">
          <Button type="button" variant="outline" onClick={() => navigate("/profile")}>
            Back
          </Button>
          <Button type="submit" size="lg" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Generating…
              </>
            ) : (
              "Generate tailored documents"
            )}
          </Button>
        </div>
      </form>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
