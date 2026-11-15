import { beforeAll, describe, expect, it } from "vitest";
import { asService, asUser, createDb, createUser, type Db } from "./harness";

let db: Db;
let admin: string;
let entry: string;
let deptId: string;
let empA: string;
let empB: string;

const today = async () =>
  (await db.query<{ d: string }>("select public.local_today()::text as d")).rows[0].d;
const daysAgo = async (n: number) =>
  (await db.query<{ d: string }>(`select (public.local_today() - ${n})::text as d`)).rows[0].d;

beforeAll(async () => {
  db = await createDb();
  admin = await createUser(db, "admin", "admin");
  entry = await createUser(db, "user", "entry");
  await asUser(db, admin, async () => {
    deptId = (await db.query<{ id: string }>("insert into departments (name) values ('Operations') returning id")).rows[0].id;
    // Make every day a working day so tests are independent of the weekday they run on.
    await db.query("update company_settings set weekly_off_days = '{}' where id = 1");
    empA = (await db.query<{ id: string }>(
      "insert into employees (full_name, department_id, joining_date, shift_id) values ('Rahim Uddin', $1, current_date - 90, (select id from shifts where is_default)) returning id",
      [deptId],
    )).rows[0].id;
    empB = (await db.query<{ id: string }>(
      "insert into employees (full_name, department_id, joining_date, shift_id) values ('Karim Ahmed', $1, current_date - 90, (select id from shifts where is_default)) returning id",
      [deptId],
    )).rows[0].id;
  });
}, 120_000);

describe("configuration", () => {
  it("seeds the default 10:00–19:00 shift and settings", async () => {
    const s = await db.query<{ start_time: string; end_time: string }>("select start_time::text, end_time::text from shifts where is_default");
    expect(s.rows[0]).toEqual({ start_time: "10:00:00", end_time: "19:00:00" });
    const c = await db.query<{ max_employees: number; timezone: string }>("select max_employees, timezone from company_settings");
    expect(c.rows[0]).toEqual({ max_employees: 20, timezone: "Asia/Dhaka" });
  });
});

describe("employees", () => {
  it("auto-generates sequential employee IDs", async () => {
    const r = await db.query<{ employee_code: string }>("select employee_code from employees order by employee_code");
    expect(r.rows.map((x) => x.employee_code)).toEqual(["ASL-0001", "ASL-0002"]);
  });

  it("entry users can read the directory but not personal data or salary", async () => {
    await asUser(db, admin, async () => {
      await db.query("insert into employee_personal (employee_id, address) values ($1, 'Dhaka')", [empA]);
      await db.query("insert into salary_structures (employee_id, effective_from, basic_salary, allowances) values ($1, current_date - 90, 30000, 0)", [empA]);
    });
    await asUser(db, entry, async () => {
      expect((await db.query("select * from employees")).rows.length).toBe(2);
      expect((await db.query("select * from employee_personal")).rows.length).toBe(0);
      expect((await db.query("select * from salary_structures")).rows.length).toBe(0);
      await expect(db.query("insert into employees (full_name, joining_date) values ('X Y', current_date)")).rejects.toThrow();
    });
  });

  it("enforces the configurable employee limit", async () => {
    await asUser(db, admin, async () => {
      await db.query("update company_settings set max_employees = 2 where id = 1");
      await expect(
        db.query("insert into employees (full_name, joining_date) values ('Third Person', current_date)"),
      ).rejects.toThrow(/Employee limit reached/);
      await db.query("update company_settings set max_employees = 20 where id = 1");
    });
  });

  it("records designation/department change events", async () => {
    await asUser(db, admin, async () => {
      const d2 = (await db.query<{ id: string }>("insert into departments (name) values ('Sales') returning id")).rows[0].id;
      await db.query("update employees set department_id = $1 where id = $2", [d2, empB]);
      await db.query("update employees set department_id = $1 where id = $2", [deptId, empB]);
      const ev = await db.query("select * from employee_events where employee_id = $1 and event_type = 'department'", [empB]);
      expect(ev.rows.length).toBe(2);
    });
  });
});

