// The two characters of the cookie notice, drawn as SVG: Zema, the Zemana
// mascot, running away (looking back, scared), and the giant cookie rolling
// after him. The `cn-*` classes are animated by cookie-notice.css; the
// transform origins are in viewBox units.

const INK = "#1a0050";

function Leg({ x, className }: { x: number; className: string }) {
  return (
    <g className={className}>
      <path
        d={`M${x} 100 L${x} 128`}
        stroke={INK}
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path
        d={`M${x - 10} 129 q2 -8 12 -7 q10 1 12 7 q0 6 -6 6 h-18 q-6 0 -4 -6z`}
        fill="#f5c700"
        stroke={INK}
        strokeWidth="3"
      />
      <path d={`M${x - 13} 133 h29`} stroke="#fff" strokeWidth="3" />
    </g>
  );
}

function Arm({
  d,
  hand,
  className,
}: {
  d: string;
  hand: [number, number];
  className: string;
}) {
  return (
    <g className={className}>
      <path d={d} stroke={INK} strokeWidth="7" strokeLinecap="round" />
      <circle
        cx={hand[0]}
        cy={hand[1]}
        r="10"
        fill="#fff"
        stroke={INK}
        strokeWidth="3"
      />
    </g>
  );
}

export function Zema() {
  return (
    <svg
      viewBox="0 0 120 150"
      aria-hidden="true"
      className="block overflow-visible"
    >
      <Arm className="cn-arm-l" d="M26 64 L10 84" hand={[9, 86]} />
      <Leg className="cn-leg-l" x={50} />
      <Leg className="cn-leg-r" x={70} />
      <g className="cn-bob">
        <rect
          x="18"
          y="8"
          width="84"
          height="96"
          rx="26"
          fill="#2a0081"
          stroke={INK}
          strokeWidth="3.5"
        />
        <path
          d="M30 26 q4 -10 16 -12"
          stroke="#6b4bd6"
          strokeWidth="5"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M34 22 q8 -7 16 -2"
          stroke="#f5c700"
          strokeWidth="4.5"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M70 20 q8 -5 16 2"
          stroke="#f5c700"
          strokeWidth="4.5"
          strokeLinecap="round"
          fill="none"
        />
        <ellipse
          cx="44"
          cy="40"
          rx="11"
          ry="13"
          fill="#fff"
          stroke={INK}
          strokeWidth="2.5"
        />
        <ellipse
          cx="76"
          cy="40"
          rx="11"
          ry="13"
          fill="#fff"
          stroke={INK}
          strokeWidth="2.5"
        />
        <circle cx="39" cy="41" r="5.5" fill={INK} />
        <circle cx="71" cy="41" r="5.5" fill={INK} />
        <circle cx="37.5" cy="39" r="1.8" fill="#fff" />
        <circle cx="69.5" cy="39" r="1.8" fill="#fff" />
        <circle cx="31" cy="58" r="5" fill="#ffd3f0" opacity=".85" />
        <circle cx="89" cy="58" r="5" fill="#ffd3f0" opacity=".85" />
        <ellipse cx="60" cy="61" rx="7" ry="8" fill={INK} />
        <ellipse cx="60" cy="65" rx="4.5" ry="3" fill="#ff8fc6" />
        <path
          d="M45 76 H75 L45 94 H75"
          stroke="#f5c700"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <path
          className="cn-sweat"
          d="M100 18 q4 6 0 9 q-4 -3 0 -9z"
          fill="#b7e7fc"
          stroke={INK}
          strokeWidth="1.5"
        />
      </g>
      <Arm className="cn-arm-r" d="M94 64 L110 82" hand={[111, 84]} />
    </svg>
  );
}

const CHIPS: [number, number, number, number, number][] = [
  // cx, cy, rx, ry, rotation
  [32, 30, 7, 5.5, -20],
  [64, 26, 5.5, 4.5, 0],
  [70, 56, 7, 6, 30],
  [40, 62, 6, 5, 0],
  [52, 80, 5, 4, 0],
  [22, 54, 4.5, 4, 0],
  [54, 45, 2, 2, 0],
];

export function BigCookie() {
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden="true"
      className="block overflow-visible"
    >
      <g className="cn-hop">
        <g className="cn-spin">
          <circle
            cx="50"
            cy="50"
            r="46"
            fill="#e3a957"
            stroke="#2a0081"
            strokeWidth="3.5"
          />
          <circle
            cx="50"
            cy="50"
            r="38"
            fill="none"
            stroke="#c98a3c"
            strokeWidth="2"
            strokeDasharray="4 7"
          />
          {CHIPS.map(([cx, cy, rx, ry, rot]) => (
            <ellipse
              key={`${cx}-${cy}`}
              cx={cx}
              cy={cy}
              rx={rx}
              ry={ry}
              fill="#4a2a14"
              transform={rot ? `rotate(${rot} ${cx} ${cy})` : undefined}
            />
          ))}
        </g>
      </g>
    </svg>
  );
}
