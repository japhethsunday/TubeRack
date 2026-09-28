/** Brand-coloured circuit traces with travelling light pulses (decorative). */
const TRACES = [
  "M0 120 H260 L320 180 H620 L680 120 H1000",
  "M0 520 H180 L240 460 H520 L580 520 H760 L820 580 H1000",
  "M140 0 V90 L200 150 V380 L140 440 V700",
  "M860 0 V140 L800 200 V420 L860 480 V700",
  "M0 330 H90 L130 290 H360",
  "M640 330 H870 L910 370 H1000",
  "M420 700 V610 L470 560 H700",
];
const NODES: [number, number][] = [[260, 120], [680, 120], [240, 460], [820, 580], [200, 150], [800, 420], [130, 290], [910, 370], [470, 560]];
const COLORS = ["#d946ef", "#8b5cf6", "#0ea5e9"];

export function CircuitBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="auth-blob absolute -left-32 top-1/4 size-[26rem] rounded-full bg-fuchsia-600/20 blur-3xl" />
      <div className="auth-blob absolute -right-24 bottom-0 size-[28rem] rounded-full bg-sky-500/15 blur-3xl" style={{ animationDelay: "-7s" }} />
      <svg viewBox="0 0 1000 700" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full">
        <g fill="none" strokeWidth="1.2">
          {TRACES.map((d, i) => (
            <path key={`b${i}`} d={d} className="stroke-foreground/10" />
          ))}
          {TRACES.map((d, i) => (
            <path
              key={`p${i}`}
              d={d}
              pathLength={1000}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth="2"
              strokeLinecap="round"
              className="su-trace"
              style={{ animationDelay: `${-i * 1.3}s`, filter: `drop-shadow(0 0 4px ${COLORS[i % COLORS.length]})` }}
            />
          ))}
        </g>
        {NODES.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="3.5" fill={COLORS[i % COLORS.length]} className="su-node" style={{ animationDelay: `${i * 0.35}s` }} />
        ))}
      </svg>
    </div>
  );
}
