/** Chart helpers shared by the card (always loaded) and the plot (lazy). No Recharts here. */

export interface Series {
  key: string;
  label: string;
  /** CSS color, defaults to the categorical order --chart-1..4 (fixed order, never cycled). */
  color?: string;
}

export type Datum = Record<string, string | number | null>;

const CATEGORICAL = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];
export const colorOf = (s: Series, i: number) => s.color ?? CATEGORICAL[i] ?? "var(--chart-5)";

export type ValueFormat = "number" | "money" | "percent" | "minutes" | "hours";
export const FORMATTERS: Record<ValueFormat, (v: number) => string> = {
  number: (v) => new Intl.NumberFormat("en-IN").format(v),
  money: (v) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(v),
  percent: (v) => `${v}%`,
  minutes: (v) => `${v} min`,
  hours: (v) => `${v} h`,
};