describe("attendance", () => {
  it("calculates late minutes, early departure and working hours", async () => {
    const d = await daysAgo(1);
    await asUser(db, admin, async () => {
      const r = await db.query<Record<string, unknown>>(
        `insert into attendance (employee_id, attendance_date, actual_in, actual_out, status, late_reason)
         values ($1, $2, '10:25', '18:30', 'present', 'traffic_jam')
         returning status, late_minutes, early_leave_minutes, work_minutes, scheduled_in::text, scheduled_out::text`,
        [empA, d],
      );
      expect(r.rows[0]).toEqual({
        status: "late", late_minutes: 25, early_leave_minutes: 30, work_minutes: 485,
        scheduled_in: "10:00:00", scheduled_out: "19:00:00",
      });
    });
  });

  it("requires a late reason when policy demands it", async () => {
    const d = await today();
    await asUser(db, entry, async () => {
      await expect(
        db.query("insert into attendance (employee_id, attendance_date, actual_in, status) values ($1, $2, '10:15', 'present')", [empB, d]),
      ).rejects.toThrow(/Late reason is required/);
    });
  });

  it("respects the grace period", async () => {
    const d = await today();
    await asUser(db, admin, async () => {
      await db.query("update shifts set grace_minutes = 10 where is_default");
    });
    await asUser(db, entry, async () => {
      const r = await db.query<{ status: string; late_minutes: number }>(
        "insert into attendance (employee_id, attendance_date, actual_in, status) values ($1, $2, '10:08', 'present') returning status, late_minutes",
        [empB, d],
      );
      expect(r.rows[0]).toEqual({ status: "present", late_minutes: 0 });
    });
    await asUser(db, admin, async () => {
      await db.query("update shifts set grace_minutes = 0 where is_default");
    });
  });

  it("prevents duplicate attendance for the same employee and day", async () => {
    const d = await today();
    await asUser(db, entry, async () => {
      await expect(
        db.query("insert into attendance (employee_id, attendance_date, actual_in, status) values ($1, $2, '09:55', 'present')", [empB, d]),
      ).rejects.toThrow(/attendance_one_per_day|duplicate/);
    });
  });

  it("rejects future dates and stores no times for non-working statuses", async () => {
    await asUser(db, admin, async () => {
      await expect(
        db.query("insert into attendance (employee_id, attendance_date, actual_in, status) values ($1, current_date + 400, '10:00', 'present')", [empA]),
      ).rejects.toThrow(/future/);
      const d = await daysAgo(5);
      const r = await db.query<{ actual_in: string | null }>(
        "insert into attendance (employee_id, attendance_date, actual_in, status) values ($1, $2, '10:00', 'absent') returning actual_in",
        [empA, d],
      );
      expect(r.rows[0].actual_in).toBeNull();
    });
  });

  it("entry operators cannot back-date beyond policy", async () => {
    const d = await daysAgo(3);
    await asUser(db, entry, async () => {
      await expect(
        db.query("insert into attendance (employee_id, attendance_date, actual_in, status) values ($1, $2, '09:50', 'present')", [empB, d]),
      ).rejects.toThrow(/row-level security/);
    });
  });

  it("keeps a full correction history for every edit", async () => {
    const d = await daysAgo(1);
    await asUser(db, admin, async () => {
      await db.query(
        "update attendance set actual_in = '10:05', last_change_reason = 'Biometric log verified' where employee_id = $1 and attendance_date = $2",
        [empA, d],
      );
      const h = await db.query<{ reason: string; before_data: { actual_in: string }; after_data: { actual_in: string } }>(
        "select reason, before_data, after_data from attendance_corrections where employee_id = $1 and kind = 'edit'",
        [empA],
      );
      expect(h.rows[0].reason).toBe("Biometric log verified");
      expect(h.rows[0].before_data.actual_in).toBe("10:25:00");
      expect(h.rows[0].after_data.actual_in).toBe("10:05:00");
    });
  });

  it("supports correction requests reviewed by admin", async () => {
    const d = await today();
    const att = (await db.query<{ id: string }>("select id from attendance where employee_id = $1 and attendance_date = $2", [empB, d])).rows[0].id;
    let reqId = "";
    await asUser(db, entry, async () => {
      reqId = (await db.query<{ id: string }>(
        "insert into attendance_corrections (attendance_id, employee_id, attendance_date, kind, status, reason, proposed_data) values ($1, $2, $3, 'request', 'pending', 'Wrong in-time typed', $4) returning id",
        [att, empB, d, JSON.stringify({ actual_in: "09:58" })],
      )).rows[0].id;
      await expect(db.query("select public.review_correction($1, true)", [reqId])).rejects.toThrow(/Only administrators/);
    });
    await asUser(db, admin, async () => {
      await db.query("select public.review_correction($1, true, 'ok')", [reqId]);
      const a = await db.query<{ actual_in: string; is_locked: boolean; source: string }>("select actual_in::text, is_locked, source from attendance where id = $1", [att]);
      expect(a.rows[0]).toEqual({ actual_in: "09:58:00", is_locked: true, source: "correction" });
    });
    // Locked rows can no longer be edited by the entry operator.
    await asUser(db, entry, async () => {
      const r = await db.query("update attendance set notes = 'x' where id = $1", [att]);
      expect(r.affectedRows).toBe(0);
    });
  });
});

