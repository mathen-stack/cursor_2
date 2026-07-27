import type { ReactNode } from "react"
import { useFieldArray, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useNavigate } from "react-router-dom"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { useAppState } from "@/context/AppState"
import { profileFormSchema, type ProfileFormValues } from "@/lib/schemas"
import type { Profile } from "@/types"

function toFormValues(profile: Profile | null): ProfileFormValues {
  if (!profile) {
    return {
      full_name: "",
      location: "",
      email: "",
      phone: "",
      linkedin_url: "",
      summary: "",
      skillsText: "",
      experiences: [
        { company: "", role: "", location: "", start_date: "", end_date: "", description: "", bulletsText: "" },
      ],
      education: [
        { school: "", degree: "", field: "", location: "", start_date: "", end_date: "", details: "" },
      ],
      certifications: [],
    }
  }
  return {
    full_name: profile.full_name,
    location: profile.location,
    email: profile.email,
    phone: profile.phone,
    linkedin_url: profile.linkedin_url,
    summary: profile.summary,
    skillsText: profile.skills.join(", "),
    experiences: profile.experiences.map((e) => ({
      company: e.company,
      role: e.role,
      location: e.location,
      start_date: e.start_date,
      end_date: e.end_date,
      description: e.description,
      bulletsText: e.bullets.join("\n"),
    })),
    education: profile.education,
    certifications: profile.certifications,
  }
}

