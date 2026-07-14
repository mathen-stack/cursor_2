import { NavLink, Outlet } from "react-router-dom"
import { FileText } from "lucide-react"
import { cn } from "@/lib/utils"

const steps = [
  { to: "/profile", label: "Profile", n: 1 },
  { to: "/job", label: "Job", n: 2 },
  { to: "/editor", label: "Editor", n: 3 },
  { to: "/download", label: "Download", n: 4 },
]

export function AppLayout() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-border/80 bg-cream/70 backdrop-blur-md sticky top-0 z-40">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <NavLink to="/" className="flex items-center gap-2.5 group">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-forest text-mist shadow-sm transition group-hover:bg-forest-soft">
              <FileText className="h-4.5 w-4.5" strokeWidth={2.25} />
            </span>
            <span>
              <span className="block font-display text-lg font-semibold leading-none text-forest tracking-tight">
                TailorCV
              </span>
              <span className="text-[11px] text-muted">Resume · Cover letter</span>
            </span>
          </NavLink>

          <nav className="flex items-center gap-1 overflow-x-auto">
            {steps.map((step) => (
              <NavLink
                key={step.to}
                to={step.to}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition sm:text-sm",
                    isActive
                      ? "bg-forest text-mist"
                      : "text-muted hover:bg-mist hover:text-forest",
                  )
                }
              >
                <span
                  className={cn(
                    "hidden h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold sm:inline-flex",
                    "bg-sage/50 text-forest",
                  )}
                >
                  {step.n}
                </span>
                {step.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <Outlet />
      </main>
    </div>
  )
}
