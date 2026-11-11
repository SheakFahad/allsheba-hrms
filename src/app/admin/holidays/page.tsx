import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Clock } from "lucide-react";
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { ToneBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar } from "@/components/shared/filters";
import { DeleteButton, RecordDialog, type FieldDef } from "@/components/shared/record-dialog";
import { requirePageRole } from "@/lib/auth";
import { getHolidays, getSettings, getShifts } from "@/lib/data";
import { WEEKDAY_LABELS } from "@/lib/constants";
import { param } from "@/lib/params";
import { formatDate, formatTime12, toHHMM, todayISO, weekdayName } from "@/lib/time";
import { deleteHoliday, deleteShift, saveHoliday, saveShift } from "../system-actions";

export const metadata: Metadata = { title: "Holidays & Shifts" };

const HOLIDAY_FIELDS: FieldDef[] = [
  { name: "holiday_date", label: "Date", type: "date", required: true },
  { name: "name", label: "Holiday name", type: "text", required: true },
  { name: "kind", label: "Type", type: "select", options: [{ value: "public", label: "Public holiday" }, { value: "company", label: "Company holiday" }, { value: "optional", label: "Optional holiday" }] },
  { name: "notes", label: "Notes", type: "textarea" },
];
const SHIFT_FIELDS: FieldDef[] = [
  { name: "name", label: "Shift name", type: "text", required: true },
  { name: "start_time", label: "Office start", type: "time", required: true },
  { name: "end_time", label: "Office end", type: "time", required: true },
  { name: "grace_minutes", label: "Grace period (minutes)", type: "number", min: 0, max: 240, hint: "Arrivals within the grace period are not late." },
  { name: "is_default", label: "Default shift", type: "switch", hint: "used for employees without a shift" },
  { name: "is_active", label: "Active", type: "switch" },
];

export default async function HolidaysPage({ searchParams }: PageProps<"/admin/holidays">) {
  await requirePageRole("admin");
  const sp = await searchParams;
  const settings = await getSettings();
  const today = todayISO(settings.timezone);
  const year = /^\d{4}$/.test(param(sp, "year") ?? "") ? param(sp, "year")! : today.slice(0, 4);
  const [holidays, shifts] = await Promise.all([getHolidays(`${year}-01-01`, `${year}-12-31`), getShifts()]);

  return (
    <>
      <PageHeader title="Holiday & Shift Management" description="Work calendar used for attendance closing, leave day counting, analytics and payroll." />
      <div className="grid items-start gap-5 xl:grid-cols-[1fr_1.2fr]">
        <div className="grid gap-5">
          <Card className="gap-0 pb-0">
            <CardHeader className="border-b pb-4">
              <CardTitle>Shifts & office hours</CardTitle>
              <CardDescription>Default: 10:00 AM – 7:00 PM. Late is calculated after the grace period.</CardDescription>
              <CardAction>
                <RecordDialog title="New shift" fields={SHIFT_FIELDS} initial={{ id: "", name: "", start_time: "10:00", end_time: "19:00", grace_minutes: "0", is_default: false, is_active: true }} action={saveShift} triggerLabel="Add shift" />
              </CardAction>
            </CardHeader>
            {shifts.length === 0 ? <EmptyState icon={Clock} title="No shifts" /> : (
              <Table>
                <TableHeader><TableRow><TableHead className="pl-4">Shift</TableHead><TableHead>Hours</TableHead><TableHead className="text-right">Grace</TableHead><TableHead /><TableHead className="pr-4" /></TableRow></TableHeader>
                <TableBody>
                  {shifts.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="pl-4 font-medium">{s.name}</TableCell>
                      <TableCell className="tabular">{formatTime12(s.start_time)} – {formatTime12(s.end_time)}</TableCell>
                      <TableCell className="tabular text-right">{s.grace_minutes} min</TableCell>
                      <TableCell>{s.is_default ? <ToneBadge tone="brand">Default</ToneBadge> : !s.is_active ? <ToneBadge tone="neutral">Inactive</ToneBadge> : null}</TableCell>
                      <TableCell className="pr-4">
                        <div className="flex justify-end gap-1">
                          <RecordDialog edit title="Edit shift" fields={SHIFT_FIELDS} initial={{ id: s.id, name: s.name, start_time: toHHMM(s.start_time), end_time: toHHMM(s.end_time), grace_minutes: String(s.grace_minutes), is_default: s.is_default, is_active: s.is_active }} action={saveShift} />
                          {!s.is_default && <DeleteButton id={s.id} label={s.name} action={deleteShift} />}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Weekly holidays</CardTitle>
              <CardDescription>
                {settings.weekly_off_days.length ? settings.weekly_off_days.map((d) => WEEKDAY_LABELS[d]).join(", ") : "None"} ·{" "}
                <Link href="/admin/settings?tab=attendance" className="font-medium text-brand hover:underline">Change in settings</Link>
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
        <Card className="gap-0 pb-0">
          <CardHeader className="border-b pb-4">
            <CardTitle>Public holidays — {year}</CardTitle>
            <CardAction className="flex items-end gap-2">
              <FilterBar filters={[{ type: "select", name: "year", label: "Year", allLabel: today.slice(0, 4), options: [Number(today.slice(0, 4)) - 1, Number(today.slice(0, 4)) + 1].map((y) => ({ value: String(y), label: String(y) })) }]} />
              <RecordDialog title="New holiday" fields={HOLIDAY_FIELDS} initial={{ id: "", holiday_date: today, name: "", kind: "public", notes: "" }} action={saveHoliday} triggerLabel="Add holiday" />
            </CardAction>
          </CardHeader>
          {holidays.length === 0 ? <EmptyState icon={CalendarDays} title={`No holidays for ${year}`} description="Add public and company holidays so they are excluded from working days." /> : (
            <Table>
              <TableHeader><TableRow><TableHead className="pl-4">Date</TableHead><TableHead>Holiday</TableHead><TableHead>Type</TableHead><TableHead className="pr-4" /></TableRow></TableHeader>
              <TableBody>
                {holidays.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="tabular pl-4"><span className="block font-medium">{formatDate(h.holiday_date)}</span><span className="text-xs text-muted-foreground">{weekdayName(h.holiday_date)}</span></TableCell>
                    <TableCell className="font-medium">{h.name}{h.notes && <span className="block text-xs font-normal text-muted-foreground">{h.notes}</span>}</TableCell>
                    <TableCell className="capitalize">{h.kind}</TableCell>
                    <TableCell className="pr-4">
                      <div className="flex justify-end gap-1">
                        <RecordDialog edit title="Edit holiday" fields={HOLIDAY_FIELDS} initial={{ id: h.id, holiday_date: h.holiday_date, name: h.name, kind: h.kind, notes: h.notes ?? "" }} action={saveHoliday} />
                        <DeleteButton id={h.id} label={h.name} action={deleteHoliday} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
