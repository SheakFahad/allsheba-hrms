import type { Metadata } from "next";
import Link from "next/link";
import { AlarmClock, CalendarCheck2, LogOut, UserX } from "lucide-react";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { AttendanceForm } from "@/components/attendance/attendance-form";
import { DayList } from "@/components/attendance/day-list";
import { requirePageRole } from "@/lib/auth";
import { getActiveEmployees, getSettings, getShifts, toEmployeeOption } from "@/lib/data";
import { getDayOverview } from "@/lib/day-overview";
import { addDays, formatDate, todayISO, weekdayName } from "@/lib/time";

export const metadata: Metadata = { title: "Quick Attendance" };

export default async function EntryHome() {
  const user = await requirePageRole("entry");
  const settings = await getSettings();
  const today = todayISO(settings.timezone);
  const [employees, shifts, overview] = await Promise.all([getActiveEmployees(), getShifts(), getDayOverview(today)]);
  const options = employees.filter((e) => e.status === "active" || e.status === "on_notice").map(toEmployeeOption);
  const c = overview.counts;

  return (
    <>
      <PageHeader
        title="Quick Attendance"
        description={`Welcome, ${user.fullName} · ${weekdayName(today)}, ${formatDate(today)}`}
      />
      {(overview.holidayName || overview.isWeeklyOff) && (
        <div className="mb-5 rounded-lg border border-info/20 bg-info-soft px-4 py-3 text-sm text-info">
          Today is {overview.holidayName ? `a holiday (${overview.holidayName})` : "a weekly off day"}. Record attendance only for employees who are working.
        </div>
      )}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Recorded" value={`${c.recorded} / ${c.expected}`} icon={CalendarCheck2} tone="info" />
        <StatCard label="Present" value={c.present} icon={CalendarCheck2} tone="success" />
        <StatCard label="Late" value={c.late} icon={AlarmClock} tone="warning" />
        <StatCard label="Not recorded" value={c.notRecorded} icon={UserX} tone="neutral" hint={`${c.checkedOut} checked out`} />
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Record attendance</CardTitle>
          </CardHeader>
          <CardContent>
            <AttendanceForm
              mode="entry"
              employees={options}
              shifts={shifts}
              initialDate={today}
              policy={{
                timezone: settings.timezone,
                lateReasonRequired: settings.late_reason_required,
                noteRequiredForOther: settings.late_note_required_for_other,
                flexibleSchedule: settings.flexible_schedule_unassigned ?? true,
                minDate: addDays(today, -settings.entry_backdate_days),
                maxDate: today,
              }}
            />
          </CardContent>
        </Card>
        <Card className="gap-0 pb-0">
          <CardHeader className="border-b pb-4">
            <CardTitle>Today&apos;s overview</CardTitle>
            <CardAction>
              <Button variant="outline" size="sm" asChild><Link href="/entry/today"><LogOut /> Details</Link></Button>
            </CardAction>
          </CardHeader>
          <div className="max-h-[640px] overflow-y-auto">
            <DayList rows={overview.rows} />
          </div>
        </Card>
      </div>
    </>
  );
}
