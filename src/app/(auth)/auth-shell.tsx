import { Logo } from "@/components/brand/logo";
import { ShieldCheck, Clock3, FileBarChart2 } from "lucide-react";

export function AuthShell({
  logoUrl,
  companyName,
  tagline,
  children,
}: {
  logoUrl: string;
  companyName: string;
  tagline: string;
  children: React.ReactNode;
}) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden border-r bg-card p-10 lg:flex">
        <div className="absolute inset-x-0 top-0 h-1 bg-brand" aria-hidden />
        <div className="flex items-center gap-3">
          <Logo src={logoUrl} variant="mark" className="h-9" alt={companyName} />
          <span className="text-sm font-semibold tracking-tight">{companyName}</span>
        </div>
        <div className="max-w-md">
          <Logo src={logoUrl} className="mb-10 h-36" alt={companyName} />
          <h2 className="text-3xl font-semibold tracking-tight">Human Resource Management System</h2>
          <p className="mt-3 text-muted-foreground">
            Attendance, leave, payroll and reports for {companyName} — in one secure place.
          </p>
          <ul className="mt-8 grid gap-3 text-sm">
            <li className="flex items-center gap-3"><Clock3 className="size-4 text-brand" /> Fast daily attendance with late-reason tracking</li>
            <li className="flex items-center gap-3"><FileBarChart2 className="size-4 text-brand" /> Print-ready reports, payslips, PDF &amp; Excel</li>
            <li className="flex items-center gap-3"><ShieldCheck className="size-4 text-brand" /> Role-based access with a complete audit trail</li>
          </ul>
        </div>
        <p className="text-xs text-muted-foreground">{tagline}</p>
      </aside>
      <section className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex justify-center lg:hidden">
            <Logo src={logoUrl} className="h-24" alt={companyName} />
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