describe("closing & leave", () => {
  it("marks absent only through the closing process and respects approved leave", async () => {
    const d = await daysAgo(2);
    await asUser(db, entry, async () => {
      await db.query(
        "insert into leave_requests (employee_id, leave_type_id, start_date, end_date, reason) select $1, id, $2, $2, 'Fever' from leave_types where code = 'SL'",
        [empB, d],
      );
    });
    const before = await db.query("select * from attendance where attendance_date = $1", [d]);
    expect(before.rows.length).toBe(0);
    await asUser(db, admin, async () => {
      const lr = (await db.query<{ id: string }>("select id from leave_requests where employee_id = $1", [empB])).rows[0].id;
      await db.query("select public.review_leave($1, true, 'Get well')", [lr]);
      const n = (await db.query<{ n: number }>("select public.close_attendance($1::date) as n", [d])).rows[0].n;
      expect(n).toBe(2);
      const rows = await db.query<{ employee_id: string; status: string }>("select employee_id, status from attendance where attendance_date = $1", [d]);
      const byEmp = Object.fromEntries(rows.rows.map((r) => [r.employee_id, r.status]));
      expect(byEmp[empA]).toBe("absent");
      expect(byEmp[empB]).toBe("leave");
    });
    await asUser(db, entry, async () => {
      await expect(db.query("select public.close_attendance($1::date)", [d])).rejects.toThrow(/Only administrators/);
    });
  });

  it("converts closed absences to leave when leave is approved later", async () => {
    const d = await daysAgo(2);
    await asUser(db, admin, async () => {
      const lr = (await db.query<{ id: string }>(
        "insert into leave_requests (employee_id, leave_type_id, start_date, end_date) select $1, id, $2, $2 from leave_types where code = 'CL' returning id",
        [empA, d],
      )).rows[0].id;
      await db.query("select public.review_leave($1, true)", [lr]);
      const r = await db.query<{ status: string }>("select status from attendance where employee_id = $1 and attendance_date = $2", [empA, d]);
      expect(r.rows[0].status).toBe("leave");
    });
  });

  it("rejects overlapping leave and enforces paid balances", async () => {
    const d = await daysAgo(2);
    await asUser(db, admin, async () => {
      await expect(
        db.query("insert into leave_requests (employee_id, leave_type_id, start_date, end_date) select $1, id, $2, $2 from leave_types where code = 'UL'", [empA, d]),
      ).rejects.toThrow(/overlapping/);
      const lr = (await db.query<{ id: string }>(
        "insert into leave_requests (employee_id, leave_type_id, start_date, end_date) select $1, id, $2, $2 from leave_types where code = 'AL' returning id",
        [empA, await daysAgo(10)],
      )).rows[0].id;
      await expect(db.query("select public.review_leave($1, true)", [lr])).rejects.toThrow(/Insufficient/);
    });
  });
});

