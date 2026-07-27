import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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

type Draft = {
  profile: Profile | null
  job: JobInput | null
  options: GenerationOptions
  result: GenerateResponse | null
}

function loadDraft(): Partial<Draft> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Partial<Draft>
  } catch {
    return {}
  }
}

function persist(data: Draft) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function AppProvider({ children }: { children: ReactNode }) {
  const draft = loadDraft()
  const [profile, setProfileState] = useState<Profile | null>(draft.profile ?? null)
  const [job, setJobState] = useState<JobInput | null>(draft.job ?? null)
  const [options, setOptions] = useState<GenerationOptions>(draft.options ?? defaultOptions)
  const [result, setResultState] = useState<GenerateResponse | null>(draft.result ?? null)

  const draftRef = useRef<Draft>({
    profile: draft.profile ?? null,
    job: draft.job ?? null,
    options: draft.options ?? defaultOptions,
    result: draft.result ?? null,
  })

  useEffect(() => {
    draftRef.current = { profile, job, options, result }
  }, [profile, job, options, result])

  const save = useCallback((patch: Partial<Draft>) => {
    const next = { ...draftRef.current, ...patch }
    draftRef.current = next
    persist(next)
  }, [])

  const setProfile = useCallback(
    (p: Profile) => {
      setProfileState(p)
      save({ profile: p })
    },
    [save],
  )

  const setJob = useCallback(
    (j: JobInput, o: GenerationOptions) => {
      setJobState(j)
      setOptions(o)
      save({ job: j, options: o })
    },
    [save],
  )

  const setResult = useCallback(
    (r: GenerateResponse) => {
      setResultState(r)
      setOptions(r.options)
      save({ result: r, options: r.options })
    },
    [save],
  )

  const updateResume = useCallback(
    (resume: TailoredResume) => {
      setResultState((prev) => {
        if (!prev) return prev
        const next = { ...prev, resume }
        save({ result: next })
        return next
      })
    },
    [save],
  )

  const updateCoverLetter = useCallback(
    (cover_letter: CoverLetter) => {
      setResultState((prev) => {
        if (!prev) return prev
        const next = { ...prev, cover_letter }
        save({ result: next })
        return next
      })
    },
    [save],
  )

  const reset = useCallback(() => {
    setProfileState(null)
    setJobState(null)
    setOptions(defaultOptions)
    setResultState(null)
    draftRef.current = {
      profile: null,
      job: null,
      options: defaultOptions,
      result: null,
    }
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  const value = useMemo<AppState>(
    () => ({
      profile,
      job,
      options,
      result,
      setProfile,
      setJob,
      setResult,
      updateResume,
      updateCoverLetter,
      reset,
    }),
    [profile, job, options, result, setProfile, setJob, setResult, updateResume, updateCoverLetter, reset],
  )

  return createElement(AppContext.Provider, { value }, children)
}

export function useAppState() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error("useAppState must be used within AppProvider")
  return ctx
}

export { defaultProfile }
