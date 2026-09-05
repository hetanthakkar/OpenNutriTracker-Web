type LineChartProps = {
  values: number[];
  color?: string;
  height?: number;
  fill?: boolean;
  labels?: string[];
};

export function LineChart({ values, color = "var(--accent)", height = 180, fill = true, labels }: LineChartProps) {
  const width = 640;
  const paddingX = 14;
  const paddingY = 16;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  const points = values.map((value, index) => ({
    x: paddingX + (index * (width - paddingX * 2)) / (values.length - 1),
    y: paddingY + ((max - value) * (height - paddingY * 2 - 18)) / spread,
  }));
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  const area = `${points[0].x},${height - 22} ${line} ${points.at(-1)?.x},${height - 22}`;

  return (
    <div className="chart-wrap">
      <svg className="line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Seven day trend chart">
        {[0.25, 0.5, 0.75].map((fraction) => (
          <line key={fraction} x1="0" x2={width} y1={height * fraction} y2={height * fraction} className="chart-grid" />
        ))}
        {fill && <polygon points={area} fill={color} opacity="0.09" />}
        <polyline points={line} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r="5" fill={color} />)}
      </svg>
      {labels && <div className="chart-labels">{labels.map((label) => <span key={label}>{label}</span>)}</div>}
    </div>
  );
}

export function Donut({ value = 93 }: { value?: number }) {
  return (
    <div className="donut" style={{ "--value": `${value * 3.6}deg` } as React.CSSProperties}>
      <div><strong>200</strong><span>kcal left</span></div>
    </div>
  );
}
