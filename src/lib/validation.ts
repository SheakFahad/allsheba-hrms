import { z } from "zod";
import {
  ATTENDANCE_STATUSES, EMPLOYMENT_STATUSES, EMPLOYMENT_TYPES, LATE_REASONS,
} from "./constants";

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date");
export const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Enter a valid time");
export const optionalHHMM = z.union([hhmm, z.literal(""), z.null()]).optional().transform((v) => (v ? v : null));
export const uuid = z.uuid("Invalid identifier");
const trimmed = (max: number) => z.string().trim().max(max);
export const optionalText = (max: number) =>
  // Accepts "", null or undefined as "not provided" (forms may send already-transformed nulls).
  trimmed(max).nullable().optional().transform((v) => (v ? v : null));

export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(72, "Use at most 72 characters")
  .regex(/[A-Za-z]/, "Include at least one letter")
  .regex(/[0-9]/, "Include at least one number");

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9._-]{2,31}$/, "3–32 characters: letters, numbers, dot, dash or underscore");

export const loginSchema = z.object({
  username: z.string().trim().min(1, "Enter your username").max(32),
  password: z.string().min(1, "Enter your password").max(72),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ["newPassword"],
    message: "Choose a password different from the current one",
  });

export const employeeSchema = z.object({
  full_name: z.string().trim().min(2, "Enter the full name").max(120),
  phone: z
    .string()
    .trim()
    .max(20)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^[0-9+() -]{6,20}$/.test(v), "Enter a valid phone number"),
  email: z
    .string()
    .trim()
    .max(120)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || z.email().safeParse(v).success, "Enter a valid email"),
  address: optionalText(500),
  date_of_birth: z.union([isoDate, z.literal(""), z.null()]).optional().transform((v) => (v ? v : null)),
  national_id: optionalText(40),
  designation_id: z.union([uuid, z.literal(""), z.null()]).optional().transform((v) => (v ? v : null)),
  department_id: z.union([uuid, z.literal(""), z.null()]).optional().transform((v) => (v ? v : null)),
  shift_id: z.union([uuid, z.literal(""), z.null()]).optional().transform((v) => (v ? v : null)),
  joining_date: isoDate,
  employment_type: z.enum(EMPLOYMENT_TYPES),
  status: z.enum(EMPLOYMENT_STATUSES),
  emergency_contact_name: optionalText(120),
  emergency_contact_phone: optionalText(20),
  emergency_contact_relation: optionalText(40),
  notes: optionalText(2000),
  photo_path: optionalText(300),
});
export type EmployeeInput = z.input<typeof employeeSchema>;

export const salarySchema = z.object({
  employee_id: uuid,
  effective_from: isoDate,
  basic_salary: z.coerce.number().min(0, "Must be 0 or more").max(100_000_000),
  allowances: z.coerce.number().min(0, "Must be 0 or more").max(100_000_000),
  notes: optionalText(300),
});

export const attendanceSchema = z.object({
  id: z.union([uuid, z.literal("")]).optional(),
  employee_id: uuid,
  attendance_date: isoDate,
  scheduled_in: hhmm,
  scheduled_out: hhmm,
  actual_in: optionalHHMM,
  actual_out: optionalHHMM,
  status: z.enum(ATTENDANCE_STATUSES),
  late_reason: z.union([z.enum(LATE_REASONS), z.literal(""), z.null()]).optional().transform((v) => (v ? v : null)),
  late_reason_note: optionalText(500),
  notes: optionalText(1000),
  change_reason: optionalText(300),
});
export type AttendanceInput = z.input<typeof attendanceSchema>;