describe("payroll", () => {
  it("generates payroll with no deductions until configured, then finalizes immutably", async () => {
    const t = await today();
    const [y, m] = t.split("-").map(Number);
    await asUser(db, admin, async () => {
      const id = (await db.query<{ id: string }>("select public.generate_payroll($1, $2) as id", [y, m])).rows[0].id;
      let item = (await db.query<{ net_salary: string; absent_deduction: string }>("select net_salary, absent_deduction from payroll_items where payroll_id = $1 and employee_id = $2", [id, empA])).rows[0];
      expect(Number(item.net_salary)).toBe(30000);
      expect(Number(item.absent_deduction)).toBe(0);

      await db.query("update company_settings set absent_deduction_enabled = true, payroll_day_basis = 'fixed_30' where id = 1");
      await db.query("update payroll_items set bonus = 500 where payroll_id = $1 and employee_id = $2", [id, empA]);
      await db.query("select public.generate_payroll($1, $2)", [y, m]);
      item = (await db.query<{ net_salary: string; absent_deduction: string }>("select net_salary, absent_deduction, bonus from payroll_items where payroll_id = $1 and employee_id = $2", [id, empA])).rows[0];
      const absent = Number((await db.query<{ n: string }>(
        "select count(*) as n from attendance where employee_id = $1 and status = 'absent' and date_trunc('month', attendance_date) = date_trunc('month', current_date)", [empA],
      )).rows[0].n);
      expect(Number(item.absent_deduction)).toBeCloseTo(absent * 1000, 2);
      expect(Number(item.net_salary)).toBeCloseTo(30000 + 500 - absent * 1000, 2);

      await db.query("select public.finalize_payroll($1)", [id]);
      await expect(db.query("update payroll_items set bonus = 1 where payroll_id = $1", [id])).rejects.toThrow(/finalized/);
      await expect(db.query("delete from payroll_records where id = $1", [id])).rejects.toThrow(/finalized/);
      await expect(db.query("select public.generate_payroll($1, $2)", [y, m])).rejects.toThrow(/already finalized/);
    });
    await asUser(db, entry, async () => {
      expect((await db.query("select * from payroll_records")).rows.length).toBe(0);
      await expect(db.query("select public.generate_payroll(2026, 1)")).rejects.toThrow(/Only administrators/);
    });
  });
});

describe("audit & profiles", () => {
  it("writes audit logs visible only to admins", async () => {
    await asUser(db, admin, async () => {
      expect((await db.query("select * from audit_logs")).rows.length).toBeGreaterThan(5);
    });
    await asUser(db, entry, async () => {
      expect((await db.query("select * from audit_logs")).rows.length).toBe(0);
      await expect(db.query("insert into audit_logs (action, entity) values ('x','y')")).rejects.toThrow();
    });
  });

  it("prevents users from escalating their own role", async () => {
    await asUser(db, entry, async () => {
      const r = await db.query("update profiles set role = 'admin' where id = $1", [entry]);
      expect(r.affectedRows).toBe(0);
    });
    await asUser(db, admin, async () => {
      await expect(db.query("update profiles set is_active = false where id = $1", [admin])).rejects.toThrow(/own role/);
    });
  });

  it("allows the service role to close attendance (cron)", async () => {
    const d = await daysAgo(4);
    const n = await asService(db, async () =>
      (await db.query<{ n: number }>("select public.close_attendance($1::date) as n", [d])).rows[0].n,
    );
    expect(n).toBe(2);
  });
});

