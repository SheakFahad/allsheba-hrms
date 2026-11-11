# ALL SHEBA HRMS

Human Resource Management System for **All Sheba Limited**. It has two panels that share one secure database:

- **Admin panel:** dashboard, employees, attendance and corrections, attendance history and analytics, leave, payroll, reports, the Print & PDF center, users, departments, holidays and shifts, audit logs and company settings.
- **Entry panel:** quick attendance with late-reason tracking, today's overview, entry history, correction requests and leave applications.

## Tech stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui · Supabase (Postgres, Auth, Storage, RLS) · Zod · React Hook Form · Recharts · jsPDF · ExcelJS · Vitest + PGlite.

## Quick start

```bash
npm install
cp .env.example .env.local      # fill in your Supabase keys
# apply supabase/migrations/* (see docs/SETUP.md)
npm run provision               # creates admin + user accounts
npm run dev                     # http://localhost:3000
```

## Scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run typecheck` | Route type generation + TypeScript |
| `npm run lint` | ESLint |
| `npm test` | Database tests (migrations, triggers, RLS, payroll) and unit tests |
| `npm run check` | All of the above + production build |
| `npm run provision` | One-time creation of the initial accounts |

## Documentation

- [Setup](docs/SETUP.md): Supabase project, migrations, environment variables, first accounts
- [Deployment](docs/DEPLOYMENT.md): GitHub, Vercel, cron, production checklist
- [Architecture](docs/ARCHITECTURE.md): ERD, permission matrix, folder structure, report engine
- [Payroll formulas](docs/PAYROLL.md)
- [Development status](DEVELOPMENT_STATUS.md) · [Changelog](CHANGELOG.md)

## Security

- No passwords or keys are stored in the source code. Initial passwords come from environment variables and are used only by `npm run provision`.
- The service-role key is server-only. It is used only after an admin check, for user administration and the cron job.
- Row-level security is enabled on every table. Entry operators cannot read salary, payroll, personal details, documents or audit logs, even through the API.
- Attendance, payroll, settings and user changes are written to an append-only audit log. So are sign-ins and report exports.
