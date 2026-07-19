export function SparkMark({ tone = "cyan" }: { tone?: string }) {
  return <span className={`spark spark--${tone}`} aria-hidden="true" />;
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="eyebrow"><SparkMark />{children}</div>;
}
