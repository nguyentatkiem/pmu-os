"use client";
import React, { useState } from "react";

/** Biểu đồ cột đôi có bảng dữ liệu thay thế */
export function BarChart({
  data,
  series,
}: {
  data: { label: string; sub?: string; values: number[] }[];
  series: { name: string; color: string }[];
}) {
  const [table, setTable] = useState(false);
  const max = Math.max(2, ...data.flatMap((d) => d.values));
  const top = Math.ceil(max / 2) * 2;
  const W = 700;
  const H = 230;
  const pad = { l: 36, r: 8, t: 18, b: 44 };
  const cw = (W - pad.l - pad.r) / data.length;
  const bw = Math.min(34, (cw - 18) / series.length);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / top);
  const ticks = Array.from({ length: top / 2 + 1 }, (_, i) => i * 2);
  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="row small">
          {series.map((s) => (
            <span key={s.name} className="row" style={{ gap: 6 }}>
              <span style={{ width: 14, height: 14, borderRadius: 4, background: s.color, display: "inline-block" }} /> {s.name}
            </span>
          ))}
        </div>
        <button className="link small" onClick={() => setTable((v) => !v)} aria-pressed={table}>
          {table ? "Xem biểu đồ" : "Xem bảng dữ liệu"}
        </button>
      </div>
      {table ? (
        <div className="table-wrap mt-12">
          <table className="t">
            <thead>
              <tr>
                <th>Ngày</th>
                {series.map((s) => (
                  <th key={s.name}>{s.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.label + d.sub}>
                  <td>
                    {d.label} {d.sub}
                  </td>
                  {d.values.map((v, i) => (
                    <td key={i}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Biểu đồ: ${series.map((s) => s.name).join(", ")}`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#e6eeee" />
              <text x={pad.l - 10} y={y(t) + 4} fontSize="12" textAnchor="end" fill="#5b6d74">
                {t}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const x0 = pad.l + i * cw + (cw - bw * series.length - 6) / 2;
            return (
              <g key={i}>
                {d.values.map((v, k) => (
                  <g key={k}>
                    <rect x={x0 + k * (bw + 6)} y={y(v)} width={bw} height={Math.max(0, y(0) - y(v))} rx="4" fill={series[k].color} />
                    <text x={x0 + k * (bw + 6) + bw / 2} y={y(v) - 6} fontSize="13" fontWeight="700" textAnchor="middle" fill="#172b34">
                      {v}
                    </text>
                  </g>
                ))}
                <text x={pad.l + i * cw + cw / 2} y={H - 24} fontSize="13" textAnchor="middle" fill="#172b34">
                  {d.label}
                </text>
                <text x={pad.l + i * cw + cw / 2} y={H - 8} fontSize="12" textAnchor="middle" fill="#5b6d74">
                  {d.sub}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

/** Biểu đồ vành khuyên */
export function Donut({ segments, center, sub, size = 190 }: { segments: { value: number; color: string; label: string }[]; center: React.ReactNode; sub?: string; size?: number }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = 70;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div style={{ position: "relative", width: size, height: size, flex: "none" }}>
      <svg viewBox="0 0 180 180" width={size} height={size} role="img" aria-label={segments.map((s) => `${s.label}: ${s.value}`).join(", ")}>
        <circle cx="90" cy="90" r={r} fill="none" stroke="#e8efef" strokeWidth="22" />
        {total > 0 &&
          segments.map((s, i) => {
            const len = (s.value / total) * c;
            const el = (
              <circle
                key={i}
                cx="90"
                cy="90"
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth="22"
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-acc}
                transform="rotate(-90 90 90)"
              />
            );
            acc += len;
            return el;
          })}
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>
        <div>
          <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1 }}>{center}</div>
          {sub && <div className="muted" style={{ fontSize: 15, marginTop: 4 }}>{sub}</div>}
        </div>
      </div>
    </div>
  );
}
