import type { Metadata } from "next";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { ExportButton } from "@/components/shared/export-button";
import { AttendanceTable } from "@/components/attendance/attendance-table";
import { DayList } from "@/components/attendance/day-list";
import { requirePageRole } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { getDayOverview } from "@/lib/day-overview";
import { fetchAttendance } from "@/lib/attendance-data";
import { formatDate, todayISO } from "@/lib/time";
import { AlarmClock, CalendarCheck2, LogOut, UserX, Users } from "lucide-react";

export const metadata: Metadata = { title: "Today's Overview" };

export default async function EntryTodayPage() {
  await requirePageRole("entry");
  const settings = await getSettings();
  const today = todayISO(settings.timezone);
  const [overview, rows] = await Promise.all([getDayOverview(today), fetchAttendance({ from: today, to: today })]);
  const c = overview.counts;
  const missing = overview.rows.filter((r) => !r.record);

  return (
    <>
      <PageHeader
        title="Today's Overview"
        description={formatDate(today)}
        actions={<ExportButton type="daily_attendance" params={{ date: today }} base="/entry/reports/view" />}
      />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Employees" value={c.expected} icon={Users} tone="info" />
        <StatCard label="Present" value={c.present} icon={CalendarCheck2} tone="success" />
        <StatCard label="Late" value={c.late} icon={AlarmClock} tone="warning" />
        <StatCard label="Checked out" value={c.checkedOut} icon={LogOut} tone="brand" />
        <StatCard label="Not recorded" value={c.notRecorded} icon={UserX} tone="neutral" />
      </div>
      <div className="grid gap-5">
        <Card className="gap-0 py-0">
          <AttendanceTable rows={rows} emptyTitle="No attendance recorded yet today" />
        </Card>
        {missing.length > 0 && (
          <Card className="gap-0 pb-0">
            <CardHeader className="border-b pb-4"><CardTitle>Not recorded yet ({missing.length})</CardTitle></CardHeader>
            <DayList rows={missing} />
          </Card>
        )}
      </div>
    </>
  );
}
