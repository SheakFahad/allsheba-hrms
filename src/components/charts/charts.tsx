"use client";

import * as React from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
  type TooltipContentProps,
} from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import { BarChart3, Table2 } from "lucide-react";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface Series {
  key: string;
  label: string;
  /** CSS color, defaults to the categorical order --chart-1..4 (fixed order, never cycled). */
  color?: string;
}

type Datum = Record<string, string | number | null>;

const CATEGORICAL = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];
const colorOf = (s: Series, i: number) => s.color ?? CATEGORICAL[i] ?? "var(--chart-5)";

export type ValueFormat = "number" | "money" | "percent" | "minutes" | "hours";
const FORMATTERS: Record<ValueFormat, (v: number) => string> = {
  number: (v) => new Intl.NumberFormat("en-IN").format(v),
  money: (v) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(v),
  percent: (v) => `${v}%`,
  minutes: (v) => `${v} min`,
  hours: (v) => `${v} h`,
};

const AXIS = { stroke: "var(--muted-foreground)", fontSize: 11, tickLine: false, axisLine: false } as const;

function ChartTooltip({ active, payload, label, series, format }: TooltipContentProps<ValueType, NameType> & { series: Series[]; format?: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-foreground">{label}</p>
      {payload.map((p, i) => {
        const s = series.find((x) => x.key === p.dataKey);
        return (
          <p key={i} className="flex items-center gap-2 text-muted-foreground">
            <span className="size-2 rounded-full" style={{ background: p.color }} />
            <span>{s?.label ?? p.name}</span>
            <span className="tabular ml-auto pl-3 font-medium text-foreground">{format ? format(Number(p.value)) : p.value}</span>
          </p>
        );
      })}
    </div>
  );
}

function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {series.map((s, i) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: colorOf(s, i) }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

function DataTable({ data, xKey, xLabel, series, format }: { data: Datum[]; xKey: string; xLabel: string; series: Series[]; format?: (v: number) => string }) {
  return (
    <div className="max-h-64 overflow-auto rounded-lg border">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-muted">
          <tr>
            <th className="px-3 py-1.5 text-left font-medium">{xLabel}</th>
            {series.map((s) => <th key={s.key} className="px-3 py-1.5 text-right font-medium">{s.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {data.map((d, i) => (
            <tr key={i} className="border-t">
              <td className="px-3 py-1.5">{d[xKey]}</td>
              {series.map((s) => (
                <td key={s.key} className="tabular px-3 py-1.5 text-right">{format ? format(Number(d[s.key] ?? 0)) : (d[s.key] ?? 0)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ChartCard({
  title,
  description,
  data,
  xKey,
  xLabel = "",
  series,
  kind = "bar",
  layout = "vertical",
  stacked,
  height = 240,
  valueFormat = "number",
  className,
  emptyText = "No data for this period",
}: {
  title: string;
  description?: string;
  data: Datum[];
  xKey: string;
  xLabel?: string;
  series: Series[];
  kind?: "bar" | "line" | "area";
  /** "horizontal" draws horizontal bars (category axis on the left) — for rankings. */
  layout?: "vertical" | "horizontal";
  stacked?: boolean;
  height?: number;
  valueFormat?: ValueFormat;
  className?: string;
  emptyText?: string;
}) {
  const [asTable, setAsTable] = React.useState(false);
  const format = FORMATTERS[valueFormat];
  const empty = data.length === 0 || data.every((d) => series.every((s) => !Number(d[s.key])));
  const tooltip = (props: TooltipContentProps<ValueType, NameType>) => <ChartTooltip {...props} series={series} format={format} />;
  const yFmt = (v: number) => (format ? format(v) : String(v));

  return (
    <Card className={cn("gap-3", className)}>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
        {description && <CardDescription className="text-xs">{description}</CardDescription>}
        <CardAction>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={asTable ? "Show chart" : "Show data table"}
            onClick={() => setAsTable((t) => !t)}
            className="no-print"
          >
            {asTable ? <BarChart3 /> : <Table2 />}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {empty ? (
          <div className="grid place-items-center text-sm text-muted-foreground" style={{ height }}>{emptyText}</div>
        ) : asTable ? (
          <DataTable data={data} xKey={xKey} xLabel={xLabel || title} series={series} format={format} />
        ) : (
          <>
            <Legend series={series} />
            <div style={{ height }} role="img" aria-label={`${title} chart`}>
              <ResponsiveContainer width="100%" height="100%">
                {kind === "bar" ? (
                  <BarChart
                    data={data}
                    layout={layout === "horizontal" ? "vertical" : "horizontal"}
                    margin={{ top: 4, right: 8, bottom: 0, left: layout === "horizontal" ? 8 : -12 }}
                    barCategoryGap="28%"
                    barGap={2}
                  >
                    <CartesianGrid stroke="var(--border)" vertical={layout === "horizontal"} horizontal={layout !== "horizontal"} />
                    {layout === "horizontal" ? (
                      <>
                        <XAxis type="number" {...AXIS} tickFormatter={yFmt} allowDecimals={false} />
                        <YAxis type="category" dataKey={xKey} {...AXIS} width={110} />
                      </>
                    ) : (
                      <>
                        <XAxis dataKey={xKey} {...AXIS} />
                        <YAxis {...AXIS} tickFormatter={yFmt} allowDecimals={false} />
                      </>
                    )}
                    <Tooltip content={tooltip} cursor={{ fill: "var(--muted)", opacity: 0.6 }} />
                    {series.map((s, i) => (
                      <Bar
                        key={s.key}
                        dataKey={s.key}
                        name={s.label}
                        fill={colorOf(s, i)}
                        stackId={stacked ? "a" : undefined}
                        stroke="var(--card)"
                        strokeWidth={stacked ? 2 : 0}
                        maxBarSize={layout === "horizontal" ? 18 : 28}
                        radius={
                          stacked && i < series.length - 1
                            ? 0
                            : layout === "horizontal" ? [0, 4, 4, 0] : [4, 4, 0, 0]
                        }
                      />
                    ))}
                  </BarChart>
                ) : kind === "area" ? (
                  <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                    <CartesianGrid stroke="var(--border)" vertical={false} />
                    <XAxis dataKey={xKey} {...AXIS} />
                    <YAxis {...AXIS} tickFormatter={yFmt} />
                    <Tooltip content={tooltip} cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }} />
                    {series.map((s, i) => (
                      <Area
                        key={s.key}
                        type="monotone"
                        dataKey={s.key}
                        name={s.label}
                        stroke={colorOf(s, i)}
                        fill={colorOf(s, i)}
                        fillOpacity={0.12}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }}
                      />
                    ))}
                  </AreaChart>
                ) : (
                  <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                    <CartesianGrid stroke="var(--border)" vertical={false} />
                    <XAxis dataKey={xKey} {...AXIS} />
                    <YAxis {...AXIS} tickFormatter={yFmt} />
                    <Tooltip content={tooltip} cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }} />
                    {series.map((s, i) => (
                      <Line
                        key={s.key}
                        type="monotone"
                        dataKey={s.key}
                        name={s.label}
                        stroke={colorOf(s, i)}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }}
                      />
                    ))}
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