describe("flexible schedule (employees with no shift set)", () => {
  let flex = "";
  beforeAll(async () => {
    await asUser(db, admin, async () => {
      flex = (await db.query<{ id: string }>(
        "insert into employees (full_name, joining_date) values ('Flexible Person', current_date - 90) returning id",
      )).rows[0].id;
    });
  });

  it("allows Present with no times and stores no schedule", async () => {
    await asUser(db, entry, async () => {
      const r = await db.query<Record<string, unknown>>(
        "insert into attendance (employee_id, attendance_date, status) values ($1, $2, 'present') returning status, is_flexible, scheduled_in, actual_in, late_minutes, work_minutes",
        [flex, await today()],
      );
      expect(r.rows[0]).toEqual({ status: "present", is_flexible: true, scheduled_in: null, actual_in: null, late_minutes: 0, work_minutes: 0 });
    });
  });

  it("records actual in/out and worked hours but never late or early departure", async () => {
    await asUser(db, admin, async () => {
      const r = await db.query<Record<string, unknown>>(
        "insert into attendance (employee_id, attendance_date, actual_in, actual_out, status) values ($1, $2, '11:30', '18:00', 'late') returning status, late_minutes, early_leave_minutes, work_minutes, scheduled_out",
        [flex, await daysAgo(11)],
      );
      expect(r.rows[0]).toEqual({ status: "present", late_minutes: 0, early_leave_minutes: 0, work_minutes: 390, scheduled_out: null });
    });
  });

  it("is closed as absent like everyone else", async () => {
    const d = await daysAgo(12);
    await asUser(db, admin, async () => {
      await db.query("select public.close_attendance($1::date)", [d]);
      const r = await db.query<{ status: string; is_flexible: boolean }>("select status, is_flexible from attendance where employee_id = $1 and attendance_date = $2", [flex, d]);
      expect(r.rows[0]).toEqual({ status: "absent", is_flexible: true });
    });
  });

  it("does not apply when the General shift is explicitly assigned", async () => {
    await asUser(db, admin, async () => {
      await expect(
        db.query("insert into attendance (employee_id, attendance_date, status) values ($1, $2, 'present')", [empB, await daysAgo(13)]),
      ).rejects.toThrow(/in-time is required/);
    });
  });

  it("uses the default schedule again when the policy is turned off", async () => {
    await asUser(db, admin, async () => {
      await db.query("update company_settings set flexible_schedule_unassigned = false where id = 1");
      await expect(
        db.query("insert into attendance (employee_id, attendance_date, status) values ($1, $2, 'present')", [flex, await daysAgo(14)]),
      ).rejects.toThrow(/in-time is required/);
      const r = await db.query<{ scheduled_in: string; late_minutes: number; is_flexible: boolean }>(
        "insert into attendance (employee_id, attendance_date, actual_in, status, late_reason) values ($1, $2, '10:20', 'present', 'traffic_jam') returning scheduled_in::text, late_minutes, is_flexible",
        [flex, await daysAgo(15)],
      );
      expect(r.rows[0]).toEqual({ scheduled_in: "10:00:00", late_minutes: 20, is_flexible: false });
      await db.query("update company_settings set flexible_schedule_unassigned = true where id = 1");
    });
  });
});

describe("per-employee weekly off days", () => {
  let emp = "";
  let offDow = 0;
  beforeAll(async () => {
    await asUser(db, admin, async () => {
      offDow = (await db.query<{ d: number }>("select extract(dow from public.local_today() - 16)::int as d")).rows[0].d;
      emp = (await db.query<{ id: string }>(
        "select public.save_employee(null, $1::jsonb) as id",
        [JSON.stringify({
          full_name: "Weekend Person", joining_date: "2026-01-01", employment_type: "full_time", status: "active",
          shift_id: (await db.query<{ id: string }>("select id::text from shifts where is_default")).rows[0].id,
          weekly_off_days: [offDow], basic_salary: "31000", allowances: "0",
        })],
      )).rows[0].id;
    });
  });

  it("stores the employee's own weekly off days via save_employee", async () => {
    const r = await db.query<{ w: number[] }>("select weekly_off_days as w from employees where id = $1", [emp]);
    expect(r.rows[0].w).toEqual([offDow]);
  });

  it("closing marks the employee's own off day as Weekly Off (company default has none)", async () => {
    const d = await daysAgo(16);
    await asUser(db, admin, async () => {
      await db.query("select public.close_attendance($1::date)", [d]);
      const r = await db.query<{ status: string }>("select status from attendance where employee_id = $1 and attendance_date = $2", [emp, d]);
      expect(r.rows[0].status).toBe("weekly_off");
      const other = await db.query<{ status: string }>("select status from attendance where employee_id = $1 and attendance_date = $2", [empA, d]);
      expect(other.rows[0].status).toBe("absent");
    });
  });

  it("excludes the employee's off days when counting leave days", async () => {
    await asUser(db, admin, async () => {
      const r = await db.query<{ days: string }>(
        "insert into leave_requests (employee_id, leave_type_id, start_date, end_date) select $1, id, $2, $3 from leave_types where code = 'UL' returning days",
        [emp, await daysAgo(30), await daysAgo(24)],
      );
      expect(Number(r.rows[0].days)).toBe(6); // 7 calendar days − 1 own weekly off
    });
  });

  it("payroll working days follow the employee's weekly off days", async () => {
    await asUser(db, admin, async () => {
      const prev = (await db.query<{ y: number; m: number; days: number; offs: number }>(
        `select extract(year from d)::int y, extract(month from d)::int m,
                extract(day from (d + interval '1 month - 1 day'))::int days,
                (select count(*)::int from generate_series(d, d + interval '1 month - 1 day', interval '1 day') g(x) where extract(dow from g.x) = $1) offs
           from (select date_trunc('month', public.local_today() - interval '1 month')::date d) t`, [offDow],
      )).rows[0];
      const id = (await db.query<{ id: string }>("select public.generate_payroll($1, $2) as id", [prev.y, prev.m])).rows[0].id;
      const item = await db.query<{ working_days: number }>("select working_days from payroll_items where payroll_id = $1 and employee_id = $2", [id, emp]);
      expect(item.rows[0].working_days).toBe(prev.days - prev.offs);
    });
  });
});

