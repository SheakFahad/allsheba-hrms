/**
 * Easy-to-give temporary password: Employee ID (letters + digits only, lower
 * case) followed by the last 4 digits of the employee's phone, e.g.
 * ASL-0005 + 01794506663 → "asl00056663". Without a phone number, 4 random
 * digits are used. The employee must replace it at first sign-in.
 */
export function easyPassword(employeeCode: string, phone: string | null | undefined, random4?: string): string {
  let id = employeeCode.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!/[a-z]/.test(id)) id = `emp${id}`;
  const digits = (phone ?? "").replace(/\D/g, "");
  const tail = digits.length >= 4 ? digits.slice(-4) : (random4 ?? String(Math.floor(1000 + Math.random() * 9000)));
  let pw = `${id}${tail}`;
  while (pw.length < 8) pw += "0";
  return pw;
}
