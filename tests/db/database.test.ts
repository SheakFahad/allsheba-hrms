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
      "insert into employees (full_name, department_id, joining_date) values ('Rahim Uddin', $1, current_date - 90) returning id",
      [deptId],
    )).rows[0].id;
    empB = (await db.query<{ id: string }>(
      "insert into employees (full_name, department_id, joining_date) values ('Karim Ahmed', $1, current_date - 90) returning id",
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

describe("present without clock times (default shift policy)", () => {
  it("allows Present with no times for default-shift employees and stores no invented times", async () => {
    const d = await daysAgo(6);
    await asUser(db, admin, async () => {
      const r = await db.query<{ status: string; actual_in: string | null; late_minutes: number; work_minutes: number }>(
        "insert into attendance (employee_id, attendance_date, status) values ($1, $2, 'present') returning status, actual_in, late_minutes, work_minutes",
        [empB, d],
      );
      expect(r.rows[0]).toEqual({ status: "present", actual_in: null, late_minutes: 0, work_minutes: 0 });
    });
  });

  it("still requires the in-time for Late, and for everyone when the policy is off", async () => {
    await asUser(db, admin, async () => {
      await expect(
        db.query("insert into attendance (employee_id, attendance_date, status, late_reason) values ($1, $2, 'late', 'traffic_jam')", [empB, await daysAgo(7)]),
      ).rejects.toThrow(/in-time is required/);
      await db.query("update company_settings set present_without_time_default_shift = false where id = 1");
      await expect(
        db.query("insert into attendance (employee_id, attendance_date, status) values ($1, $2, 'present')", [empB, await daysAgo(8)]),
      ).rejects.toThrow(/in-time is required/);
      await db.query("update company_settings set present_without_time_default_shift = true where id = 1");
    });
  });

  it("does not apply when the General (default) shift is explicitly assigned", async () => {
    await asUser(db, admin, async () => {
      const def = (await db.query<{ id: string }>("select id from shifts where is_default")).rows[0].id;
      await db.query("update employees set shift_id = $1 where id = $2", [def, empB]);
      await expect(
        db.query("insert into attendance (employee_id, attendance_date, status) values ($1, $2, 'present')", [empB, await daysAgo(10)]),
      ).rejects.toThrow(/in-time is required/);
      await db.query("update employees set shift_id = null where id = $1", [empB]);
    });
  });

  it("does not apply to employees on a non-default shift", async () => {
    await asUser(db, admin, async () => {
      const sid = (await db.query<{ id: string }>("insert into shifts (name, start_time, end_time) values ('Morning', '08:00', '17:00') returning id")).rows[0].id;
      await db.query("update employees set shift_id = $1 where id = $2", [sid, empB]);
      await expect(
        db.query("insert into attendance (employee_id, attendance_date, status) values ($1, $2, 'present')", [empB, await daysAgo(9)]),
      ).rejects.toThrow(/in-time is required/);
      await db.query("update employees set shift_id = null where id = $1", [empB]);
    });
  });
});
