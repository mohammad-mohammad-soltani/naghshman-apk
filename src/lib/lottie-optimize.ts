/**
 * Makes a Lottie animation cheaper for Android's renderer without changing a
 * single frame.
 *
 * lottie-android evaluates and draws every shape group on the UI thread on
 * every frame, whether it is invisible, settled or still moving. The splash's
 * map is one layer of ~450 small groups that fade in at staggered times and
 * then hold still, so most of each frame went to groups nobody could see
 * change. lottie-web hands the same work to the browser's compositor, which is
 * why the site plays it smoothly.
 *
 * A layer made of many such groups is split by when they animate:
 * - each bucket of groups becomes its own layer that only exists while those
 *   groups are fading in (Lottie skips a layer outside its in/out frames);
 * - once a bucket has settled it is replaced by a static layer in which its
 *   groups' final transforms are baked into the path points and paths of the
 *   same fill are merged, so hundreds of draws become a handful.
 *
 * Anything this does not understand (strokes, gradients, skew, masks, mattes,
 * time remapping, animated paths or fills) is left exactly as it was.
 */

type Json = Record<string, unknown>;
type Vec = [number, number];
/** A 2D affine matrix [a, b, c, d, e, f]: x' = a·x + c·y + e, y' = b·x + d·y + f. */
type Matrix = [number, number, number, number, number, number];
type BakedPath = { c: boolean; v: Vec[]; i: Vec[]; o: Vec[] };
type BakedFill = { key: string; color: unknown; opacity: number; rule: number; blend: number; paths: BakedPath[] };

/** Below this many groups a layer is cheap enough already. */
const MIN_GROUPS = 40;
/** Groups per bucket: small enough that few run at once, large enough to keep layers few. */
const BUCKET_SIZE = 32;

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const isAnimated = (prop: unknown) => isObject(prop) && prop.a === 1;

function keyframes(prop: unknown): Json[] {
  return isAnimated(prop) && Array.isArray((prop as Json).k) ? ((prop as Json).k as Json[]) : [];
}

/** The value a property ends on (static value, or its last keyframe's). */
function finalValue(prop: unknown): unknown {
  if (!isObject(prop)) return undefined;
  if (!isAnimated(prop)) return prop.k;
  const frames = keyframes(prop);
  const last = frames[frames.length - 1];
  if (last && 's' in last) return last.s;
  // Older exports keep a segment's end value as `e` on the keyframe before.
  return frames[frames.length - 2]?.e;
}

function scalar(value: unknown, fallback: number): number {
  const number = Array.isArray(value) ? value[0] : value;
  return typeof number === 'number' && Number.isFinite(number) ? number : fallback;
}

function pair(value: unknown, fallback: Vec): Vec {
  return Array.isArray(value) && typeof value[0] === 'number' && typeof value[1] === 'number'
    ? [value[0], value[1]]
    : fallback;
}

function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

