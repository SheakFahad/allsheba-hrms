"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { BarChart3, Table2 } from "lucide-react";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { colorOf, FORMATTERS, type Datum, type Series, type ValueFormat } from "./chart-shared";

export type { Series, ValueFormat } from "./chart-shared";

const ChartPlot = dynamic(() => import("./chart-plot"), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse rounded-lg bg-muted" />,
});

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
              <ChartPlot data={data} xKey={xKey} series={series} kind={kind} layout={layout} stacked={stacked} valueFormat={valueFormat} />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
