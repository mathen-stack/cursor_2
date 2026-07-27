import type {
  CoverLetter,
  GenerateResponse,
  GenerationOptions,
  Profile,
  TailoredResume,
} from "@/types"

const API_BASE = import.meta.env.VITE_API_URL ?? ""

async function parseError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { detail?: string | { msg: string }[] }
    if (typeof data.detail === "string") return data.detail
    if (Array.isArray(data.detail)) return data.detail.map((d) => d.msg).join(", ")
  } catch {
    /* ignore */
  }
  return res.statusText || "Request failed"
}

export async function generateDocuments(input: {
  profile: Profile
  job_description: string
  job_title: string
  company_name: string
  options: GenerationOptions
}): Promise<GenerateResponse> {
  const res = await fetch(`${API_BASE}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json() as Promise<GenerateResponse>
}

export async function exportDocument(input: {
  resume: TailoredResume
  cover_letter?: CoverLetter
  options: GenerationOptions
  format: "pdf" | "docx"
  document: "resume" | "cover_letter"
}): Promise<Blob> {
  const res = await fetch(`${API_BASE}/api/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.blob()
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