/** translate(p) · rotate(r) · scale(s) · translate(−a), as lottie-android builds it. */
function transformMatrix(tr: Json): Matrix {
  const [ax, ay] = pair(finalValue(tr.a), [0, 0]);
  const [px, py] = pair(finalValue(tr.p), [0, 0]);
  const [sx, sy] = pair(finalValue(tr.s), [100, 100]);
  const radians = (scalar(finalValue(tr.r), 0) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const scaled: Matrix = [sx / 100, 0, 0, sy / 100, 0, 0];
  const rotated = multiply([cos, sin, -sin, cos, 0, 0], scaled);
  return multiply([1, 0, 0, 1, px, py], multiply(rotated, [1, 0, 0, 1, -ax, -ay]));
}

const apply = (m: Matrix, [x, y]: Vec): Vec => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const applyLinear = (m: Matrix, [x, y]: Vec): Vec => [m[0] * x + m[2] * y, m[1] * x + m[3] * y];

/** Bezier handle length for a quarter circle, as Lottie draws rounded corners. */
const ARC = 0.5519;

/** A Lottie rectangle (centre, size, corner radius) as the path Lottie draws for it. */
function rectanglePath(item: Json): { c: boolean; v: Vec[]; i: Vec[]; o: Vec[] } | null {
  if (isAnimated(item.p) || isAnimated(item.s) || isAnimated(item.r)) return null;
  const [x, y] = pair(finalValue(item.p), [0, 0]);
  const [width, height] = pair(finalValue(item.s), [0, 0]);
  const hw = width / 2;
  const hh = height / 2;
  const r = Math.max(0, Math.min(scalar(finalValue(item.r), 0), hw, hh));
  const k = r * ARC;
  if (r === 0) {
    const v: Vec[] = [[x + hw, y - hh], [x + hw, y + hh], [x - hw, y + hh], [x - hw, y - hh]];
    return { c: true, v, i: v.map((): Vec => [0, 0]), o: v.map((): Vec => [0, 0]) };
  }
  return {
    c: true,
    v: [[x + hw, y - hh + r], [x + hw, y + hh - r], [x + hw - r, y + hh], [x - hw + r, y + hh], [x - hw, y + hh - r], [x - hw, y - hh + r], [x - hw + r, y - hh], [x + hw - r, y - hh]],
    i: [[0, -k], [0, 0], [k, 0], [0, 0], [0, k], [0, 0], [-k, 0], [0, 0]],
    o: [[0, 0], [0, k], [0, 0], [-k, 0], [0, 0], [0, -k], [0, 0], [k, 0]],
  };
}

/**
 * Paths merged into one fill are drawn as one compound path with the nonzero
 * rule, where two overlapping shapes of opposite direction would cut a hole.
 * Every baked path is turned to the same direction so overlaps stay filled.
 */
function clockwise(path: BakedPath): BakedPath {
  let area = 0;
  for (let index = 0; index < path.v.length; index += 1) {
    const [x1, y1] = path.v[index];
    const [x2, y2] = path.v[(index + 1) % path.v.length];
    area += x1 * y2 - x2 * y1;
  }
  if (area >= 0) return path;
  // Reversed: the points run backwards and each point's handles swap sides.
  return { c: path.c, v: [...path.v].reverse(), i: [...path.o].reverse(), o: [...path.i].reverse() };
}

/** Whether a transform can be baked: no skew, no split position, no 3D. */
function bakeableTransform(tr: Json): boolean {
  if (scalar(finalValue(tr.sk), 0) !== 0) return false;
  if (isObject(tr.p) && tr.p.s) return false;
  return !('rx' in tr || 'ry' in tr || 'rz' in tr || 'or' in tr);
}

/**
 * Walks a group as lottie-android draws it: a fill paints every path before
 * it in its group, nested groups included. Returns null for anything it
 * cannot bake.
 */
function bakeGroup(items: unknown, parent: Matrix, parentOpacity: number, fills: BakedFill[]): BakedPath[] | null {
  if (!Array.isArray(items)) return null;
  const tr = items.find((item) => isObject(item) && item.ty === 'tr') as Json | undefined;
  if (tr && !bakeableTransform(tr)) return null;
  const matrix = tr ? multiply(parent, transformMatrix(tr)) : parent;
  const opacity = parentOpacity * (tr ? scalar(finalValue(tr.o), 100) / 100 : 1);
  const paths: BakedPath[] = [];

  for (const item of items) {
    if (!isObject(item) || item.ty === 'tr' || item.hd === true) continue;
    if (item.ty === 'sh' || item.ty === 'rc') {
      const shape = item.ty === 'rc' ? rectanglePath(item) : isObject(item.ks) && !isAnimated(item.ks) ? item.ks.k : null;
      if (!isObject(shape) || !Array.isArray(shape.v)) return null;
      const v = shape.v as Vec[];
      const inTangents = (shape.i as Vec[] | undefined) ?? v.map((): Vec => [0, 0]);
      const outTangents = (shape.o as Vec[] | undefined) ?? v.map((): Vec => [0, 0]);
      paths.push(
        clockwise({
          c: Boolean(shape.c),
          v: v.map((point) => apply(matrix, point)),
          i: inTangents.map((tangent) => applyLinear(matrix, tangent)),
          o: outTangents.map((tangent) => applyLinear(matrix, tangent)),
        }),
      );
    } else if (item.ty === 'gr') {
      const nested = bakeGroup(item.it, matrix, opacity, fills);
      if (!nested) return null;
      paths.push(...nested);
    } else if (item.ty === 'fl') {
      if (isAnimated(item.c) || isAnimated(item.o)) return null;
      const color = finalValue(item.c);
      const fillOpacity = opacity * (scalar(finalValue(item.o), 100) / 100);
      const rule = typeof item.r === 'number' ? item.r : 1;
      const blend = typeof item.bm === 'number' ? item.bm : 0;
      if (fillOpacity > 0 && paths.length) {
        fills.push({ key: JSON.stringify([color, fillOpacity, rule, blend]), color, opacity: fillOpacity, rule, blend, paths: [...paths] });
      }
    } else {
      // Strokes, gradients, trims, repeaters, merges: drawn as they are.
      return null;
    }
  }
  return paths;
}

/** Frames during which a group's own properties change, and the first one it can be seen in. */
function timing(group: Json, layerIn: number, layerOut: number) {
  let end = layerIn;
  let movable = true;
  const visit = (value: unknown, path: string) => {
    if (Array.isArray(value)) value.forEach((entry) => visit(entry, path));
    else if (isObject(value)) {
      if (isAnimated(value)) {
        // Only transforms may move; an animated path or fill never settles into a bakeable state here.
        if (!path.endsWith('tr')) movable = false;
        for (const frame of keyframes(value)) {
          if (typeof frame.t === 'number') end = Math.max(end, frame.t);
        }
      }
      const type = typeof value.ty === 'string' ? value.ty : path;
      for (const [key, entry] of Object.entries(value)) if (key !== 'k' || !isAnimated(value)) visit(entry, type);
    }
  };
  visit(group.it, 'gr');

  // Hidden until its own opacity first rises above zero.
  let start = layerIn;
  const tr = (group.it as Json[]).find((item) => isObject(item) && item.ty === 'tr');
  const opacity = tr?.o;
  if (isAnimated(opacity)) {
    const frames = keyframes(opacity);
    const valueOf = (index: number) => scalar(frames[index]?.s ?? frames[index - 1]?.e, 0);
    start = layerOut;
    for (let index = 0; index < frames.length; index += 1) {
      const t = typeof frames[index].t === 'number' ? (frames[index].t as number) : layerIn;
      if (valueOf(index) > 0 || (frames[index].h !== 1 && index + 1 < frames.length && valueOf(index + 1) > 0)) {
        start = t;
        break;
      }
    }
  } else if (opacity !== undefined && scalar(finalValue(opacity), 100) <= 0) {
    start = layerOut;
  }
  return { start: Math.max(layerIn, start), end: movable ? end : layerOut };
}

function staticLayer(base: Json, ind: number, inFrame: number, groups: Json[], wrapperTr: Json): Json | null {
  const fills: BakedFill[] = [];
  for (const group of groups) {
    if (!bakeGroup([group, wrapperTr], IDENTITY, 1, fills)) return null;
  }
  // Fills are in drawing order (first on top). Only neighbours of the same
  // opaque colour merge, so nothing changes which shape covers which.
  // Translucent paths stay separate draws to keep their blending.
  const runs: BakedFill[] = [];
  for (const fill of fills) {
    const previous = runs[runs.length - 1];
    if (previous && fill.opacity >= 1 && previous.key === fill.key) previous.paths.push(...fill.paths);
    else runs.push({ ...fill, paths: [...fill.paths] });
  }
  return { ...base, ind, ip: inFrame, shapes: runs.map(fillGroup) };
}

function fillGroup(fill: BakedFill): Json {
  return {
    ty: 'gr',
    it: [
      ...fill.paths.map((path) => ({ ty: 'sh', ks: { a: 0, k: path } })),
      { ty: 'fl', c: { a: 0, k: fill.color }, o: { a: 0, k: fill.opacity * 100 }, r: fill.rule, bm: fill.blend },
      { ty: 'tr', a: { a: 0, k: [0, 0] }, p: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } },
    ],
  };
}