export function ProfilePage() {
  const navigate = useNavigate()
  const { profile, setProfile } = useAppState()

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: toFormValues(profile),
  })

  const experiences = useFieldArray({ control: form.control, name: "experiences" })
  const education = useFieldArray({ control: form.control, name: "education" })
  const certifications = useFieldArray({ control: form.control, name: "certifications" })

  const onSubmit = form.handleSubmit((values) => {
    const next: Profile = {
      full_name: values.full_name,
      location: values.location,
      email: values.email,
      phone: values.phone,
      linkedin_url: values.linkedin_url,
      summary: values.summary,
      skills: values.skillsText
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean),
      experiences: values.experiences.map((e) => ({
        company: e.company,
        role: e.role,
        location: e.location,
        start_date: e.start_date,
        end_date: e.end_date,
        description: e.description,
        bullets: e.bulletsText
          .split("\n")
          .map((b: string) => b.replace(/^[-•*]\s*/, "").trim())
          .filter(Boolean),
      })),
      education: values.education.map((ed) => ({
        school: ed.school,
        degree: ed.degree,
        field: ed.field,
        location: ed.location,
        start_date: ed.start_date,
        end_date: ed.end_date,
        details: ed.details,
      })),
      certifications: values.certifications.map((c) => ({
        name: c.name,
        issuer: c.issuer,
        date: c.date,
        credential_id: c.credential_id,
      })),
    }
    setProfile(next)
    navigate("/job")
  })

  const err = (path: string) => {
    const parts = path.split(".")
    let cur: unknown = form.formState.errors
    for (const p of parts) {
      if (!cur || typeof cur !== "object") return undefined
      cur = (cur as Record<string, unknown>)[p]
    }
    return (cur as { message?: string } | undefined)?.message
  }

  return (
    <div className="space-y-8 animate-[fadeUp_0.45s_ease-out]">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-gold-deep">Step 1</p>
        <h1 className="mt-1 text-3xl font-semibold text-forest">Profile Builder</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted sm:text-base">
          Enter your contact details, up to several roles, education, and optional certifications.
          This becomes the source of truth for tailored generation.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-8">
        <section className="space-y-4 rounded-xl border border-border/80 bg-cream/60 p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-forest">Contact</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name *" error={err("full_name")}>
              <Input {...form.register("full_name")} placeholder="Alex Rivera" />
            </Field>
            <Field label="Location" error={err("location")}>
              <Input {...form.register("location")} placeholder="Austin, TX" />
            </Field>
            <Field label="Email *" error={err("email")}>
              <Input type="email" {...form.register("email")} placeholder="alex@email.com" />
            </Field>
            <Field label="Phone" error={err("phone")}>
              <Input {...form.register("phone")} placeholder="+1 (555) 010-2030" />
            </Field>
            <Field label="LinkedIn URL" error={err("linkedin_url")} className="sm:col-span-2">
              <Input {...form.register("linkedin_url")} placeholder="https://linkedin.com/in/alex" />
            </Field>
            <Field label="Professional summary" error={err("summary")} className="sm:col-span-2">
              <Textarea {...form.register("summary")} placeholder="Optional baseline summary…" rows={3} />
            </Field>
            <Field label="Skills (comma-separated)" error={err("skillsText")} className="sm:col-span-2">
              <Input {...form.register("skillsText")} placeholder="Python, React, SQL, stakeholder management" />
            </Field>
          </div>
        </section>

        <section className="space-y-4 rounded-xl border border-border/80 bg-cream/60 p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-forest">Experience</h2>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                experiences.append({
                  company: "",
                  role: "",
                  location: "",
                  start_date: "",
                  end_date: "",
                  description: "",
                  bulletsText: "",
                })
              }
            >
              <Plus className="h-4 w-4" /> Add role
            </Button>
          </div>

          <div className="space-y-6">
            {experiences.fields.map((field, index) => (
              <div key={field.id} className="space-y-3">
                {index > 0 && <Separator />}
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-forest-soft">Role {index + 1}</p>
                  {experiences.fields.length > 1 && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => experiences.remove(index)}>
                      <Trash2 className="h-4 w-4" /> Remove
                    </Button>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Company *" error={err(`experiences.${index}.company`)}>
                    <Input {...form.register(`experiences.${index}.company`)} />
                  </Field>
                  <Field label="Role *" error={err(`experiences.${index}.role`)}>
                    <Input {...form.register(`experiences.${index}.role`)} />
                  </Field>
                  <Field label="Location" error={err(`experiences.${index}.location`)}>
                    <Input {...form.register(`experiences.${index}.location`)} />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Start *" error={err(`experiences.${index}.start_date`)}>
                      <Input {...form.register(`experiences.${index}.start_date`)} placeholder="Jan 2021" />
                    </Field>
                    <Field label="End *" error={err(`experiences.${index}.end_date`)}>
                      <Input {...form.register(`experiences.${index}.end_date`)} placeholder="Present" />
                    </Field>
                  </div>
                  <Field label="Description" error={err(`experiences.${index}.description`)} className="sm:col-span-2">
                    <Textarea {...form.register(`experiences.${index}.description`)} rows={2} />
                  </Field>
                  <Field
                    label="Bullets (one per line)"
                    error={err(`experiences.${index}.bulletsText`)}
                    className="sm:col-span-2"
                  >
                    <Textarea
                      {...form.register(`experiences.${index}.bulletsText`)}
                      rows={3}
                      placeholder={"Led X that improved Y by Z%\nOwned A across B and C"}
                    />
                  </Field>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4 rounded-xl border border-border/80 bg-cream/60 p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-forest">Education</h2>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                education.append({
                  school: "",
                  degree: "",
                  field: "",
                  location: "",
                  start_date: "",
                  end_date: "",
                  details: "",
                })
              }
            >
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
          {education.fields.map((field, index) => (
            <div key={field.id} className="grid gap-3 sm:grid-cols-2">
              <Field label="School *" error={err(`education.${index}.school`)}>
                <Input {...form.register(`education.${index}.school`)} />
              </Field>
              <Field label="Degree *" error={err(`education.${index}.degree`)}>
                <Input {...form.register(`education.${index}.degree`)} placeholder="B.S." />
              </Field>
              <Field label="Field" error={err(`education.${index}.field`)}>
                <Input {...form.register(`education.${index}.field`)} placeholder="Computer Science" />
              </Field>
              <Field label="Location" error={err(`education.${index}.location`)}>
                <Input {...form.register(`education.${index}.location`)} />
              </Field>
              <Field label="Start" error={err(`education.${index}.start_date`)}>
                <Input {...form.register(`education.${index}.start_date`)} />
              </Field>
              <Field label="End" error={err(`education.${index}.end_date`)}>
                <Input {...form.register(`education.${index}.end_date`)} />
              </Field>
              {education.fields.length > 1 && (
                <div className="sm:col-span-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => education.remove(index)}>
                    <Trash2 className="h-4 w-4" /> Remove education
                  </Button>
                </div>
              )}
            </div>
          ))}
        </section>

        <section className="space-y-4 rounded-xl border border-border/80 bg-cream/60 p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-forest">Certifications</h2>
              <p className="text-xs text-muted">Optional</p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => certifications.append({ name: "", issuer: "", date: "", credential_id: "" })}
            >
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
          {certifications.fields.length === 0 && (
            <p className="text-sm text-muted">No certifications added.</p>
          )}
          {certifications.fields.map((field, index) => (
            <div key={field.id} className="grid gap-3 sm:grid-cols-2">
              <Field label="Name *" error={err(`certifications.${index}.name`)}>
                <Input {...form.register(`certifications.${index}.name`)} />
              </Field>
              <Field label="Issuer" error={err(`certifications.${index}.issuer`)}>
                <Input {...form.register(`certifications.${index}.issuer`)} />
              </Field>
              <Field label="Date" error={err(`certifications.${index}.date`)}>
                <Input {...form.register(`certifications.${index}.date`)} />
              </Field>
              <div className="flex items-end">
                <Button type="button" variant="ghost" size="sm" onClick={() => certifications.remove(index)}>
                  <Trash2 className="h-4 w-4" /> Remove
                </Button>
              </div>
            </div>
          ))}
        </section>

        <div className="flex justify-end">
          <Button type="submit" size="lg">
            Continue to job description
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

function Field({
  label,
  error,
  children,
  className,
}: {
  label: string
  error?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block">{label}</Label>
      {children}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  )
}
