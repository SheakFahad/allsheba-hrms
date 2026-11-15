"use client";

/**
 * Recharts drawing code, split out of charts.tsx so the ~110 KB (gzip) chart
 * library loads lazily instead of with the page.
 */
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
  type TooltipContentProps,
} from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import { colorOf, FORMATTERS, type Datum, type Series, type ValueFormat } from "./chart-shared";

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

export default function ChartPlot({
  data,
  xKey,
  series,
  kind,
  layout,
  stacked,
  valueFormat,
}: {
  data: Datum[];
  xKey: string;
  series: Series[];
  kind: "bar" | "line" | "area";
  layout: "vertical" | "horizontal";
  stacked?: boolean;
  valueFormat: ValueFormat;
}) {
  const format = FORMATTERS[valueFormat];
  const tooltip = (props: TooltipContentProps<ValueType, NameType>) => <ChartTooltip {...props} series={series} format={format} />;
  const yFmt = (v: number) => (format ? format(v) : String(v));
  return (
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
  );
}
