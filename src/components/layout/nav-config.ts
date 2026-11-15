import {
  BarChart3, Building2, CalendarCheck2, CalendarDays, CalendarRange, ClipboardList, ClockAlert,
  FileClock, History, LayoutDashboard, Printer, ScrollText, Settings, UserCog, Users, Wallet,
  PlaneTakeoff, MapPin, MapPinned, Banknote, Receipt, PieChart, type LucideIcon,
} from "lucide-react";
import type { AppRole } from "@/lib/types";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}
export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: Record<AppRole, NavGroup[]> = {
  admin: [
    { label: "Overview", items: [{ href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true }] },
    {
      label: "People",
      items: [
        { href: "/admin/employees", label: "Employee Management", icon: Users },
        { href: "/admin/departments", label: "Departments", icon: Building2 },
      ],
    },
    {
      label: "Time & Attendance",
      items: [
        { href: "/admin/attendance", label: "Attendance Management", icon: CalendarCheck2, exact: true },
        { href: "/admin/attendance/history", label: "Attendance History", icon: History },
        { href: "/admin/attendance/corrections", label: "Corrections", icon: FileClock },
        { href: "/admin/attendance/gps", label: "GPS Check-ins", icon: MapPinned },
        { href: "/admin/leave", label: "Leave Management", icon: PlaneTakeoff },
        { href: "/admin/holidays", label: "Holidays & Shifts", icon: CalendarDays },
      ],
    },
    {
      label: "Finance",
      items: [
        { href: "/admin/payroll", label: "Payroll Management", icon: Wallet },
        { href: "/admin/salary-payments", label: "Salary Payments", icon: Banknote },
        { href: "/admin/expenses", label: "Expenses", icon: Receipt },
        { href: "/admin/finance", label: "Cost & Expense Report", icon: PieChart },
      ],
    },
    {
      label: "Reports",
      items: [
        { href: "/admin/reports", label: "Reports & Analytics", icon: BarChart3 },
        { href: "/admin/print-center", label: "Print & PDF Center", icon: Printer },
      ],
    },
    {
      label: "System",
      items: [
        { href: "/admin/users", label: "User Management", icon: UserCog },
        { href: "/admin/audit-logs", label: "Audit Logs", icon: ScrollText },
        { href: "/admin/settings", label: "Company Settings", icon: Settings },
      ],
    },
  ],
  entry: [
    {
      label: "Attendance",
      items: [
        { href: "/entry", label: "Quick Attendance", icon: ClockAlert, exact: true },
        { href: "/entry/today", label: "Today's Overview", icon: CalendarRange },
        { href: "/entry/history", label: "Entry History", icon: History },
        { href: "/entry/corrections", label: "Correction Requests", icon: ClipboardList },
      ],
    },
    { label: "Leave", items: [{ href: "/entry/leave", label: "Leave Applications", icon: PlaneTakeoff }] },
    { label: "Finance", items: [{ href: "/entry/expenses", label: "Daily Expenses", icon: Receipt }] },
  ],
  employee: [
    { label: "My Attendance", items: [{ href: "/me", label: "Check In / Check Out", icon: MapPin, exact: true }] },
  ],
};
