/** Report document model shared by the server builders and the client renderers (preview, print, PDF, Excel, CSV). */

export type CellFormat = "text" | "date" | "time" | "minutes" | "duration" | "money" | "number" | "percent";
export type Cell = string | number | null;
export type Row = Record<string, Cell>;

export interface ReportColumn {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  format?: CellFormat;
}

export interface TableSection {
  kind: "table";
  title?: string;
  columns: ReportColumn[];
  rows: Row[];
  totals?: Row;
  /** The primary table receives column selection and sorting from the builder. */
  primary?: boolean;
}

export interface KVSection {
  kind: "kv";
  title?: string;
  items: { label: string; value: string }[];
}

export interface SignatureSection {
  kind: "signatures";
  labels: string[];
}

export interface NoteSection {
  kind: "note";
  text: string;
}

export type ReportSection = TableSection | KVSection | SignatureSection | NoteSection;

export interface ReportBranding {
  name: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  logoUrl: string;
  footer: string;
}

export interface ReportDocument {
  type: string;
  title: string;
  subtitle?: string;
  orientation: "portrait" | "landscape";
  meta: { label: string; value: string }[];
  sections: ReportSection[];
  generatedAt: string;
  generatedBy: string;
  fileName: string;
  branding: ReportBranding;
  sensitive: boolean;
  timezone: string;
}

export interface ReportParams {
  type: string;
  employee?: string;
  employees?: string[];
  department?: string;
  from?: string;
  to?: string;
  month?: string;
  year?: string;
  date?: string;
  status?: string;
  late?: string;
  payroll?: string;
  item?: string;
  view?: string;
  cols?: string[];
  sort?: string;
  dir?: "asc" | "desc";
  orientation?: "portrait" | "landscape";
}
