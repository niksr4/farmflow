import { cn } from "@/lib/utils"

type EmptyStateProps = {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
  className?: string
  size?: "sm" | "md" | "lg"
}

export function EmptyState({ icon, title, description, action, className, size = "md" }: EmptyStateProps) {
  const sizeConfig = {
    sm: { wrapper: "py-8", iconBox: "w-10 h-10 mb-3", iconSize: "w-5 h-5", title: "text-sm font-medium", desc: "text-xs mt-1", btn: "text-xs px-3 py-1.5 mt-3" },
    md: { wrapper: "py-12", iconBox: "w-12 h-12 mb-4", iconSize: "w-6 h-6", title: "text-sm font-semibold", desc: "text-sm mt-1.5", btn: "text-sm px-4 py-2 mt-4" },
    lg: { wrapper: "py-16", iconBox: "w-16 h-16 mb-5", iconSize: "w-7 h-7", title: "text-base font-semibold", desc: "text-sm mt-2", btn: "text-sm px-5 py-2.5 mt-5" },
  }
  const s = sizeConfig[size]

  return (
    <div className={cn("flex flex-col items-center justify-center text-center", s.wrapper, className)}>
      {icon && (
        <div className={cn("rounded-2xl bg-stone-100 flex items-center justify-center text-stone-400", s.iconBox)}>
          <span className={s.iconSize}>{icon}</span>
        </div>
      )}
      <p className={cn("text-stone-700", s.title)}>{title}</p>
      {description && <p className={cn("text-stone-400 max-w-xs leading-relaxed", s.desc)}>{description}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className={cn("rounded-xl bg-emerald-700 text-white font-medium hover:bg-emerald-800 transition-colors", s.btn)}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

// Pre-wired icons for common empty states

export function EmptyStateTable(props: Omit<EmptyStateProps, "icon">) {
  return (
    <EmptyState
      {...props}
      icon={
        <svg className="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-3.75.125V6a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0120.25 6v12.375m-18.75 0V6m18.75 13.5V6m0 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6m17.25 0v12.375" />
        </svg>
      }
    />
  )
}

export function EmptyStateSearch(props: Omit<EmptyStateProps, "icon">) {
  return (
    <EmptyState
      {...props}
      icon={
        <svg className="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803 7.5 7.5 0 0015.803 15.803z" />
        </svg>
      }
    />
  )
}

export function EmptyStateChart(props: Omit<EmptyStateProps, "icon">) {
  return (
    <EmptyState
      {...props}
      icon={
        <svg className="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        </svg>
      }
    />
  )
}