function optimizeLayer(layer: Json, nextInd: () => number): Json[] | null {
  if (layer.ty !== 4 || (layer.st ?? 0) !== 0 || (layer.sr ?? 1) !== 1) return null;
  if (layer.tt || layer.td || layer.tm || layer.hasMask || (Array.isArray(layer.masksProperties) && layer.masksProperties.length)) return null;
  const shapes = layer.shapes;
  if (!Array.isArray(shapes) || shapes.length !== 1 || !isObject(shapes[0]) || shapes[0].ty !== 'gr') return null;
  const wrapper = shapes[0] as Json;
  const items = Array.isArray(wrapper.it) ? (wrapper.it as unknown[]) : [];
  const wrapperTr = items.find((item) => isObject(item) && item.ty === 'tr') as Json | undefined;
  const groups = items.filter((item): item is Json => isObject(item) && item.ty === 'gr');
  if (!wrapperTr || isAnimated(wrapperTr.a) || isAnimated(wrapperTr.p) || isAnimated(wrapperTr.s) || isAnimated(wrapperTr.r) || isAnimated(wrapperTr.o)) return null;
  if (groups.length < MIN_GROUPS || groups.length + 1 !== items.length) return null;

  const layerIn = typeof layer.ip === 'number' ? layer.ip : 0;
  const layerOut = typeof layer.op === 'number' ? layer.op : 0;
  // Buckets are runs of neighbouring groups, and their layers keep that
  // order, so the drawing order (and so what covers what) never changes.
  const timed = groups
    .map((group) => ({ group, ...timing(group, layerIn, layerOut) }))
    .filter((entry) => entry.start < layerOut);

  const layers: Json[] = [];
  let saves = timed.length < groups.length;
  for (let index = 0; index < timed.length; index += BUCKET_SIZE) {
    const bucket = timed.slice(index, index + BUCKET_SIZE);
    const inFrame = Math.max(layerIn, Math.floor(Math.min(...bucket.map((entry) => entry.start))));
    const settled = Math.min(layerOut, Math.ceil(Math.max(...bucket.map((entry) => entry.end))));
    const bucketGroups = bucket.map((entry) => entry.group);
    const still = settled < layerOut ? staticLayer(layer, nextInd(), Math.max(inFrame, settled), bucketGroups, wrapperTr) : null;
    const animatedUntil = still ? Math.max(inFrame, settled) : layerOut;
    if (still || inFrame > layerIn) saves = true;
    if (animatedUntil > inFrame) {
      layers.push({ ...layer, ind: nextInd(), ip: inFrame, op: animatedUntil, shapes: [{ ...wrapper, it: [...bucketGroups, wrapperTr] }] });
    }
    if (still) layers.push(still);
  }
  // Splitting a layer that is busy the whole time only adds layers.
  return saves ? layers : null;
}

/** Returns an equivalent animation that Android renders with far less work per frame. */
export function optimizeLottie<T>(animation: T): T {
  if (!isObject(animation) || !Array.isArray(animation.layers)) return animation;
  const layers = animation.layers as unknown[];
  // Layers others are parented to keep their index and are left alone.
  const parents = new Set<unknown>(layers.map((layer) => (isObject(layer) ? layer.parent : undefined)).filter((value) => value !== undefined));
  let maxInd = Math.max(0, ...layers.map((layer) => (isObject(layer) && typeof layer.ind === 'number' ? layer.ind : 0)));
  const nextInd = () => (maxInd += 1);

  let changed = false;
  const next: unknown[] = [];
  for (const layer of layers) {
    const replacement = isObject(layer) && !parents.has(layer.ind) ? optimizeLayer(layer, nextInd) : null;
    if (replacement) {
      changed = true;
      next.push(...replacement);
    } else {
      next.push(layer);
    }
  }
  return changed ? ({ ...animation, layers: next } as T) : animation;
}
