# Payroll formulas

All payroll is calculated in the database by `public.generate_payroll(year, month)`, so every screen, report and payslip shows the same figures. **Automatic deductions are all OFF by default.** They apply only after an administrator enables them in **Company Settings → Payroll**.

## Inputs (per employee, per month)

| Input | Source |
|-------|--------|
| Basic salary, allowances | Latest `salary_structures` row effective on or before the month end |
| Present / late / half / absent days | `attendance` rows for the month. Absences exist only after attendance closing. |
| Paid / unpaid leave days | Approved `leave_requests`, counted on working days only |
| Overtime minutes | Minutes after scheduled out-time on days with at least the minimum overtime |
| Working days | Calendar days minus weekly off days minus holidays |

Employees without a salary record are **not included**.

## Formulas

```
basis_days   = 30                      (Fixed 30 days)
             | days in month           (Calendar days)
             | working days in month   (Working days)

per_day_rate = (basic + allowances) / basis_days
hourly_rate  = per_day_rate / shift hours

absent_deduction       = absent_days × per_day_rate                    if enabled
unpaid_leave_deduction = unpaid_leave_days × per_day_rate              if enabled
half_day_deduction     = half_days × 0.5 × per_day_rate                if enabled
late_deduction         = floor(late_days / N) × per_day_rate × F       if enabled
                         (N = late days per deduction, F = days deducted)
overtime_amount        = overtime_hours × hourly_rate × multiplier     if enabled

gross      = basic + allowances + bonus + other_earnings + overtime_amount
deductions = absent + unpaid_leave + half_day + late + other_deduction
net        = max(gross − deductions, 0)
```

Bonus, other earnings and other deduction are entered manually on a draft payroll. Recalculating a draft keeps them.

## Finalization

`finalize_payroll()` runs in one transaction. It recalculates the totals and marks the payroll **finalized**. After that:

- every line keeps its snapshot of source values (salary, attendance counts, rates, the rules used);
- the payroll record keeps a full `settings_snapshot`;
- database triggers reject any update or delete of a finalized payroll or its lines, for every user.

## Example

Basic 30,000 + allowances 0, Fixed 30 days → per-day rate 1,000. With absence deduction enabled and 2 absent days: deduction 2,000. With a bonus of 500, net = 30,500 − 2,000 = **28,500**. (This exact case is covered by `tests/db/database.test.ts`.)
