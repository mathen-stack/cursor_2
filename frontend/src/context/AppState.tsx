import {
  createContext,
  createElement,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import {
  defaultOptions,
  defaultProfile,
  type CoverLetter,
  type GenerateResponse,
  type GenerationOptions,
  type JobInput,
  type Profile,
  type TailoredResume,
} from "@/types"

interface AppState {
  profile: Profile | null
  job: JobInput | null
  options: GenerationOptions
  result: GenerateResponse | null
  setProfile: (profile: Profile) => void
  setJob: (job: JobInput, options: GenerationOptions) => void
  setResult: (result: GenerateResponse) => void
  updateResume: (resume: TailoredResume) => void
  updateCoverLetter: (cover: CoverLetter) => void
  reset: () => void
}

const AppContext = createContext<AppState | null>(null)

const STORAGE_KEY = "tailorcv-draft"

function loadDraft(): Partial<{
  profile: Profile
  job: JobInput
  options: GenerationOptions
  result: GenerateResponse
}> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as ReturnType<typeof loadDraft>
  } catch {
    return {}
  }
}

function persist(data: {
  profile: Profile | null
  job: JobInput | null
  options: GenerationOptions
  result: GenerateResponse | null
}) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function AppProvider({ children }: { children: ReactNode }) {
  const draft = loadDraft()
  const [profile, setProfileState] = useState<Profile | null>(draft.profile ?? null)
  const [job, setJobState] = useState<JobInput | null>(draft.job ?? null)
  const [options, setOptions] = useState<GenerationOptions>(draft.options ?? defaultOptions)
  const [result, setResultState] = useState<GenerateResponse | null>(draft.result ?? null)

  const value = useMemo<AppState>(
    () => ({
      profile,
      job,
      options,
      result,
      setProfile: (p) => {
        setProfileState(p)
        persist({ profile: p, job, options, result })
      },
      setJob: (j, o) => {
        setJobState(j)
        setOptions(o)
        persist({ profile, job: j, options: o, result })
      },
      setResult: (r) => {
        setResultState(r)
        persist({ profile, job, options: r.options, result: r })
      },
      updateResume: (resume) => {
        if (!result) return
        const next = { ...result, resume }
        setResultState(next)
        persist({ profile, job, options, result: next })
      },
      updateCoverLetter: (cover_letter) => {
        if (!result) return
        const next = { ...result, cover_letter }
        setResultState(next)
        persist({ profile, job, options, result: next })
      },
      reset: () => {
        setProfileState(null)
        setJobState(null)
        setOptions(defaultOptions)
        setResultState(null)
        localStorage.removeItem(STORAGE_KEY)
      },
    }),
    [profile, job, options, result],
  )

  return createElement(AppContext.Provider, { value }, children)
}

export function useAppState() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error("useAppState must be used within AppProvider")
  return ctx
}

export { defaultProfile }
