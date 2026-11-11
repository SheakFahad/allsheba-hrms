"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FormSection, NativeSelect } from "@/components/shared/field";
import { PhotoUpload } from "@/components/shared/photo-upload";
import { EMPLOYMENT_STATUS_LABELS, EMPLOYMENT_STATUSES, EMPLOYMENT_TYPE_LABELS, EMPLOYMENT_TYPES } from "@/lib/constants";
import { employeeSchema } from "@/lib/validation";
import type { Department, Designation, Shift } from "@/lib/types";
import { formatTime12 } from "@/lib/time";
import { createEmployee, updateEmployee } from "./actions";

const formSchema = employeeSchema.extend({
  basic_salary: z.string().optional(),
  allowances: z.string().optional(),
});
type FormValues = z.input<typeof formSchema>;

export function EmployeeForm({
  mode,
  employeeId,
  defaults,
  departments,
  designations,
  shifts,
  today,
}: {
  mode: "create" | "edit";
  employeeId?: string;
  defaults?: Partial<FormValues>;
  departments: Department[];
  designations: Designation[];
  shifts: Shift[];
  today: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const form = useForm<FormValues, unknown, z.output<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      full_name: "", phone: "", email: "", address: "", date_of_birth: "", national_id: "",
      designation_id: "", department_id: "", shift_id: "", joining_date: today,
      employment_type: "full_time", status: "active", emergency_contact_name: "",
      emergency_contact_phone: "", emergency_contact_relation: "", notes: "", photo_path: "",
      basic_salary: "", allowances: "",
      ...defaults,
    },
  });
  const { register, formState: { errors } } = form;
  const fullName = useWatch({ control: form.control, name: "full_name" });

  const onSubmit = form.handleSubmit((values) => {
    if (mode === "create" && values.basic_salary && Number.isNaN(Number(values.basic_salary))) {
      form.setError("basic_salary", { message: "Enter a number" });
      return;
    }
    startTransition(async () => {
      const res = mode === "create" ? await createEmployee(values) : await updateEmployee({ ...values, id: employeeId });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(mode === "create" ? "Employee added" : "Employee updated");
      router.push(`/admin/employees/${res.data?.id ?? employeeId}`);
      router.refresh();
    });
  });

  const activeDepartments = departments.filter((d) => d.is_active || d.id === defaults?.department_id);
  const activeDesignations = designations.filter((d) => d.is_active || d.id === defaults?.designation_id);

  return (
    <form onSubmit={onSubmit} noValidate>
      <Card>
        <CardContent className="grid gap-6">
          <FormSection title="Basic information" description="Employee ID is generated automatically.">
            <Controller
              control={form.control}
              name="photo_path"
              render={({ field }) => (
                <PhotoUpload
                  value={field.value || null}
                  onChange={(p) => field.onChange(p ?? "")}
                  folder="employees"
                  name={fullName ?? ""}
                />
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" htmlFor="full_name" required error={errors.full_name?.message}>
                <Input id="full_name" aria-invalid={!!errors.full_name} {...register("full_name")} />
              </Field>
              <Field label="Phone number" htmlFor="phone" error={errors.phone?.message}>
                <Input id="phone" inputMode="tel" placeholder="01XXXXXXXXX" {...register("phone")} />
              </Field>
              <Field label="Email" htmlFor="email" error={errors.email?.message}>
                <Input id="email" type="email" {...register("email")} />
              </Field>
              <Field label="Date of birth" htmlFor="date_of_birth" error={errors.date_of_birth?.message}>
                <Input id="date_of_birth" type="date" max={today} {...register("date_of_birth")} />
              </Field>
              <Field label="National ID" htmlFor="national_id" error={errors.national_id?.message}>
                <Input id="national_id" {...register("national_id")} />
              </Field>
              <Field label="Address" htmlFor="address" error={errors.address?.message} className="sm:col-span-2">
                <Textarea id="address" rows={2} {...register("address")} />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Employment">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Department" htmlFor="department_id" error={errors.department_id?.message}>
                <NativeSelect id="department_id" {...register("department_id")}>
                  <option value="">— Not assigned —</option>
                  {activeDepartments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Designation" htmlFor="designation_id" error={errors.designation_id?.message}>
                <NativeSelect id="designation_id" {...register("designation_id")}>
                  <option value="">— Not assigned —</option>
                  {activeDesignations.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Shift" htmlFor="shift_id" hint="Leave empty to use the default office schedule.">
                <NativeSelect id="shift_id" {...register("shift_id")}>
                  <option value="">Default shift</option>
                  {shifts.filter((s) => s.is_active).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({formatTime12(s.start_time)} – {formatTime12(s.end_time)})
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Joining date" htmlFor="joining_date" required error={errors.joining_date?.message}>
                <Input id="joining_date" type="date" {...register("joining_date")} />
              </Field>
              <Field label="Employment type" htmlFor="employment_type" required>
                <NativeSelect id="employment_type" {...register("employment_type")}>
                  {EMPLOYMENT_TYPES.map((t) => <option key={t} value={t}>{EMPLOYMENT_TYPE_LABELS[t]}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Employment status" htmlFor="status" required>
                <NativeSelect id="status" {...register("status")}>
                  {EMPLOYMENT_STATUSES.map((t) => <option key={t} value={t}>{EMPLOYMENT_STATUS_LABELS[t]}</option>)}
                </NativeSelect>
              </Field>
            </div>
          </FormSection>

          {mode === "create" && (
            <FormSection title="Salary" description="Optional now — can be set later from the employee profile. Effective from the joining date.">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Basic salary (BDT)" htmlFor="basic_salary" error={errors.basic_salary?.message}>
                  <Input id="basic_salary" type="number" min={0} step="0.01" inputMode="decimal" {...register("basic_salary")} />
                </Field>
                <Field label="Allowances (BDT)" htmlFor="allowances" error={errors.allowances?.message}>
                  <Input id="allowances" type="number" min={0} step="0.01" inputMode="decimal" {...register("allowances")} />
                </Field>
              </div>
            </FormSection>
          )}

          <FormSection title="Emergency contact">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Name" htmlFor="emergency_contact_name">
                <Input id="emergency_contact_name" {...register("emergency_contact_name")} />
              </Field>
              <Field label="Phone" htmlFor="emergency_contact_phone">
                <Input id="emergency_contact_phone" inputMode="tel" {...register("emergency_contact_phone")} />
              </Field>
              <Field label="Relationship" htmlFor="emergency_contact_relation">
                <Input id="emergency_contact_relation" {...register("emergency_contact_relation")} />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Notes">
            <Textarea rows={3} aria-label="Notes" {...register("notes")} />
          </FormSection>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>Cancel</Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Save />}
              {mode === "create" ? "Add employee" : "Save changes"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