describe("GPS self-service attendance", () => {
  const OFFICE = { lat: 23.780887, lng: 90.407249 };      // office (Dhaka)
  const NEAR = { lat: 23.781200, lng: 90.407400 };         // ~38 m away
  const FAR = { lat: 23.790000, lng: 90.407249 };          // ~1 km away
  let gpsEmp = "";
  let empUser = "";
  const selfCall = (kind: string, loc: { lat: number; lng: number } | null, acc: number | null) =>
    db.query<{ r: Record<string, unknown> }>(
      "select public.self_attendance($1, $2, $3, $4, 'traffic_jam', null) as r",
      [kind, loc?.lat ?? null, loc?.lng ?? null, acc],
    ).then((x) => x.rows[0].r);

  beforeAll(async () => {
    await asUser(db, admin, async () => {
      await db.query("update company_settings set office_latitude = $1, office_longitude = $2, office_radius_m = 100, gps_max_accuracy_m = 50, gps_required = true where id = 1", [OFFICE.lat, OFFICE.lng]);
      gpsEmp = (await db.query<{ id: string }>(
        "insert into employees (full_name, joining_date, shift_id) values ('Gps Person', current_date - 90, (select id from shifts where is_default)) returning id",
      )).rows[0].id;
    });
    const u = await db.query<{ id: string }>("insert into auth.users (email) values ('gps@hrms.local') returning id");
    empUser = u.rows[0].id;
    await db.query("insert into profiles (id, username, full_name, role, employee_id, must_change_password) values ($1, 'gpsperson', 'Gps Person', 'employee', $2, false)", [empUser, gpsEmp]);
  });

  it("records the office location change history (old + new + who)", async () => {
    const r = await db.query<{ changed_by: string; new_values: { office_radius_m: number } }>("select changed_by, new_values from office_location_history order by id desc limit 1");
    expect(r.rows[0].changed_by).toBe(admin);
    expect(r.rows[0].new_values.office_radius_m).toBe(100);
  });

  it("rejects check-in outside the radius and logs the attempt", async () => {
    await asUser(db, empUser, async () => {
      const r = await selfCall("check_in", FAR, 10);
      expect(r).toMatchObject({ ok: false, result: "outside_radius" });
      expect(Number(r.distance_m)).toBeGreaterThan(900);
      const ev = await db.query("select * from attendance_geo_events where result = 'outside_radius'");
      expect(ev.rows.length).toBe(1);
      expect((await db.query("select * from attendance where employee_id = $1", [gpsEmp])).rows.length).toBe(0);
    });
  });

  it("asks for a retry when accuracy is too low", async () => {
    await asUser(db, empUser, async () => {
      expect(await selfCall("check_in", NEAR, 300)).toMatchObject({ ok: false, result: "low_accuracy" });
    });
  });

  it("requires a location when GPS verification is on", async () => {
    await asUser(db, empUser, async () => {
      await expect(selfCall("check_in", null, null)).rejects.toThrow(/Location is required/);
    });
  });

  it("accepts check-in inside the radius with server time, then blocks a duplicate", async () => {
    await asUser(db, empUser, async () => {
      const r = await selfCall("check_in", NEAR, 12);
      expect(r).toMatchObject({ ok: true, result: "accepted", gps_verified: true });
      expect(Number(r.distance_m)).toBeLessThan(100);
      const a = await db.query<{ entry_method: string; actual_in: string }>("select entry_method, actual_in::text from attendance where employee_id = $1", [gpsEmp]);
      expect(a.rows[0].entry_method).toBe("self_gps");
      expect(await selfCall("check_in", NEAR, 12)).toMatchObject({ ok: false, result: "duplicate" });
    });
  });

  it("only shows the employee their own data", async () => {
    await asUser(db, empUser, async () => {
      expect((await db.query("select * from employees")).rows.length).toBe(0);
      const rows = await db.query<{ employee_id: string }>("select employee_id from attendance");
      expect(rows.rows.every((x) => x.employee_id === gpsEmp)).toBe(true);
      expect((await db.query("select * from payroll_items")).rows.length).toBe(0);
      expect((await db.query("select * from audit_logs")).rows.length).toBe(0);
    });
  });

  it("entry operators cannot edit a GPS-verified record", async () => {
    await asUser(db, entry, async () => {
      const r = await db.query("update attendance set notes = 'x' where employee_id = $1", [gpsEmp]);
      expect(r.affectedRows).toBe(0);
    });
  });

  it("accepts check-out inside the radius", async () => {
    await db.query("update attendance set actual_in = '00:00' where employee_id = $1", [gpsEmp]); // simulate an earlier check-in
    await asUser(db, empUser, async () => {
      const r = await selfCall("check_out", NEAR, 20);
      expect(r).toMatchObject({ ok: true, result: "accepted" });
      expect(await selfCall("check_out", NEAR, 20)).toMatchObject({ ok: false, result: "duplicate" });
    });
  });

  it("works without location when the admin turns GPS verification off (marked as not GPS-verified)", async () => {
    await asUser(db, admin, async () => {
      await db.query("update company_settings set gps_required = false where id = 1");
      await db.query("delete from attendance where employee_id = $1", [gpsEmp]);
    });
    await asUser(db, empUser, async () => {
      const r = await selfCall("check_in", null, null);
      expect(r).toMatchObject({ ok: true, gps_verified: false });
      const a = await db.query<{ entry_method: string }>("select entry_method from attendance where employee_id = $1", [gpsEmp]);
      expect(a.rows[0].entry_method).toBe("self");
    });
    await asUser(db, admin, async () => {
      await db.query("update company_settings set gps_required = true where id = 1");
    });
  });

  it("does not let staff-only users call self-service or employees act as staff", async () => {
    await asUser(db, admin, async () => {
      await expect(selfCall("check_in", NEAR, 10)).rejects.toThrow(/not linked/);
    });
    await asUser(db, empUser, async () => {
      await expect(db.query("select public.close_attendance(current_date - 1)")).rejects.toThrow(/Only administrators/);
    });
  });
});

