// Geometry and timing of the paper agenda scene, in the SVG's own units
// (viewBox 0 0 360 500). Every stroke the pencil makes has a [start, end]
// window on the paper's progress (0 to 1), and the pencil follows whichever
// stroke is being drawn, lifting a little as it travels between strokes.

export const VIEW = { width: 360, height: 500 } as const;

export type Point = { x: number; y: number };
type Cubic = [Point, Point, Point, Point];

// A handwritten entry, revealed left to right as the pencil writes it.
export type Entry = {
  text: string;
  x: number;
  // Baseline of the text.
  y: number;
  width: number;
  start: number;
  end: number;
};

// A drawn mark (circle, strike-through, arrow, scribble, the X): a chain of
// cubic Bezier segments.
export type Mark = {
  segments: Cubic[];
  start: number;
  end: number;
};

export const ENTRIES = {
  ana: { text: "Ana 14h", x: 96, y: 124, width: 84, start: 0, end: 0.08 },
  bia: { text: "Bia 14h??", x: 96, y: 176, width: 106, start: 0.1, end: 0.19 },
  carla: {
    text: "Carla 15h",
    x: 96,
    y: 228,
    width: 104,
    start: 0.28,
    end: 0.36,
  },
  remarcar: {
    text: "remarcar",
    x: 112,
    y: 280,
    width: 92,
    start: 0.42,
    end: 0.5,
  },
  duda: {
    text: "Duda 16h?",
    x: 186,
    y: 384,
    width: 104,
    start: 0.6,
    end: 0.67,
  },
  fe: { text: "Fê 15h", x: 100, y: 332, width: 68, start: 0.69, end: 0.74 },
} satisfies Record<string, Entry>;

const p = (x: number, y: number): Point => ({ x, y });

// A straight segment as a cubic, so every mark shares one representation.
function line(a: Point, b: Point): Cubic {
  return [
    a,
    p(a.x + (b.x - a.x) / 3, a.y + (b.y - a.y) / 3),
    p(a.x + ((b.x - a.x) * 2) / 3, a.y + ((b.y - a.y) * 2) / 3),
    b,
  ];
}

function polyline(points: Point[]): Cubic[] {
  return points.slice(1).map((point, i) => line(points[i]!, point));
}

export const MARKS = {
  // A loop around the double-booked "14h??".
  circle: {
    segments: [
      [p(222, 150), p(214, 140), p(160, 140), p(144, 156)],
      [p(144, 156), p(128, 174), p(160, 190), p(194, 186)],
      [p(194, 186), p(232, 182), p(236, 158), p(212, 146)],
    ],
    start: 0.2,
    end: 0.26,
  },
  strike: {
    segments: [line(p(90, 221), p(210, 214))],
    start: 0.37,
    end: 0.4,
  },
  arrow: {
    segments: [[p(212, 272), p(292, 280), p(300, 330), p(262, 358)]],
    start: 0.51,
    end: 0.56,
  },
  arrowHead: {
    segments: polyline([p(258, 340), p(260, 360), p(280, 362)]),
    start: 0.56,
    end: 0.58,
  },
  scribble: {
    segments: polyline([
      p(96, 326),
      p(108, 306),
      p(118, 330),
      p(130, 304),
      p(140, 330),
      p(152, 306),
      p(162, 330),
      p(174, 308),
      p(182, 326),
    ]),
    start: 0.76,
    end: 0.82,
  },
  // The giant X, corner to corner.
  x1: { segments: [line(p(26, 34), p(336, 474))], start: 0.85, end: 0.9 },
  x2: { segments: [line(p(334, 30), p(24, 478))], start: 0.92, end: 0.96 },
} satisfies Record<string, Mark>;

// Where the pencil waits before writing, and where it flies off to at the end.
const REST = p(268, 96);
const EXIT = p(430, -60);

export function pathData(segments: Cubic[]): string {
  const [first] = segments;
  if (!first) return "";
  const head = `M${first[0].x} ${first[0].y}`;
  return (
    head +
    segments
      .map(
        ([, c1, c2, end]) =>
          `C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}`,
      )
      .join("")
  );
}

function bezier([a, b, c, d]: Cubic, t: number): Point {
  const u = 1 - t;
  const w0 = u * u * u;
  const w1 = 3 * u * u * t;
  const w2 = 3 * u * t * t;
  const w3 = t * t * t;
  return p(
    w0 * a.x + w1 * b.x + w2 * c.x + w3 * d.x,
    w0 * a.y + w1 * b.y + w2 * c.y + w3 * d.y,
  );
}

function markAt(mark: Mark, t: number): Point {
  const n = mark.segments.length;
  const index = Math.min(n - 1, Math.floor(t * n));
  return bezier(mark.segments[index]!, t * n - index);
}

// The pencil tip while writing an entry: along the baseline, bobbing up and
// down like letters.
function entryAt(entry: Entry, t: number): Point {
  return p(
    entry.x + entry.width * t,
    entry.y - 8 + Math.sin((t * entry.width) / 6) * 6,
  );
}

type Track = { start: number; end: number; at: (t: number) => Point };

const TRACKS: Track[] = [
  ...Object.values(ENTRIES).map((entry) => ({
    start: entry.start,
    end: entry.end,
    at: (t: number) => entryAt(entry, t),
  })),
  ...Object.values(MARKS).map((mark) => ({
    start: mark.start,
    end: mark.end,
    at: (t: number) => markAt(mark, t),
  })),
].sort((a, b) => a.start - b.start);

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function travel(from: Point, to: Point, t: number, lift: number): Point {
  const eased = t * t * (3 - 2 * t);
  return p(
    from.x + (to.x - from.x) * eased,
    from.y + (to.y - from.y) * eased - Math.sin(Math.PI * t) * lift,
  );
}

// The pencil tip at a given paper progress.
export function pencilAt(progress: number): Point {
  const t = clamp01(progress);
  let previousEnd = 0;
  let previousPoint = REST;
  for (const track of TRACKS) {
    if (t < track.start) {
      const gap = track.start - previousEnd;
      const u = gap > 0 ? (t - previousEnd) / gap : 1;
      return travel(previousPoint, track.at(0), clamp01(u), 18);
    }
    if (t <= track.end) {
      return track.at((t - track.start) / (track.end - track.start));
    }
    previousEnd = track.end;
    previousPoint = track.at(1);
  }
  const u = previousEnd < 1 ? (t - previousEnd) / (1 - previousEnd) : 1;
  return travel(previousPoint, EXIT, clamp01(u), 0);
}
