import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

const FIELD =
  "w-full rounded-xl border border-white/10 bg-ink-900/70 px-3.5 py-2.5 text-sm text-mist-50 placeholder:text-mist-500 transition focus:border-aurora-cyan/60 focus:outline-none focus:ring-2 focus:ring-aurora-cyan/20 disabled:opacity-60 aria-[invalid=true]:border-risk-critical/60";

export function Field({
  label,
  htmlFor,
  hint,
  error,
  optional,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string | null;
  optional?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="flex items-baseline justify-between gap-2 text-sm font-medium text-mist-100">
        <span>{label}</span>
        {optional && <span className="text-xs font-normal text-mist-500">{optional}</span>}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-[#ff8aa0]" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs leading-relaxed text-mist-400">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(FIELD, "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(FIELD, "min-h-28 leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select className={cn(FIELD, "h-10 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%239eaec4%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[position:right_0.8rem_center] bg-no-repeat pr-9", className)} {...props}>
      {children}
    </select>
  );
}

export function Checkbox({ label, className, ...props }: ComponentProps<"input"> & { label: ReactNode }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-mist-200", className)}>
      <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-[#38d5f5]" {...props} />
      <span>{label}</span>
    </label>
  );
}

export function FormMessage({ tone = "error", children }: { tone?: "error" | "success" | "info"; children: ReactNode }) {
  const styles = {
    error: "border-risk-critical/40 bg-risk-critical/10 text-[#ffb3c0]",
    success: "border-aurora-emerald/40 bg-aurora-emerald/10 text-aurora-emerald",
    info: "border-aurora-cyan/30 bg-aurora-cyan/10 text-mist-100",
  };
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("rounded-xl border px-4 py-3 text-sm", styles[tone])}>
      {children}
    </div>
  );
}