describe("expenses, salary payments and vouchers", () => {
  const month = async () => (await db.query<{ d: string }>("select date_trunc('month', public.local_today())::date::text as d")).rows[0].d;
  const cat = async (name: string) => (await db.query<{ id: string }>("select id from expense_categories where name = $1", [name])).rows[0].id;

  it("seeds expense categories", async () => {
    const r = await db.query<{ n: number }>("select count(*)::int as n from expense_categories");
    expect(r.rows[0].n).toBeGreaterThanOrEqual(10);
  });

  it("entry operators need an explicit grant", async () => {
    const c = await cat("Office Supplies");
    await asUser(db, entry, async () => {
      await expect(
        db.query("insert into expenses (expense_kind, category_id, expense_date, payee_name, amount) values ('daily', $1, current_date, 'Shop', 100)", [c]),
      ).rejects.toThrow(/row-level security/);
    });
    await db.query("update profiles set can_manage_expenses = true where id = $1", [entry]);
  });

  it("granted operators record pending expenses with a unique voucher number but cannot confirm", async () => {
    const c = await cat("Office Supplies");
    let id = "";
    await asUser(db, entry, async () => {
      const r = await db.query<{ id: string; voucher_no: string; status: string }>(
        "insert into expenses (expense_kind, category_id, expense_date, payee_name, amount, status) values ('daily', $1, current_date, 'Stationery shop', 450, 'confirmed') returning id, voucher_no, status",
        [c],
      );
      id = r.rows[0].id;
      expect(r.rows[0].status).toBe("pending"); // forced
      expect(r.rows[0].voucher_no).toMatch(/^EXP-\d{4}-\d{5}$/);
      await expect(db.query("select public.set_expense_status($1, 'confirmed')", [id])).rejects.toThrow(/Only administrators/);
      expect((await db.query("select * from salary_payments")).rows.length).toBe(0);
    });
    await asUser(db, admin, async () => {
      await db.query("select public.set_expense_status($1, 'confirmed')", [id]);
      await expect(db.query("update expenses set amount = 1 where id = $1", [id])).rejects.toThrow(/confirmed expense cannot be changed/);
      const a = await db.query("select * from audit_logs where entity = 'expenses' and entity_id = $1", [id]);
      expect(a.rows.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("prevents duplicate monthly expenses for the same category and period", async () => {
    const c = await cat("Office Rent");
    const m = await month();
    await asUser(db, admin, async () => {
      const ins = () => db.query(
        "insert into expenses (expense_kind, category_id, expense_date, period_start, period_end, payee_name, amount) values ('monthly', $1, current_date, $2::date, ($2::date + interval '1 month - 1 day')::date, 'Landlord', 25000) returning id",
        [c, m],
      );
      const first = (await ins()).rows[0] as { id: string };
      await expect(ins()).rejects.toThrow(/expenses_monthly_unique|duplicate/);
      await db.query("select public.set_expense_status($1, 'cancelled', 'Entered twice')", [first.id]);
      await ins(); // allowed after cancelling
    });
  });

  it("tracks partial salary payments and blocks paying more than the salary", async () => {
    const m = await month();
    await asUser(db, entry, async () => {
      await expect(
        db.query("insert into salary_payments (employee_id, employee_code, employee_name, salary_month, amount, payment_date) values ($1, 'x', 'x', $2, 100, current_date)", [empA, m]),
      ).rejects.toThrow();
    });
    await asUser(db, admin, async () => {
      const p1 = (await db.query<{ id: string; voucher_no: string; employee_name: string; configured_salary: string }>(
        "insert into salary_payments (employee_id, employee_code, employee_name, salary_month, amount, payment_date, payment_method) values ($1, '', '', $2, 10000, current_date, 'cash') returning id, voucher_no, employee_name, configured_salary",
        [empA, m],
      )).rows[0];
      expect(p1.voucher_no).toMatch(/^SAL-\d{4}-\d{5}$/);
      expect(p1.employee_name).toBe("Rahim Uddin");
      expect(Number(p1.configured_salary)).toBe(30000);

      let st = (await db.query<{ status: string; paid: string; pending: string }>("select status, paid, pending from public.salary_payment_status($1) where employee_id = $2", [m, empA])).rows[0];
      expect(st).toMatchObject({ status: "pending" }); // recorded but not confirmed: nothing paid yet
      await db.query("select public.set_salary_payment_status($1, 'confirmed')", [p1.id]);
      st = (await db.query<{ status: string; paid: string; pending: string }>("select status, paid, pending from public.salary_payment_status($1) where employee_id = $2", [m, empA])).rows[0];
      expect(st.status).toBe("partially_paid");
      expect(Number(st.paid)).toBe(10000);

      const p2 = (await db.query<{ id: string }>(
        "insert into salary_payments (employee_id, employee_code, employee_name, salary_month, amount, payment_date) values ($1, '', '', $2, 20000, current_date) returning id",
        [empA, m],
      )).rows[0];
      await expect(
        db.query("insert into salary_payments (employee_id, employee_code, employee_name, salary_month, amount, payment_date) values ($1, '', '', $2, 1, current_date)", [empA, m]),
      ).rejects.toThrow(/full salary for this month is already recorded/);
      await db.query("select public.set_salary_payment_status($1, 'confirmed')", [p2.id]);
      st = (await db.query<{ status: string; paid: string; pending: string }>("select status, paid from public.salary_payment_status($1) where employee_id = $2", [m, empA])).rows[0];
      expect(st.status).toBe("paid");
      await expect(db.query("update salary_payments set amount = 5 where id = $1", [p2.id])).rejects.toThrow(/cannot be changed/);
    });
  });

  it("employees have no access to expenses or salary payments", async () => {
    const u = (await db.query<{ id: string }>("select id from profiles where role = 'employee' limit 1")).rows[0]?.id;
    if (!u) return;
    await asUser(db, u, async () => {
      expect((await db.query("select * from expenses")).rows.length).toBe(0);
      expect((await db.query("select * from salary_payments")).rows.length).toBe(0);
      expect((await db.query("select * from public.salary_payment_status(current_date)")).rows.length).toBe(0);
    });
  });
});
