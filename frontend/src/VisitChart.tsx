import { useState } from "react";
import type { HistoryPoint } from "./api";

const width = 720;
const height = 220;
const left = 38;
const right = 706;
const top = 18;
const bottom = 174;

function VisitChart({
  points,
  detailed = false,
}: {
  points: HistoryPoint[];
  detailed?: boolean;
}) {
  const [activeIndex, setActiveIndex] = useState<number>();
  const maxVisits = Math.max(1, ...points.map((point) => point.visits));
  const coordinates = points.map((point, index) => ({
    ...point,
    x:
      points.length < 2
        ? (left + right) / 2
        : left + (index / (points.length - 1)) * (right - left),
    y: bottom - (point.visits / maxVisits) * (bottom - top),
  }));
  const linePath = coordinates
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const areaPath = coordinates.length
    ? `${linePath} L ${coordinates.at(-1)?.x} ${bottom} L ${coordinates[0].x} ${bottom} Z`
    : "";
  const activePoint =
    activeIndex === undefined ? undefined : coordinates[activeIndex];
  const horizontalLines = [0, 0.5, 1].map((position) => ({
    y: top + position * (bottom - top),
    label: Math.round(maxVisits * (1 - position)),
  }));

  return (
    <div className={`chart-wrap ${detailed ? "chart-wrap--large" : ""}`}>
      {points.length === 0 ? (
        <div className="chart-empty">Waiting for visit data…</div>
      ) : (
        <>
          <div className="chart-hover-detail" aria-live="polite">
            {activePoint
              ? `${activePoint.time} UTC · ${activePoint.visits} visits`
              : "Hover or focus a point to inspect activity"}
          </div>
          <svg
            className="visit-chart"
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label="Visits per five-minute interval over the last hour"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="visitFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8b7bff" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#8b7bff" stopOpacity="0" />
              </linearGradient>
            </defs>
            {horizontalLines.map((line) => (
              <g key={line.y}>
                <line
                  className="chart-gridline"
                  x1={left}
                  x2={right}
                  y1={line.y}
                  y2={line.y}
                />
                <text className="chart-axis-label" x={left - 10} y={line.y + 4}>
                  {line.label}
                </text>
              </g>
            ))}
            <path className="chart-area" d={areaPath} />
            <path className="chart-line" d={linePath} />
            {coordinates.map((point, index) => (
              <g key={`${point.time}-${index}`}>
                <circle
                  className={`chart-point ${activeIndex === index ? "is-active" : ""}`}
                  cx={point.x}
                  cy={point.y}
                  r={activeIndex === index ? 5 : 3.5}
                  tabIndex={0}
                  aria-label={`${point.time} UTC: ${point.visits} visits`}
                  onFocus={() => setActiveIndex(index)}
                  onBlur={() => setActiveIndex(undefined)}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseLeave={() => setActiveIndex(undefined)}
                />
              </g>
            ))}
            {coordinates.map(
              (point, index) =>
                (index % 3 === 0 || index === coordinates.length - 1) && (
                  <text
                    className="chart-axis-label"
                    key={`label-${point.time}-${index}`}
                    textAnchor="middle"
                    x={point.x}
                    y={bottom + 24}
                  >
                    {point.time}
                  </text>
                ),
            )}
          </svg>
        </>
      )}
    </div>
  );
}

export default VisitChart;
