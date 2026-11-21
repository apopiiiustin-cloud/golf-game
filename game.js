(() => {
  const WORLD_W = 240;
  const WORLD_H = 320;
  const PX = 3;
  // On-screen window; camera scrolls within per-hole world bounds
  const VIEW_W = 204;
  const VIEW_H = 296;

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const buffer = document.createElement("canvas");
  buffer.width = WORLD_W; buffer.height = WORLD_H;
  const bctx = buffer.getContext("2d");
  const courseLayer = document.createElement("canvas");
  courseLayer.width = WORLD_W; courseLayer.height = WORLD_H;
  const cctx = courseLayer.getContext("2d");
  const swingCanvas = document.getElementById("swingMeter");
  const sctx = swingCanvas.getContext("2d");
  const dockTrees = document.getElementById("dockTrees");
  const dctx = dockTrees.getContext("2d");

  const $ = (id) => document.getElementById(id);
  const els = {
    holeNum: $("holeNum"), parLabel: $("parLabel"), lengthLabel: $("lengthLabel"),
    toPinLabel: $("toPinLabel"), strokesLabel: $("strokesLabel"),
    bestLabel: $("bestLabel"), windLabel: $("windLabel"), windArrow: $("windArrow"),
    lieBox: $("lieBox"), lieLabel: $("lieLabel"), lieCanvas: $("lieCanvas"),
    hint: $("hint"), clubName: $("clubName"), clubPanel: $("clubPanel"), clubList: $("clubList"),
    clubIcon: $("clubIcon"), shotModeBtn: $("shotModeBtn"),
    swingBtn: $("swingBtn"),
    restartBtn: $("restartBtn"), reswingBtn: $("reswingBtn"),
    overlay: $("overlay"), overlayEyebrow: $("overlayEyebrow"), overlayTitle: $("overlayTitle"),
    overlayText: $("overlayText"), overlayBtn: $("overlayBtn"), teeList: $("teeList"),
    tutorialBtn: $("tutorialBtn"), scorecard: $("scorecard"),
  };

  const LS_KEY = "greenDrop.v1";
  function loadStorage() {
    try {
      const data = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
      const best = {};
      if (data.best && typeof data.best === "object") {
        for (const [k, v] of Object.entries(data.best)) {
          const n = Number(v);
          if (Number.isFinite(n)) best[Number(k)] = n;
        }
      }
      const bestRound = Number.isFinite(data.bestRound) ? data.bestRound : null;
      const tutorialDone = data.tutorialDone === true;
      return { best, bestRound, tutorialDone };
    } catch {
      return { best: {}, bestRound: null, tutorialDone: false };
    }
  }
  function saveStorage() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        best: state.best,
        bestRound: state.bestRound,
        tutorialDone: state.tutorialDone,
      }));
    } catch (_) { /* ignore quota / private mode */ }
  }

  // Palette matched to reference screenshots
  const PAL = {
    fairA: "#8FCF5A", fairB: "#78B84A",
    roughA: "#3F8A3A", roughB: "#347832",
    greenA: "#C8F078", greenB: "#B0E060", greenShade: "#8EC040", greenMark: "#5A8A50", greenEdge: "#2A5A28",
    sand: "#F2ECD8", sandShade: "#D0C8A8", sandEdge: "#2A2A2A",
    water: "#4AB8E8", waterDeep: "#2A88C0", waterHi: "#A8E8FF", waterShore: "#D8F0F8",
    treeRound1: "#3CB84A", treeRound2: "#2A9A38", treeRound3: "#58D068",
    treeTall1: "#2A8A38", treeTall2: "#1E6A28", treeTall3: "#3AAA48",
    treeDark: "#145020", trunk: "#5A3A22", trunkHi: "#7A5230",
    outline: "#141414", shadow: "rgba(20,60,30,0.35)",
    flowerBase: "#3A5A30",
    flowers: ["#E85898", "#F0D050", "#C858E0", "#E85050", "#FFF0F5", "#FF90C8", "#90E050"],
    ball: "#E2E5E1", cup: "#101010", flag: "#E22828", flagW: "#F5F5F5",
    ui: "#F07818", bad: "#E85050", target: "#E04040",
    golfer: "#F5F5F5", shirt: "#D82828", pants: "#2A2A2A", skin: "#F0C9A0",
  };

  // Meters ↔ pixels. Tuned so Regular corridors total ~6200 m and
  // driver 230 m ≈ 320 px ≈ one strong tee shot (scroll) on mid par 4s.
  const M_PER_PX = 0.72;
  function pxToM(px) { return px * M_PER_PX; }
  function mToPx(m) { return m / M_PER_PX; }
  function fmtMeters(px) { return `${Math.round(pxToM(px))} m`; }

  // Classic 14-club bag (ranges in meters): loft rises as range falls; bounce falls on wedges.
  // Woods/irons/wedges: aim sets direction; carry stays near full club range (±CLUB_AIM_MARGIN_M),
  // then power tip timing scales that carry. Putter/chip/flop: click places target within range.
  const CLUB_AIM_MARGIN_M = 10;
  const CLUBS = [
    { id: "driver", name: "driver", rangeM: 230, scatter: 0.50, loft: 0.10, bounce: 0.9, fixedCarry: true },
    { id: "wood3", name: "wood 3", rangeM: 210, scatter: 0.45, loft: 0.22, bounce: 0.7, fixedCarry: true },
    { id: "wood5", name: "wood 5", rangeM: 195, scatter: 0.40, loft: 0.26, bounce: 0.6, fixedCarry: true },
    { id: "iron3", name: "3 iron", rangeM: 180, scatter: 0.35, loft: 0.30, bounce: 0.5, fixedCarry: true },
    { id: "iron4", name: "4 iron", rangeM: 170, scatter: 0.30, loft: 0.35, bounce: 0.4, fixedCarry: true },
    { id: "iron5", name: "5 iron", rangeM: 160, scatter: 0.25, loft: 0.40, bounce: 0.3, fixedCarry: true },
    { id: "iron6", name: "6 iron", rangeM: 150, scatter: 0.20, loft: 0.44, bounce: 0.2, fixedCarry: true },
    { id: "iron7", name: "7 iron", rangeM: 140, scatter: 0.15, loft: 0.49, bounce: 0.1, fixedCarry: true },
    { id: "iron8", name: "8 iron", rangeM: 130, scatter: 0.10, loft: 0.54, bounce: 0.05, fixedCarry: true },
    { id: "iron9", name: "9 iron", rangeM: 120, scatter: 0.05, loft: 0.58, bounce: 0.02, fixedCarry: true },
    { id: "pwedge", name: "p. wedge", rangeM: 105, scatter: 0.025, loft: 0.70, bounce: 0.01, fixedCarry: true },
    { id: "swedge", name: "s. wedge", rangeM: 80, scatter: 0.02, loft: 0.85, bounce: 0.005, fixedCarry: true },
    { id: "lwedge", name: "l. wedge", rangeM: 60, scatter: 0.015, loft: 0.95, bounce: 0.002, fixedCarry: true },
    { id: "putter", name: "putter", rangeM: 20, scatter: 0.01, loft: 0, bounce: 0, fixedCarry: false },
  ];
  const DEFAULT_CLUB_INDEX = CLUBS.findIndex((c) => c.id === "swedge");

  function clubImageSrc(clubId) {
    return `assets/clubs/club-${clubId}.png`;
  }
  function setClubImage(el, clubId) {
    if (!el) return;
    const src = clubImageSrc(clubId);
    if (el.getAttribute("src") !== src) el.setAttribute("src", src);
    el.alt = "";
  }

  // Pixel golf ball (dimpled, lit TL / shaded BR) — matches assets/ball.png
  const ballSprite = new Image();
  ballSprite.src = "assets/ball.png";
  let ballSpriteReady = false;
  ballSprite.onload = () => {
    ballSpriteReady = true;
    if (els.lieCanvas) drawLiePreview(ballLie());
  };

  // Flight physics (pixel units). Wind accel scales by hole.wind * clubWindMul.
  const GRAVITY = 220;           // px/s² downward on vz
  const WIND_ACCEL = 14;         // px/s² per wind strength unit (full mul)
  const BOUNCE_MIN_VZ = 32;      // |vz| below this → roll instead of bounce
  const ROLL_STOP_SPEED = 10;    // horizontal speed (px/s) → settle
  // Tree walls: low-loft punches in; high-loft clears once above soft canopy.
  // Canopy drops with loft so wedges/short irons can fly over; driver cannot.
  const FOREST_CANOPY_MAX = 6;
  const FOREST_CANOPY_MIN = 2;
  // Extra arc for loft without changing carry (vx /= mul, vz *= mul).
  const FLIGHT_HEIGHT_LOFT0 = 0.12;
  const FLIGHT_HEIGHT_LOFT_GAIN = 0.75;
  // Leave room for bounce/roll so total ≈ intended (driver used to overshoot badly)
  const CARRY_BOUNCE_BUDGET = 0.7;
  // Green slope accel (px/s² per unit gradient). Stronger break so undulations
  // matter on mid putts (~1–3 m); firm lags can still hold line with pace.
  const SLOPE_ACCEL = 560;
  // Hole-out radius (px) — matches the smaller on-green cup draw.
  const CUP_HOLE_R = 3;
  // Soften / kill putt magnet when |slope| exceeds this (gradient units).
  const PUTT_MAGNET_SLOPE_SOFT = 0.035;
  const PUTT_MAGNET_SLOPE_KILL = 0.1;

  // Accuracy bands: |pos - SWEET| * 2. Slightly wider than the old arc meter
  // so one-pass timing stays fair at SWING_SPEED * ACCURACY_MUL.
  const SWING_BANDS = [
    { name: "perfect", maxDev: 0.08, factor: 0.05, bias: 0 },
    { name: "good", maxDev: 0.18, factor: 0.12, bias: 0.3 },
    { name: "ok", maxDev: 0.32, factor: 0.22, bias: 0.65 },
    { name: "miss", maxDev: 1, factor: 0.35, bias: 1 },
  ];
  // Two-press meter: power scales full bar (left tip=max, right=min),
  // then accuracy on sweet (offset right of center so it doesn't crowd power).
  // POWER_WINDOW is the left max zone / accuracy-arm gate.
  // ACCURACY_ARM_DELAY blocks the power press (and fast driver) from also locking aim.
  const POWER_WINDOW = 0.16;
  const SWEET_SPOT = 0.62;
  const SWING_SPEED = 1.1;
  const SWING_ACCURACY_SPEED_MUL = 1.2;
  const POWER_OVERFLOW = 0.85; // past left tip without press → slightly under max
  const ACCURACY_ARM_DELAY = 0.28; // seconds after power before accuracy can stop
  // Soft coach: freeze the meter after power so the accuracy tip can be read
  const TUTORIAL_ACCURACY_HOLD = 1.35; // seconds

  // Screen coords: +x right, +y down. Arrows map to wind push angle.
  const WIND_DIR_ANGLE = {
    "→": 0,
    "↘": Math.PI / 4,
    "↓": Math.PI / 2,
    "↙": (3 * Math.PI) / 4,
    "←": Math.PI,
    "↖": (-3 * Math.PI) / 4,
    "↑": -Math.PI / 2,
    "↗": -Math.PI / 4,
  };

  // Golf Clash–style corridor builders
  function fwPath(pts, r0, r1) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const t = pts.length === 1 ? 0 : i / (pts.length - 1);
      const r = Math.round((r0 || 44) * (1 - t) + (r1 || 36) * t);
      out.push({ x: pts[i][0], y: pts[i][1], r });
    }
    return out;
  }
  function bunk(x, y, s, variant) {
    s = s || 1;
    const v = ((variant || 0) * 17 + Math.round(x * 3 + y * 5)) | 0;
    const n = 7 + (v % 3); // 7–9 lobes
    const rx = 28 * s;
    const ry = 18 * s;
    const cx = rx;
    const cy = ry;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n - Math.PI * 0.55;
      // jagged radii: deep bays + bulging lobes
      const wave = 0.55 + 0.28 * Math.sin(i * 2.3 + v) + 0.18 * Math.cos(i * 1.7 + v * 0.4);
      const pinch = (i + v) % 4 === 0 ? 0.72 : ((i + v) % 3 === 0 ? 1.22 : 1);
      const rScale = clamp(wave * pinch, 0.48, 1.35);
      const px = cx + Math.cos(a) * rx * rScale;
      const py = cy + Math.sin(a) * ry * rScale * (0.85 + 0.2 * ((i + v) % 2));
      pts.push([Math.round(px), Math.round(py)]);
    }
    return { x: Math.round(x), y: Math.round(y), pts, cx: Math.round(cx), cy: Math.round(cy) };
  }
  function rimForest(ww, wh) {
    ww = ww || WORLD_W;
    wh = wh || WORLD_H;
    const rim = 28;
    return [
      { x: 0, y: 0, w: rim, h: wh, style: "mixed" },
      { x: ww - rim, y: 0, w: rim, h: wh, style: "round" },
      { x: 0, y: 0, w: ww, h: rim, style: "round" },
      { x: 0, y: wh - rim, w: ww, h: rim, style: "round" },
    ];
  }
  function pathNormals(path) {
    const n = [];
    for (let i = 0; i < path.length; i++) {
      const a = path[Math.max(0, i - 1)];
      const b = path[Math.min(path.length - 1, i + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;
      n.push({ nx: -dy, ny: dx, tx: dx, ty: dy });
    }
    return n;
  }
  function approachDir(path) {
    const a = path[Math.max(0, path.length - 2)];
    const b = path[path.length - 1];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    return { tx: dx / len, ty: dy / len, nx: -dy / len, ny: dx / len };
  }
  function greenShape(cup, dir, style) {
    const { tx, ty, nx, ny } = dir;
    const C = (ox, oy, r) => ({
      x: Math.round(cup.x + tx * ox + nx * oy),
      y: Math.round(cup.y + ty * ox + ny * oy),
      r,
    });
    switch (style) {
      case "oval":
        return [C(0, 0, 20), C(-14, 0, 16), C(14, 0, 16), C(0, 8, 12)];
      case "kidney":
        return [C(0, 0, 20), C(-10, 0, 14), C(8, 12, 16), C(14, 6, 12)];
      case "pear":
        return [C(6, 0, 22), C(-10, 0, 14), C(-18, 0, 11), C(14, 8, 12), C(14, -8, 12)];
      case "boomerang":
        return [C(0, 0, 14), C(-6, -16, 16), C(-6, 16, 16), C(8, -10, 12), C(8, 10, 12)];
      case "twin":
        return [C(0, -10, 18), C(0, 12, 18), C(4, 0, 12)];
      case "round":
      default:
        return [C(0, 0, 22), C(8, 6, 14), C(-8, 4, 12)];
    }
  }
  function greenExtent(cup, green) {
    let max = 0;
    for (const g of green || []) max = Math.max(max, Math.hypot(g.x - cup.x, g.y - cup.y) + g.r);
    return max || 24;
  }

  /** Deterministic seed contribution from greenStyle string. */
  function greenStyleSeed(style) {
    let s = 0;
    const str = style || "round";
    for (let i = 0; i < str.length; i++) s = (s + str.charCodeAt(i) * (i + 7)) | 0;
    return s >>> 0;
  }

  /**
   * Procedural green undulations — planar tilts, at most 1–2 break directions.
   * Always a cross-lean; ~half the greens also get an approach tilt.
   * Returns `{ slopes, slopeDirs }` — dirs are unit downhill vectors (1 or 2).
   * Plane: height += h * ((p-ox,p-oy)·u) / r  → constant gradient on the green.
   */
  function greenSlopes(cup, green, holeIndex, style, dir) {
    style = style || "round";
    const blobs = (green && green.length) ? green : [{ x: cup.x, y: cup.y, r: 22 }];
    const extent = Math.max(18, greenExtent(cup, green));
    const seed = hash((holeIndex + 1) * 31 + 5, greenStyleSeed(style));
    const far = blobs.slice().sort((a, b) => dist(a, cup) - dist(b, cup)).pop() || blobs[0];
    let tx = dir && dir.tx, ty = dir && dir.ty, nx = dir && dir.nx, ny = dir && dir.ny;
    if (!(tx != null && ty != null && Math.hypot(tx, ty) > 0.5)) {
      let ax = far.x - cup.x, ay = far.y - cup.y;
      let al = Math.hypot(ax, ay);
      if (al < 1) { ax = 0; ay = -1; al = 1; }
      tx = ax / al; ty = ay / al;
      nx = -ty; ny = tx;
    }
    const sideSign = ((holeIndex + seed) & 1) ? 1 : -1;
    const leanH = (hash(seed ^ (holeIndex * 17 + 1), 99) & 1) ? 2 : -2;
    // u points uphill; downhill dir is -u * sign(h) when h>0 means high along +u.
    const plane = (ux, uy, h) => ({
      plane: true,
      ox: cup.x,
      oy: cup.y,
      ux,
      uy,
      r: extent,
      h,
    });

    const ux = nx * sideSign;
    const uy = ny * sideSign;
    const slopes = [plane(ux, uy, leanH)];
    const slopeDirs = [{
      x: -ux * Math.sign(leanH),
      y: -uy * Math.sign(leanH),
    }];

    // Optional second direction: approach high → drain toward cup along fairway.
    if (((holeIndex + seed) % 2) === 0) {
      const riseH = 1 + (hash(seed, holeIndex * 13 + 7) % 2);
      // Uphill toward approach (−t); downhill toward cup (+t).
      slopes.push(plane(-tx, -ty, riseH));
      slopeDirs.push({ x: tx, y: ty });
    }

    return { slopes, slopeDirs };
  }
  function bunkerHitsGreen(sand, green) {
    const pts = sand.pts.map(([x, y]) => ({ x: sand.x + x, y: sand.y + y }));
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const q of pts) {
      minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x);
      minY = Math.min(minY, q.y); maxY = Math.max(maxY, q.y);
    }
    for (let py = minY | 0; py <= maxY; py += 3) {
      for (let px = minX | 0; px <= maxX; px += 3) {
        if (!inSandPolyStatic({ x: px, y: py }, sand)) continue;
        for (const g of green || []) {
          const dx = px - g.x, dy = py - g.y;
          if (dx * dx + dy * dy <= (g.r + 2) * (g.r + 2)) return true;
        }
      }
    }
    return false;
  }
  function inSandPolyStatic(p, sand) {
    const pts = sand.pts.map(([x, y]) => ({ x: sand.x + x, y: sand.y + y }));
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
      const intersect = ((yi > p.y) !== (yj > p.y)) && (p.x < ((xj - xi) * (p.y - yi)) / (yj - yi + 0.0001) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }
  function sideForest(path, rw, rn) {
    const norms = pathNormals(path);
    const patches = [];
    for (let i = 0; i < path.length; i++) {
      const t = path.length === 1 ? 0 : i / (path.length - 1);
      const rad = (rw || 44) * (1 - t) + (rn || 36) * t;
      const gap = rad + 16;
      const wall = 34;
      const { nx, ny } = norms[i];
      for (const side of [-1, 1]) {
        const cx = path[i][0] + nx * side * (gap + wall * 0.4);
        const cy = path[i][1] + ny * side * (gap + wall * 0.4);
        patches.push({
          x: Math.round(cx - wall / 2),
          y: Math.round(cy - wall / 2),
          w: wall,
          h: wall + 6,
          style: "round",
        });
      }
    }
    return patches;
  }
  function edgeBunkers(path, rw, rn, green, cup) {
    const norms = pathNormals(path);
    const dir = approachDir(path);
    const out = [];
    const idxs = [];
    const last = Math.max(1, path.length - 1);
    if (path.length >= 3) idxs.push(Math.max(1, Math.round(last * 0.22)));
    if (path.length >= 4) idxs.push(Math.floor(path.length / 2));
    if (path.length >= 5) idxs.push(Math.max(1, Math.round(last * 0.78)));
    idxs.forEach((i, k) => {
      const t = i / Math.max(1, path.length - 1);
      const rad = (rw || 44) * (1 - t) + (rn || 36) * t;
      const side = k % 2 === 0 ? 1 : -1;
      const { nx, ny } = norms[i];
      const scale = 1.55 + (k % 3) * 0.2;
      const bx = path[i][0] + nx * side * (rad + 10) - 28 * scale;
      const by = path[i][1] + ny * side * (rad + 10) - 18 * scale;
      out.push(bunk(bx, by, scale, k + i));
    });
    // Green-side bunkers — always outside green extent
    const clear = greenExtent(cup, green) + 32;
    const { nx, ny } = dir;
    for (const side of [-1, 1]) {
      const scale = side < 0 ? 1.75 : 1.5;
      let bx = cup.x + nx * side * clear - 28 * scale;
      let by = cup.y + ny * side * clear - 18 * scale;
      let s = bunk(bx, by, scale, side + 3);
      for (let n = 0; n < 12 && bunkerHitsGreen(s, green); n++) {
        bx += nx * side * 10;
        by += ny * side * 10;
        s = bunk(bx, by, scale, side + 3 + n);
      }
      if (!bunkerHitsGreen(s, green)) out.push(s);
    }
    // Drop any bunker that still touches green (fairway-shoulder near short greens)
    return out.filter((s) => {
      if (bunkerHitsGreen(s, green)) return false;
      // also reject if bunker center is inside green soft radius
      const cx = s.x + (s.cx || 30), cy = s.y + (s.cy || 18);
      for (const g of green || []) {
        const dx = cx - g.x, dy = cy - g.y;
        if (dx * dx + dy * dy <= (g.r + 22) * (g.r + 22)) return false;
      }
      return true;
    });
  }
  function flowerBeds(path, rw, rn) {
    const norms = pathNormals(path);
    const beds = [];
    const picks = [Math.floor(path.length * 0.3), Math.floor(path.length * 0.65)].filter((i, idx, a) => i > 0 && i < path.length - 1 && a.indexOf(i) === idx);
    picks.forEach((i, k) => {
      const t = i / Math.max(1, path.length - 1);
      const rad = (rw || 44) * (1 - t) + (rn || 36) * t;
      const side = k % 2 === 0 ? -1 : 1;
      const { nx, ny } = norms[i];
      const cx = path[i][0] + nx * side * (rad + 22);
      const cy = path[i][1] + ny * side * (rad + 22);
      beds.push({
        x: Math.round(cx - 14), y: Math.round(cy - 18),
        w: 28 + (k % 2) * 8, h: 36 + (k % 2) * 10,
      });
    });
    return beds;
  }
  function holeWorldFromPath(path, rw, extras) {
    const pad = Math.max(rw || 44, 50) + 48;
    let maxX = 0, maxY = 0;
    for (const [x, y] of path || []) {
      maxX = Math.max(maxX, x + pad);
      maxY = Math.max(maxY, y + pad);
    }
    for (const r of extras || []) {
      if (!r) continue;
      if (r.w != null && r.h != null) {
        maxX = Math.max(maxX, (r.x || 0) + r.w + 8);
        maxY = Math.max(maxY, (r.y || 0) + r.h + 8);
      } else if (r.r != null) {
        maxX = Math.max(maxX, (r.x || 0) + r.r + 8);
        maxY = Math.max(maxY, (r.y || 0) + r.r + 8);
      }
    }
    return {
      worldW: Math.max(WORLD_W, VIEW_W, Math.ceil(maxX)),
      worldH: Math.max(WORLD_H, VIEW_H, Math.ceil(maxY)),
    };
  }
  function pathLengthPx(path) {
    let s = 0;
    for (let i = 1; i < (path || []).length; i++) {
      s += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    }
    return s;
  }
  // Tee sets: Championship furthest back (pathT 0), Regular ~6200 m, Forward shortest
  // Marker colors match classic course tee plaques (black / white / red).
  const TEE_SETS = [
    { id: "championship", name: "Championship", pathT: 0, color: "#1A1C20", grassA: "#6EAE48", grassB: "#5E9A3C" },
    { id: "regular", name: "Regular", pathT: 0.07, color: "#F2F2EE", grassA: "#6EAE48", grassB: "#5E9A3C" },
    { id: "forward", name: "Forward", pathT: 0.14, color: "#E02828", grassA: "#6EAE48", grassB: "#5E9A3C" },
  ];
  const TEE_BOX_SIZE = 19; // dark-grass square (odd → centered on tee)
  const TEE_BOX_MIN_GAP = TEE_BOX_SIZE + 4; // keep mats from stacking on short holes
  const TEE_BY_ID = Object.fromEntries(TEE_SETS.map((t) => [t.id, t]));
  const DEFAULT_TEE_ID = "regular";
  function clamp01(t) { return Math.max(0, Math.min(1, t)); }
  /** Point at fraction `t` of path arc length (0 = start, 1 = end). */
  function pointAlongPath(path, t) {
    if (!path || !path.length) return { x: 0, y: 0 };
    const total = pathLengthPx(path);
    const target = clamp01(t) * total;
    if (target <= 0) return { x: path[0][0], y: path[0][1] };
    let acc = 0;
    for (let i = 1; i < path.length; i++) {
      const d = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
      if (acc + d >= target) {
        const u = d ? (target - acc) / d : 0;
        return {
          x: Math.round(path[i - 1][0] + (path[i][0] - path[i - 1][0]) * u),
          y: Math.round(path[i - 1][1] + (path[i][1] - path[i - 1][1]) * u),
        };
      }
      acc += d;
    }
    const last = path[path.length - 1];
    return { x: last[0], y: last[1] };
  }
  // Keep fairway blobs overlapping on long corridors
  function densifyPath(path, maxStep) {
    maxStep = maxStep || 46;
    if (!path || path.length < 2) return (path || []).map((p) => [p[0], p[1]]);
    const out = [[path[0][0], path[0][1]]];
    for (let i = 1; i < path.length; i++) {
      const a = out[out.length - 1];
      const b = path[i];
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(1, Math.ceil(d / maxStep));
      for (let k = 1; k <= n; k++) {
        const t = k / n;
        out.push([
          Math.round(a[0] + (b[0] - a[0]) * t),
          Math.round(a[1] + (b[1] - a[1]) * t),
        ]);
      }
    }
    return out;
  }
  // Scale a control polyline so Regular remaining length ≈ lengthM (Championship is full path)
  function makeCorridor(controls, lengthM, pad) {
    pad = pad == null ? 96 : pad;
    let path = (controls || []).map((p) => [p[0], p[1]]);
    // Regular pathT may grow on short holes via TEE_BOX_MIN_GAP — use nominal set value here
    const regularT = TEE_BY_ID.regular.pathT;
    const champM = lengthM / Math.max(0.01, 1 - regularT);
    const target = mToPx(champM);
    const cur = pathLengthPx(path) || 1;
    const s = target / cur;
    const x0 = path[0][0], y0 = path[0][1];
    path = path.map(([x, y]) => [x0 + (x - x0) * s, y0 + (y - y0) * s]);
    path = densifyPath(path, 46);
    let minX = Infinity, minY = Infinity;
    for (const [x, y] of path) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
    }
    const dx = pad - minX, dy = pad - minY;
    return path.map(([x, y]) => [Math.round(x + dx), Math.round(y + dy)]);
  }
  function waterBeside(path, t, side, w, h) {
    const norms = pathNormals(path);
    const i = Math.max(0, Math.min(path.length - 1, Math.round(t * (path.length - 1))));
    const { nx, ny } = norms[i] || { nx: 1, ny: 0 };
    const gap = 36 + w * 0.35;
    const cx = path[i][0] + nx * side * gap;
    const cy = path[i][1] + ny * side * gap;
    return { x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w, h };
  }
  let _holeSlopeSeq = 0;
  function holeDef(o) {
    const rw = o.rw || 44;
    const rn = o.rn || 36;
    const path = (o.path || []).map((p) => [p[0], p[1]]);
    const totalPx = pathLengthPx(path);
    const teesIn = o.tees || {};
    const tees = {};
    const norms = pathNormals(path);
    let prevArc = -Infinity;
    for (const set of TEE_SETS) {
      let pathT = teesIn[set.id] && teesIn[set.id].pathT != null
        ? teesIn[set.id].pathT
        : set.pathT;
      // Enforce a minimum arc gap so dark-grass squares stay distinct
      if (totalPx > 0) {
        const minT = (prevArc + TEE_BOX_MIN_GAP) / totalPx;
        if (pathT < minT) pathT = minT;
      }
      pathT = clamp01(pathT);
      const pt = (teesIn[set.id] && teesIn[set.id].x != null)
        ? { x: teesIn[set.id].x, y: teesIn[set.id].y }
        : pointAlongPath(path, pathT);
      const ni = Math.max(0, Math.min(path.length - 1, Math.round(pathT * (path.length - 1))));
      const n = norms[ni] || { nx: 1, ny: 0, tx: 0, ty: -1 };
      tees[set.id] = {
        pathT,
        x: pt.x,
        y: pt.y,
        nx: n.nx, ny: n.ny, tx: n.tx, ty: n.ty,
        lengthM: Math.round(totalPx * (1 - pathT) * M_PER_PX),
      };
      prevArc = pathT * totalPx;
    }
    const active = tees[DEFAULT_TEE_ID] || tees.championship;
    const tee = { x: active.x, y: active.y };
    const cup = { x: path[path.length - 1][0], y: path[path.length - 1][1] };
    const fairway = fwPath(path, rw, rn);
    const dir = approachDir(path);
    const greenStyle = o.greenStyle || "round";
    const green = o.green || greenShape(cup, dir, greenStyle);
    const holeIndex = _holeSlopeSeq++;
    const baked = o.slopes
      ? { slopes: o.slopes, slopeDirs: o.slopeDirs || [] }
      : greenSlopes(cup, green, holeIndex, greenStyle, dir);
    const slopes = baked.slopes;
    const slopeDirs = baked.slopeDirs;
    const targets = [];
    for (let i = 1; i < path.length - 1; i++) targets.push({ x: path[i][0], y: path[i][1] });
    if (!targets.length && path.length >= 2) {
      const m = path[Math.floor(path.length / 2)];
      targets.push({ x: m[0], y: m[1] });
    }
    const autoForest = sideForest(path, rw, rn);
    const autoSand = o.sand || edgeBunkers(path, rw, rn, green, cup);
    const autoFlowers = o.flowers || flowerBeds(path, rw, rn);
    const water = o.water || [];
    const sized = holeWorldFromPath(path, rw, [...water, ...(o.extraForest || [])]);
    const worldW = o.worldW || sized.worldW;
    const worldH = o.worldH || sized.worldH;
    const lengthM = active.lengthM;
    return {
      name: o.name, par: o.par, wind: o.wind, windDir: o.windDir,
      worldW, worldH,
      path, lengthM, tees,
      tee, cup,
      rough: [{ x: 8, y: 8, w: worldW - 16, h: worldH - 16 }],
      fairway, green, slopes, slopeDirs,
      sand: autoSand,
      water,
      forest: (o.forest || rimForest(worldW, worldH)).concat(o.extraForest || []).concat(autoForest),
      flowers: autoFlowers,
      bridges: o.bridges || [],
      targets,
    };
  }

  // 18 holes — long scrolling corridors; Regular tee arc lengths ≈ 6200 m total
  const path4 = makeCorridor([[180, 280], [175, 230], [170, 185], [140, 150], [100, 120], [70, 90], [55, 60]], 390);
  const path7 = makeCorridor([[175, 250], [155, 210], [135, 175], [120, 145]], 150);
  const path12 = makeCorridor([[80, 240], [100, 195], [120, 150], [135, 110]], 140);
  const path16 = makeCorridor([[120, 265], [122, 220], [124, 175], [125, 130], [126, 95]], 160);
  const path18 = makeCorridor([[110, 35], [115, 75], [120, 120], [125, 165], [128, 210], [130, 250], [132, 285]], 400);
  const HOLES = [
    // 1 straight / slight bend
    holeDef({
      name: "Clubhouse Opener", par: 4, wind: 1.1, windDir: "↗",
      path: makeCorridor([[120, 290], [122, 245], [128, 200], [135, 155], [140, 110], [142, 70]], 360),
      greenStyle: "round",
    }),
    // 2 double bend / S
    holeDef({
      name: "East Climb", par: 5, wind: 2.4, windDir: "↑",
      path: makeCorridor([[70, 290], [95, 250], [130, 220], [150, 175], [130, 130], [110, 90], [130, 50], [150, 35]], 505),
      rw: 42, rn: 32, greenStyle: "pear",
    }),
    // 3 slight bend
    holeDef({
      name: "Pine Ridge", par: 4, wind: 1.8, windDir: "↑",
      path: makeCorridor([[130, 285], [132, 235], [138, 185], [145, 135], [150, 90], [152, 50]], 375),
      greenStyle: "oval",
    }),
    // 4 dogleg left
    holeDef({
      name: "Corner Turn", par: 4, wind: 2.0, windDir: "↖",
      path: path4,
      rw: 40, rn: 32, greenStyle: "kidney",
      water: [waterBeside(path4, 0.55, -1, 78, 118)],
    }),
    // 5 wide → narrow (horizontal-ish)
    holeDef({
      name: "North Traverse", par: 4, wind: 3.1, windDir: "←",
      path: makeCorridor([[200, 200], [165, 185], [130, 160], [95, 140], [65, 130], [45, 140]], 335),
      rw: 52, rn: 28, greenStyle: "boomerang",
    }),
    // 6 slight bend down
    holeDef({
      name: "Descent Lane", par: 4, wind: 1.5, windDir: "↓",
      path: makeCorridor([[140, 40], [145, 85], [150, 130], [148, 175], [140, 220], [130, 265]], 350),
      greenStyle: "twin",
    }),
    // 7 short par 3
    holeDef({
      name: "Practice Bend", par: 3, wind: 1.3, windDir: "↙",
      path: path7,
      rw: 40, rn: 34, greenStyle: "kidney",
      water: [waterBeside(path7, 0.5, 1, 68, 96)],
    }),
    // 8 wide → narrow across bottom
    holeDef({
      name: "Range Side", par: 4, wind: 0.9, windDir: "←",
      path: makeCorridor([[200, 260], [165, 250], [125, 235], [90, 220], [60, 200], [45, 185]], 325),
      rw: 50, rn: 30, greenStyle: "oval",
    }),
    // 9 dogleg right
    holeDef({
      name: "Front Home", par: 4, wind: 1.6, windDir: "↖",
      path: makeCorridor([[80, 290], [90, 245], [100, 200], [130, 165], [155, 125], [165, 85], [160, 55]], 370),
      rw: 40, rn: 32, greenStyle: "pear",
    }),
    // 10 slight bend up
    holeDef({
      name: "West Start", par: 4, wind: 1.4, windDir: "↑",
      path: makeCorridor([[100, 290], [105, 245], [112, 200], [118, 155], [122, 110], [125, 65]], 345),
      greenStyle: "round",
    }),
    // 11 long corridor
    holeDef({
      name: "Timber Edge", par: 5, wind: 2.2, windDir: "↑",
      path: makeCorridor([[80, 295], [85, 255], [90, 215], [95, 175], [100, 135], [105, 95], [110, 60], [115, 35]], 515),
      rw: 38, rn: 30, greenStyle: "oval",
    }),
    // 12 short par 3 with water
    holeDef({
      name: "Lake Carry", par: 3, wind: 2.8, windDir: "↗",
      path: path12,
      rw: 36, rn: 30, greenStyle: "boomerang",
      water: [waterBeside(path12, 0.45, -1, 80, 124)],
    }),
    // 13 dogleg right across top
    holeDef({
      name: "Crown Dogleg", par: 4, wind: 1.7, windDir: "→",
      path: makeCorridor([[50, 70], [85, 75], [120, 90], [150, 125], [165, 165], [170, 205]], 380),
      rw: 40, rn: 32, greenStyle: "kidney",
    }),
    // 14 S-curve down
    holeDef({
      name: "Meadow Drop", par: 4, wind: 1.2, windDir: "↘",
      path: makeCorridor([[70, 45], [100, 80], [135, 110], [150, 150], [130, 190], [115, 230], [130, 265]], 365),
      rw: 40, rn: 34, greenStyle: "twin",
    }),
    // 15 slight bend
    holeDef({
      name: "Glade Run", par: 4, wind: 2.0, windDir: "↓",
      path: makeCorridor([[110, 45], [112, 95], [115, 145], [118, 195], [120, 245], [122, 280]], 355),
      greenStyle: "round",
    }),
    // 16 short par 3 with pond
    holeDef({
      name: "Pond Guard", par: 3, wind: 2.5, windDir: "↑",
      path: path16,
      rw: 38, rn: 32, greenStyle: "pear",
      water: [waterBeside(path16, 0.5, 1, 74, 108)],
    }),
    // 17 dogleg left down
    holeDef({
      name: "Avenue", par: 4, wind: 1.0, windDir: "↙",
      path: makeCorridor([[175, 55], [160, 100], [155, 145], [130, 185], [100, 220], [85, 255], [80, 280]], 385),
      rw: 40, rn: 32, greenStyle: "boomerang",
    }),
    // 18 long finish
    holeDef({
      name: "Clubhouse Finish", par: 4, wind: 1.9, windDir: "↓",
      path: path18,
      rw: 40, rn: 34, greenStyle: "oval",
      water: [waterBeside(path18, 0.4, -1, 76, 118)],
    }),
  ];

  // Shift each hole so the fairway corridor sits on the horizontal middle
  (function centerFairways() {
    for (const h of HOLES) {
      const mid = h.worldW / 2;
      const blobs = h.fairway || [];
      if (!blobs.length) continue;
      const cx = blobs.reduce((s, b) => s + b.x, 0) / blobs.length;
      let dx = Math.round(mid - cx);
      if (!dx) continue;
      const moveX = (o) => {
        if (!o) return;
        if (o.x != null) o.x += dx;
        if (o.ox != null) o.ox += dx;
      };
      const moveList = (arr) => { for (const o of arr || []) moveX(o); };
      moveX(h.tee); moveX(h.cup);
      if (h.tees) {
        for (const t of Object.values(h.tees)) moveX(t);
      }
      for (const p of h.path || []) p[0] += dx;
      moveList(h.fairway); moveList(h.green); moveList(h.slopes); moveList(h.sand);
      moveList(h.water); moveList(h.bridges); moveList(h.targets); moveList(h.flowers);
      moveList(h.rough);
      for (const f of h.forest || []) {
        if (f.w >= h.worldW - 4) continue;
        if (f.x <= 2) f.w = Math.max(24, Math.min(h.worldW - 8, f.w + dx));
        else if (f.x + f.w >= h.worldW - 4) {
          f.x = Math.max(0, f.x + dx);
          f.w = Math.max(24, h.worldW - f.x);
        } else moveX(f);
      }
    }
  })();

  const COURSE_PAR = HOLES.reduce((s, h) => s + h.par, 0);
  const persisted = loadStorage();
  const state = {
    holeIndex: 0, strokes: 0, totalStrokes: 0,
    card: [], best: persisted.best, bestRound: persisted.bestRound,
    tutorialDone: persisted.tutorialDone,
    tutorial: { active: false, step: null, clubNudged: false },
    overlayMode: null, teeId: DEFAULT_TEE_ID,
    ball: { x: 0, y: 0 }, lastSafe: { x: 0, y: 0 },
    clubIndex: DEFAULT_CLUB_INDEX, shotMode: "full", phase: "idle",
    swingStage: "power", swingPos: 1, swingDir: 1, swingPower: 0, swingValue: 0.5,
    swingFactor: 0.22, swingLabel: "—", swingSide: 1, swingBias: 0,
    accuracyArmed: false, accuracyArmAt: 0, swingHoldUntil: 0,
    pointer: null, flight: null,
    facing: 1, aim: -Math.PI / 2, aimDist: 0, aimLocked: false, courseDirty: true,
    cam: { x: 0, y: 0 },
  };

  function currentHole() { return HOLES[state.holeIndex]; }
  function currentClub() { return CLUBS[state.clubIndex]; }
  /** Chip/flop only on scoring wedges — always optional, no distance gate. */
  const SHOT_MODES = ["full", "chip", "flop"];
  function shotModesAllowed(club = currentClub()) {
    if (!club) return false;
    return club.id === "pwedge" || club.id === "swedge" || club.id === "lwedge";
  }
  function activeShotMode(club = currentClub()) {
    return shotModesAllowed(club) ? state.shotMode : "full";
  }
  /** Idle tip reflects chip/flop when those modes are on. */
  function shotModeIdleHint() {
    const mode = activeShotMode();
    if (mode === "chip") return "aim · chip · swing";
    if (mode === "flop") return "aim · flop · swing";
    return "aim · club · swing";
  }
  /** Cycle full → chip → flop → full; no-op when not a wedge or not idle. */
  function cycleShotMode() {
    if (state.phase !== "idle") return;
    if (!shotModesAllowed()) return;
    const i = SHOT_MODES.indexOf(state.shotMode);
    state.shotMode = SHOT_MODES[(i < 0 ? 0 : i + 1) % SHOT_MODES.length];
    state.aimDist = resolveAimDist(state.aimDist);
    updateHud();
    if (state.pointer) refreshHoverHint();
    else setHint(shotModeIdleHint());
  }
  /**
   * Club params after shotMode overrides. full = stock;
   * chip = mid click-aim (between full & flop), low loft, boosted bounce/roll;
   * flop = shortest click-aim, high loft, soft land (no bounce).
   * Range order: full > chip > flop.
   */
  function effectiveShot(club = currentClub()) {
    const mode = shotModesAllowed(club) ? state.shotMode : "full";
    if (mode === "chip") {
      return {
        mode,
        loft: club.loft * 0.45,
        bounce: clamp(0.35 + (club.loft - 0.7) * 0.8, 0.35, 0.55),
        rangeM: Math.min(club.rangeM * 0.55, 45),
        fixedCarry: false,
      };
    }
    if (mode === "flop") {
      return {
        mode,
        loft: Math.min(1.1, club.loft + 0.15),
        bounce: 0,
        rangeM: Math.min(club.rangeM * 0.30, 22),
        fixedCarry: false,
      };
    }
    return {
      mode: "full",
      loft: club.loft,
      bounce: club.bounce || 0,
      rangeM: club.rangeM,
      fixedCarry: !!club.fixedCarry,
    };
  }
  /** Assign club; rebake course when entering/leaving putter (green putt-mode marks). */
  function setClubIndex(idx) {
    const next = ((idx % CLUBS.length) + CLUBS.length) % CLUBS.length;
    if (next === state.clubIndex) {
      if (!shotModesAllowed(CLUBS[next])) state.shotMode = "full";
      return;
    }
    const wasPutter = CLUBS[state.clubIndex]?.id === "putter";
    const isPutter = CLUBS[next]?.id === "putter";
    state.clubIndex = next;
    if (!shotModesAllowed(CLUBS[next])) state.shotMode = "full";
    if (wasPutter !== isPutter) state.courseDirty = true;
  }
  function holeW() { return currentHole().worldW || WORLD_W; }
  function holeH() { return currentHole().worldH || WORLD_H; }
  function pointInRect(p, r) { return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }
  /** Driver is tee-only — locked after the opening shot of the hole. */
  function driverAllowed() { return state.strokes === 0; }
  function clubAllowed(club) {
    if (!club) return false;
    if (club.id === "driver" && !driverAllowed()) return false;
    return true;
  }

  // Soft rounded + wiggly edge so terrain doesn't look like boxes
  function organicRadius(r) {
    return Math.min(22, Math.max(10, Math.min(r.w, r.h) * 0.28));
  }
  function edgeWiggle(x, y) {
    return ((hash(x | 0, y | 0) % 9) - 4) * 0.55;
  }
  function inOrganicRect(p, r) {
    const rad = organicRadius(r);
    const x = p.x, y = p.y;
    const left = r.x + edgeWiggle(x, y);
    const top = r.y + edgeWiggle(x + 3, y);
    const right = r.x + r.w + edgeWiggle(x + 7, y + 2);
    const bottom = r.y + r.h + edgeWiggle(x + 1, y + 5);
    if (x < left - 1 || x > right + 1 || y < top - 1 || y > bottom + 1) return false;
    const ix = Math.max(left + rad, Math.min(x, right - rad));
    const iy = Math.max(top + rad, Math.min(y, bottom - rad));
    // inside center box
    if (x >= left + rad && x <= right - rad && y >= top + rad && y <= bottom - rad) return true;
    // rounded corners
    const dx = x - ix, dy = y - iy;
    return dx * dx + dy * dy <= (rad + edgeWiggle(ix, iy) * 0.3) * (rad + edgeWiggle(ix, iy) * 0.3);
  }
  function inAny(p, rects) { return (rects || []).some((r) => inOrganicRect(p, r)); }
  function inAnyStrict(p, rects) { return (rects || []).some((r) => pointInRect(p, r)); }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function hash(x, y) { return ((x * 374761393 + y * 668265263) ^ (x * y * 127)) >>> 0; }

  // Fairway = overlapping soft circles (never a box)
  function inFairwayBlob(p, b) {
    const wobble = edgeWiggle(p.x, p.y) * 0.9;
    const dx = p.x - b.x, dy = p.y - b.y;
    const rr = b.r + wobble;
    return dx * dx + dy * dy <= rr * rr;
  }
  function inFairway(p) {
    return (currentHole().fairway || []).some((b) => inFairwayBlob(p, b));
  }

  function inGreen(p) {
    return (currentHole().green || []).some((g) => dist(p, { x: g.x, y: g.y }) <= g.r);
  }

  function pointInHoleGreen(p, hole) {
    return (hole.green || []).some((g) => dist(p, { x: g.x, y: g.y }) <= g.r);
  }

  /**
   * Active planar tilt at p — same plane for height, shade, arrows, and roll.
   * One plane: that break everywhere. Two planes: approach half uses the 2nd,
   * the rest uses the cross-lean (no diagonal blend).
   */
  function activeSlopePlane(p, hole) {
    const slopes = hole && hole.slopes;
    if (!slopes || !slopes.length || !slopes[0].plane) return null;
    let s = slopes[0];
    if (slopes.length >= 2 && slopes[1].plane) {
      const along = (p.x - slopes[1].ox) * slopes[1].ux + (p.y - slopes[1].oy) * slopes[1].uy;
      if (along > 0) s = slopes[1];
    }
    return s;
  }

  /** Relative green height at p (0 off-green). Planar tilts and legacy radial bumps. */
  function greenHeightAt(p, hole) {
    if (!hole || !pointInHoleGreen(p, hole)) return 0;
    const plane = activeSlopePlane(p, hole);
    if (plane) {
      if (!(plane.r > 0)) return 0;
      return plane.h * ((p.x - plane.ox) * plane.ux + (p.y - plane.oy) * plane.uy) / plane.r;
    }
    let h = 0;
    for (const s of hole.slopes || []) {
      const d = dist(p, s);
      if (d >= s.r || !(s.r > 0)) continue;
      const t = 1 - d / s.r;
      h += s.h * t * t;
    }
    return h;
  }

  /** Plane gradient → downhill `{ sx, sy }`. */
  function planeDownhill(s) {
    if (!s || !(s.r > 0)) return { sx: 0, sy: 0 };
    return { sx: -(s.h * s.ux) / s.r, sy: -(s.h * s.uy) / s.r };
  }

  /** Downhill at p — matches greenHeightAt / shade bands (same active plane). */
  function greenSlopeAt(p, hole) {
    if (!hole || !pointInHoleGreen(p, hole)) return { sx: 0, sy: 0 };
    const plane = activeSlopePlane(p, hole);
    if (plane) return planeDownhill(plane);
    // Legacy radial bumps → numeric gradient
    const e = 1;
    const hx0 = greenHeightAt({ x: p.x - e, y: p.y }, hole);
    const hx1 = greenHeightAt({ x: p.x + e, y: p.y }, hole);
    const hy0 = greenHeightAt({ x: p.x, y: p.y - e }, hole);
    const hy1 = greenHeightAt({ x: p.x, y: p.y + e }, hole);
    return {
      sx: -(hx1 - hx0) / (2 * e),
      sy: -(hy1 - hy0) / (2 * e),
    };
  }
  function inSandPoly(p, sand) {
    // bbox check then point-in-polygon
    const pts = sand.pts.map(([x, y]) => ({ x: sand.x + x, y: sand.y + y }));
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const q of pts) { minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x); minY = Math.min(minY, q.y); maxY = Math.max(maxY, q.y); }
    if (p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) return false;
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
      const intersect = ((yi > p.y) !== (yj > p.y)) && (p.x < ((xj - xi) * (p.y - yi)) / (yj - yi + 0.0001) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function inWaterBody(p, r) {
    if (!r) return false;
    if (r.ocean) {
      const nx = (p.x - (r.x + r.w * 0.15)) / (r.w * 0.72);
      const ny = (p.y - (r.y + r.h * 0.2)) / (r.h * 0.7);
      if (nx * nx * 0.75 + ny * ny <= 1) return true;
      if (p.x < r.x + 18 && p.y < r.y + r.h * 0.55) return true;
      return false;
    }
    return inOrganicRect(p, r);
  }
  function inWater(p) {
    return (currentHole().water || []).some((r) => inWaterBody(p, r));
  }

  function terrainAt(p) {
    const h = currentHole();
    if (inAny(p, h.bridges)) return "bridge";
    if (inWater(p)) return "water";
    if ((h.sand || []).some((s) => inSandPoly(p, s))) return "sand";
    if (inGreen(p)) return "green";
    if (inFairway(p)) return "fairway";
    if (inAny(p, h.forest)) return "forest";
    if (inAny(p, h.rough)) return "rough";
    return "oob";
  }

  /** Active tee mat under the ball (dark grass square). */
  function inTeeBox(p) {
    const hole = currentHole();
    const tee = hole.tees && hole.tees[state.teeId || DEFAULT_TEE_ID];
    if (!tee) return false;
    const half = (TEE_BOX_SIZE - 1) >> 1;
    return Math.abs(p.x - tee.x) <= half + 0.5 && Math.abs(p.y - tee.y) <= half + 0.5;
  }

  /** Display lie for HUD — tee on opening shot / mat, else terrain. */
  function ballLie() {
    if (state.strokes === 0 || inTeeBox(state.ball)) return "tee";
    const t = terrainAt(state.ball);
    if (t === "forest") return "trees";
    return t;
  }

  function drawLiePreview(lie) {
    const cnv = els.lieCanvas;
    if (!cnv) return;
    const c = cnv.getContext("2d");
    const w = cnv.width, h = cnv.height;
    c.imageSmoothingEnabled = false;
    const px = (x, y, col) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      c.fillStyle = col;
      c.fillRect(x, y, 1, 1);
    };
    const groundY = h - 10;
    // Sky strip
    for (let y = 0; y < groundY; y++) {
      for (let x = 0; x < w; x++) px(x, y, y < 6 ? "#87B8E0" : "#9EC8E8");
    }
    const fillGround = (y0, colA, colB, period) => {
      for (let y = y0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const dither = ((x / period) | 0) + ((y / period) | 0);
          px(x, y, (dither & 1) ? colB : colA);
        }
      }
    };
    if (lie === "tee") {
      fillGround(groundY, "#6EAE48", "#5E9A3C", 2);
      for (let x = 0; x < w; x++) px(x, groundY, "#3A6E28");
    } else if (lie === "fairway") {
      fillGround(groundY, PAL.fairA || "#7EC850", PAL.fairB || "#6EAE40", 3);
    } else if (lie === "green") {
      fillGround(groundY, PAL.greenA, PAL.greenB, 2);
    } else if (lie === "rough") {
      fillGround(groundY, PAL.roughA, PAL.roughB, 2);
    } else if (lie === "sand") {
      fillGround(groundY - 1, PAL.sand, PAL.sandShade, 2);
      for (let x = 0; x < w; x++) px(x, groundY - 1, PAL.sandEdge);
      // Ball sits slightly nestled
    } else if (lie === "bridge") {
      fillGround(groundY, "#8B6914", "#6E5210", 1);
      for (let x = 0; x < w; x += 4) {
        for (let y = groundY; y < h; y++) px(x, y, "#4A3808");
      }
    } else if (lie === "water") {
      fillGround(groundY - 2, PAL.water || "#2A78B8", PAL.waterDeep || "#1A5A98", 2);
      for (let x = 0; x < w; x++) {
        if ((x + 1) % 5 < 2) px(x, groundY - 3, "#C8E8F0");
      }
    } else if (lie === "trees") {
      fillGround(groundY, "#2A5A28", "#1E4A20", 2);
      for (const tx of [6, 14, 34, 42]) {
        px(tx, groundY - 1, PAL.trunk || "#5A3A20");
        px(tx, groundY - 2, PAL.trunk || "#5A3A20");
        for (let dy = -5; dy <= -2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            if (dx * dx + (dy + 3) * (dy + 3) <= 5) px(tx + dx, groundY + dy, "#2E6E28");
          }
        }
      }
    } else {
      fillGround(groundY, "#5A4030", "#4A3020", 2);
    }

    const drawRoughBlades = (front) => {
      // Back behind ball; front fully paints over the lower ball
      if (!front) {
        for (let gx = 1; gx < w - 1; gx += 2) {
          const i = gx;
          const ht = 8 + (i % 5);
          const lean = (i % 3) - 1;
          const colA = (i & 1) ? "#2E6A2A" : "#4A9A3A";
          const colB = (i & 1) ? "#1E4A1C" : "#3A8A32";
          for (let t = 0; t < ht; t++) {
            const y = groundY - 1 - t;
            px(gx, y, (t & 1) ? colB : colA);
            px(gx + 1, y, (t & 1) ? colA : colB);
          }
          px(gx + lean, groundY - ht, colA);
          px(gx + 1 + lean, groundY - ht - 1, colB);
        }
        return;
      }
      // Opaque grass block over the whole lower ball — only a bit of top peeks
      const coverTop = groundY - 8; // ball top ~ groundY-10 → ~2px visible
      for (let y = coverTop; y < h; y++) {
        for (let x = 10; x <= 38; x++) {
          const dither = ((x >> 1) + (y >> 1)) & 1;
          px(x, y, dither ? "#2E6A2A" : "#3A8A32");
        }
      }
      // Blade tips along the top edge of the cover
      for (let gx = 10; gx <= 38; gx++) {
        const tip = coverTop - 1 - (gx % 3);
        const col = (gx & 1) ? "#4A9A3A" : "#2E6A2A";
        px(gx, tip, col);
        px(gx, tip + 1, (gx & 1) ? "#1E4A1C" : "#3A8A32");
        if (gx % 2 === 0) px(gx + ((gx % 3) - 1), tip - 1, col);
      }
    };

    if (lie === "rough") drawRoughBlades(false);

    // Shadow + ball — sit on turf; only tee lifts onto a peg
    const ballSize = 14;
    const half = ballSize >> 1;
    const bx = 24;
    let by;
    if (lie === "tee") by = groundY - half - 2;        // perched on peg
    else if (lie === "sand") by = groundY - half + 3;   // nestled in bunker
    else if (lie === "rough") by = groundY - half + 4;  // sunk into tall grass
    else by = groundY - half + 2;                       // flush on fairway/green

    if (lie === "tee") {
      // Wood tee peg (drawn under the ball)
      px(bx, groundY - 1, "#A07840");
      px(bx, groundY - 2, "#C8A060");
      px(bx, groundY - 3, "#E0B870");
      px(bx - 1, groundY - 3, "#C8A060");
      px(bx + 1, groundY - 3, "#C8A060");
      px(bx, groundY - 4, "#F0D090");
    }

    const shadowY = Math.min(h - 1, by + half + (lie === "tee" ? 3 : 1));
    for (let sx = -half + 2; sx <= half - 2; sx++) px(bx + sx, shadowY, "#0005");

    if (ballSpriteReady) {
      const sw = ballSprite.naturalWidth || 7;
      const sh = ballSprite.naturalHeight || 7;
      c.drawImage(ballSprite, 0, 0, sw, sh, bx - half, by - half, ballSize, ballSize);
    } else {
      const r = half - 1;
      const r2 = r * r;
      for (let yy = -r; yy <= r; yy++) {
        for (let xx = -r; xx <= r; xx++) {
          if (xx * xx + yy * yy > r2) continue;
          const shade = xx + yy > r * 0.4 ? "#7D8E8E" : PAL.ball;
          px(bx + xx, by + yy, shade);
        }
      }
      px(bx - 2, by - 2, "#FFF");
      px(bx - 1, by - 2, "#FFF");
      px(bx - 2, by - 1, "#FFF");
    }

    // Foreground rough — covers the front / lower face of the ball
    if (lie === "rough") drawRoughBlades(true);
  }

  function isPlayable(p) {
    const t = terrainAt(p);
    return t === "fairway" || t === "green" || t === "sand" || t === "rough" || t === "bridge";
  }
  /** Nearest fairway/green anchor — used to aim lateral hazard drops. */
  function nearestTurfAnchor(p) {
    const h = currentHole();
    let best = null;
    let bestD = Infinity;
    for (const b of h.fairway || []) {
      const d = dist(p, b);
      if (d < bestD) { bestD = d; best = { x: b.x, y: b.y }; }
    }
    for (const g of h.green || []) {
      const d = dist(p, g);
      if (d < bestD) { bestD = d; best = { x: g.x, y: g.y }; }
    }
    return best || { ...h.cup };
  }
  /**
   * Water / oob / forest: drop on the nearest playable point along the
   * perpendicular toward the fairway (not always lastSafe).
   */
  function findLateralDrop(landed) {
    const anchor = nearestTurfAnchor(landed);
    let dx = anchor.x - landed.x;
    let dy = anchor.y - landed.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const px = -dy;
    const py = dx;

    let best = null;
    let bestD = Infinity;
    for (let lat = -28; lat <= 28; lat += 4) {
      for (let step = 2; step <= 100; step += 2) {
        const q = {
          x: clamp(landed.x + dx * step + px * lat, 4, holeW() - 4),
          y: clamp(landed.y + dy * step + py * lat, 4, holeH() - 4),
        };
        if (!isPlayable(q)) continue;
        const d = dist(landed, q);
        if (d < bestD) {
          bestD = d;
          best = q;
        }
        // First playable on this ray is the nearest along it
        break;
      }
    }
    return best;
  }
  function lieRangeMul() {
    const t = terrainAt(state.ball);
    if (t === "sand") return 0.45; // bunker blast — short club
    if (t === "rough") return 0.85;
    return 1;
  }
  function lieScatterMul() {
    const t = terrainAt(state.ball);
    if (t === "rough") return 1.5;
    if (t === "sand") return 1.9; // bunker blast — wilder exit
    if (t === "green") return 0.7;
    return 1;
  }
  function clubRangeOf(club) {
    // Active club uses shotMode range (chip/flop caps); others stay stock for suggestions.
    const rangeM = club.id === currentClub().id ? effectiveShot(club).rangeM : club.rangeM;
    let r = mToPx(rangeM) * lieRangeMul();
    const onGreen = terrainAt(state.ball) === "green";
    if (club.id === "putter" && !onGreen) r *= 0.55;
    if (club.id !== "putter" && onGreen) r *= 0.7;
    return r;
  }
  function clubRange() {
    return clubRangeOf(currentClub());
  }
  function clubFixedCarry(club) {
    if (!club) return false;
    if (club.id === currentClub().id) return !!effectiveShot(club).fixedCarry;
    return !!club.fixedCarry;
  }
  /** Max reach in px: stock club range, plus aim margin for fixed-carry clubs. */
  function clubMaxReach(club = currentClub()) {
    const r = clubRangeOf(club);
    const fixed = club.id === currentClub().id ? clubFixedCarry(club) : !!club.fixedCarry;
    return fixed ? r + mToPx(CLUB_AIM_MARGIN_M) : r;
  }
  /**
   * Effective aim distance.
   * Fixed-carry clubs: near full club range, click may trim/extend within ±CLUB_AIM_MARGIN_M.
   * Putter/chip/flop: click distance capped by club range.
   */
  function resolveAimDist(clickDist) {
    const range = clubRange();
    if (clubFixedCarry(currentClub())) {
      const margin = mToPx(CLUB_AIM_MARGIN_M);
      return clamp(clickDist, Math.max(0, range - margin), range + margin);
    }
    return Math.min(Math.max(clickDist, 0), range);
  }
  /** Tip = full club; early/late power stop shortens carry gently. Putter keeps full 0–1. */
  function resolveSwingPower(power) {
    const p = clamp(power, 0, 1);
    if (currentClub().id === "putter") return p;
    // Soft floor so a bad stop still carries most of the shot; tip = 100%
    return 0.65 + 0.35 * p;
  }
  /** Shortest club whose effective range can cover `d` (null if none). */
  function bestClubFor(d) {
    let best = null;
    for (const club of CLUBS) {
      if (!clubAllowed(club)) continue;
      if (clubMaxReach(club) + 0.5 < d) continue;
      if (!best || club.rangeM < best.rangeM) best = club;
    }
    return best;
  }
  function longestAllowedClub() {
    return CLUBS.reduce((a, b) => {
      if (!clubAllowed(b)) return a;
      if (!a || b.rangeM > a.rangeM) return b;
      return a;
    }, null);
  }
  function clubSuggestPhrase(d) {
    if (d <= clubMaxReach() + 0.5) return null;
    const best = bestClubFor(d);
    if (best) {
      if (best.id === currentClub().id) return null;
      return `try ${best.name}`;
    }
    // Nothing reaches — nudge toward the longest allowed club
    const longest = longestAllowedClub();
    if (!longest || longest.id === currentClub().id) return null;
    return `try ${longest.name}`;
  }
  /** After the tee shot, drop the driver for a legal fairway club. */
  function retireDriverIfNeeded() {
    if (clubAllowed(currentClub())) return;
    const cup = currentHole().cup;
    const pick = bestClubFor(dist(state.ball, cup)) || longestAllowedClub();
    if (!pick) return;
    const idx = CLUBS.findIndex((c) => c.id === pick.id);
    if (idx >= 0) setClubIndex(idx);
  }
  function scatterRadius() {
    const club = currentClub();
    return mToPx(club.rangeM) * club.scatter * state.swingFactor * lieScatterMul();
  }
  function segmentsIntersect(a1, a2, b1, b2) {
    const d = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    return d(a1, a2, b1) * d(a1, a2, b2) < 0 && d(b1, b2, a1) * d(b1, b2, a2) < 0;
  }
  function lineHitsForest(from, to) {
    // Sample the shot path — fairway/green are always clear (tree walls are decorative beside turf)
    const steps = 14;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const p = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
      if (inFairway(p) || inGreen(p) || inAny(p, currentHole().bridges || [])) continue;
      if (inAny(p, currentHole().forest || [])) return true;
    }
    return false;
  }
  function inClubRange(target) {
    return dist(state.ball, target) <= clubMaxReach() + 0.5;
  }
  function nearestTargetHit(p, maxDist = 12) {
    const targets = currentHole().targets || [];
    let best = null;
    let bestD = maxDist;
    for (const t of targets) {
      const d = dist(p, t);
      if (d < bestD) { bestD = d; best = t; }
    }
    return best;
  }
  function snapAimPoint(p) {
    // On green: no magnet to the cup — aim lands exactly where you click.
    if (inGreen(state.ball)) return p;
    const cup = currentHole().cup;
    if (dist(p, cup) <= 12) return cup;
    const hitTarget = nearestTargetHit(p);
    return hitTarget || p;
  }
  /** Set aim angle + intended carry at `p` (cup/target snap). Pass lock=true only on player click. */
  function setAimAt(p, lock = false) {
    const aimAt = snapAimPoint(p);
    const dx = aimAt.x - state.ball.x;
    const dy = aimAt.y - state.ball.y;
    const d2 = dx * dx + dy * dy;
    if (d2 >= 0.0001) state.aim = Math.atan2(dy, dx);
    state.aimDist = resolveAimDist(Math.sqrt(d2));
    if (lock) {
      state.aimLocked = true;
      advanceTutorial("aimLocked");
    } else state.aimLocked = false;
    return d2 >= 0.0001;
  }
  function aimPreviewHint(p) {
    const raw = dist(state.ball, p);
    const club = currentClub();
    const mode = activeShotMode(club);
    if (clubFixedCarry(club)) {
      const resolved = resolveAimDist(raw);
      return `${fmtMeters(resolved)} · ${club.name}`;
    }
    const d = fmtMeters(raw);
    const modeBit = mode === "full" ? "" : ` · ${mode}`;
    const suggest = clubSuggestPhrase(raw);
    const suggestBit = suggest ? ` · ${suggest}` : "";
    // Range check only (aligns with preview line color)
    return inClubRange(p) ? `${d}${modeBit} · OK` : `${d}${modeBit} · too far${suggestBit}`;
  }
  function refreshHoverHint() {
    if (!state.pointer) return;
    if (state.phase !== "idle") return;
    setHint(aimPreviewHint(state.pointer));
  }
  function restorePhaseHint() {
    // idle: leave last contextual tip (bunker/rough/green) intact
  }
  function gradeSwing(value) {
    const dev = Math.abs(value - SWEET_SPOT) * 2;
    for (const band of SWING_BANDS) if (dev <= band.maxDev) return band;
    return SWING_BANDS[SWING_BANDS.length - 1];
  }
  function clubWindMul(club) {
    if (club.id === "putter") return 0.25;
    if (club.id === "driver") return 1;
    const putter = CLUBS.find((c) => c.id === "putter");
    const driver = CLUBS.find((c) => c.id === "driver");
    const t = (club.rangeM - putter.rangeM) / (driver.rangeM - putter.rangeM);
    return 0.25 + clamp(t, 0, 1) * 0.75;
  }
  /** Bigger club → faster meter. Putter ~0.55×, driver ~1.45×. */
  function swingSpeedMul() {
    const club = currentClub();
    const putter = CLUBS.find((c) => c.id === "putter");
    const driver = CLUBS.find((c) => c.id === "driver");
    const t = (club.rangeM - putter.rangeM) / (driver.rangeM - putter.rangeM);
    return 0.55 + clamp(t, 0, 1) * 0.9;
  }
  function windDirAngle(dir) {
    return WIND_DIR_ANGLE[dir] != null ? WIND_DIR_ANGLE[dir] : WIND_DIR_ANGLE["↗"];
  }
  function applyScatter(intended) {
    const hole = currentHole();
    const club = currentClub();
    const radius = scatterRadius();

    // Shot axis: ball → intended (fallback to aim)
    let fx = intended.x - state.ball.x;
    let fy = intended.y - state.ball.y;
    const shotLen = Math.hypot(fx, fy);
    if (shotLen < 0.001) {
      fx = Math.cos(state.aim);
      fy = Math.sin(state.aim);
    } else {
      fx /= shotLen;
      fy /= shotLen;
    }
    // Perpendicular left of shot (CCW); swingSide -1 = left, +1 = right
    const nx = -fy;
    const ny = fx;
    const side = state.swingSide || 1;
    const biasMag = (state.swingBias || 0) * Math.max(radius, 1) * 0.9;

    // Wind drift (putter ~0.25×, driver ~1×)
    const wAng = windDirAngle(hole.windDir);
    const wStr = (hole.wind || 0) * clubWindMul(club) * 2.4;
    const windX = Math.cos(wAng) * wStr;
    const windY = Math.sin(wAng) * wStr;

    // Small residual random so landings aren't fully deterministic
    const randR = Math.max(radius, 0.4) * 0.35;
    const randAng = Math.random() * Math.PI * 2;
    const randMag = Math.random() * randR;

    const ox = nx * side * biasMag + windX + Math.cos(randAng) * randMag;
    const oy = ny * side * biasMag + windY + Math.sin(randAng) * randMag;
    return {
      x: clamp(intended.x + ox, 2, holeW() - 2),
      y: clamp(intended.y + oy, 2, holeH() - 2),
    };
  }

  function isClubPickerOpen() {
    return !els.clubList.hidden;
  }
  function closeClubPicker() {
    els.clubList.hidden = true;
    els.clubPanel.setAttribute("aria-expanded", "false");
  }
  function openClubPicker() {
    if (state.phase !== "idle") return;
    els.clubList.hidden = false;
    els.clubPanel.setAttribute("aria-expanded", "true");
    updateHud();
  }
  function toggleClubPicker() {
    if (isClubPickerOpen()) closeClubPicker();
    else openClubPicker();
  }
  /** Stock distances for picker; pass useEffective for active-club HUD/preview. */
  function clubDistances(club, useEffective = false) {
    const shot = useEffective && club.id === currentClub().id ? effectiveShot(club) : null;
    const total = shot ? shot.rangeM : club.rangeM;
    const loft = shot ? shot.loft : club.loft;
    const bounce = shot ? shot.bounce : (club.bounce || 0);
    if (club.id === "putter" || loft <= 0) return { carry: 0, total };
    const carry = Math.round(total / (1 + bounce * CARRY_BOUNCE_BUDGET));
    return { carry, total };
  }
  function buildClubList() {
    els.clubList.innerHTML = "";
    CLUBS.forEach((club, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "club-pick";
      btn.dataset.index = String(i);
      const { carry, total } = clubDistances(club);
      const icon = document.createElement("img");
      icon.className = "club-pick-icon";
      icon.setAttribute("aria-hidden", "true");
      setClubImage(icon, club.id);
      const name = document.createElement("span");
      name.className = "club-pick-name";
      name.textContent = club.name;
      const meta = document.createElement("span");
      meta.className = "club-pick-meta";
      meta.textContent = `${carry} / ${total} m`;
      btn.append(icon, name, meta);
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!clubAllowed(club)) return;
        selectClub(i);
        closeClubPicker();
      });
      els.clubList.appendChild(btn);
    });
  }
  function updateHud() {
    const hole = currentHole();
    const club = currentClub();
    const toPinM = Math.round(pxToM(dist(state.ball, hole.cup)));
    els.holeNum.textContent = String(state.holeIndex + 1);
    if (els.parLabel) els.parLabel.textContent = String(hole.par);
    if (els.lengthLabel) els.lengthLabel.textContent = String(hole.lengthM || 0);
    if (els.toPinLabel) els.toPinLabel.textContent = String(toPinM);
    if (els.strokesLabel) els.strokesLabel.textContent = String(state.strokes);
    if (els.bestLabel) els.bestLabel.textContent = state.best[state.holeIndex] != null ? String(state.best[state.holeIndex]) : "-";
    els.windLabel.textContent = (hole.wind || 1).toFixed(1);
    els.windArrow.textContent = hole.windDir || "↗";
    if (els.lieBox && els.lieLabel) {
      const lie = ballLie();
      els.lieLabel.textContent = lie;
      els.lieBox.dataset.lie = lie;
      drawLiePreview(lie);
    }
    els.clubName.textContent = club.name;
    setClubImage(els.clubIcon, club.id);
    if (els.shotModeBtn) {
      const modesOk = shotModesAllowed(club);
      els.shotModeBtn.disabled = !modesOk || state.phase !== "idle";
      els.shotModeBtn.textContent = activeShotMode(club);
      els.shotModeBtn.title = modesOk ? "cycle full / chip / flop" : "chip & flop on wedges only";
    }
    els.clubList.querySelectorAll(".club-pick").forEach((btn, i) => {
      const c = CLUBS[i];
      const allowed = clubAllowed(c);
      btn.disabled = !allowed;
      btn.classList.toggle("locked", !allowed);
      btn.classList.toggle("active", i === state.clubIndex);
      btn.title = !allowed && c.id === "driver" ? "tee only" : "";
    });
    els.swingBtn.textContent = state.phase === "swinging" ? "stop" : "swing";
    els.swingBtn.disabled = state.phase !== "idle" && state.phase !== "swinging";
  }
  function setHint(t, { coach = false } = {}) {
    // During tutorial, only coach / swing-stage advances may overwrite the tip.
    if (tutorialActive() && !coach) return;
    els.hint.textContent = t;
  }
  function teeSetOf(teeId) {
    const id = teeId || state.teeId || DEFAULT_TEE_ID;
    return TEE_BY_ID[id] || TEE_BY_ID[DEFAULT_TEE_ID];
  }
  function courseLengthM(teeId) {
    const id = (teeId && TEE_BY_ID[teeId] ? teeId : null) || state.teeId || DEFAULT_TEE_ID;
    return HOLES.reduce((s, h) => {
      const t = (h.tees && (h.tees[id] || h.tees[DEFAULT_TEE_ID])) || null;
      return s + (t ? t.lengthM : (h.lengthM || 0));
    }, 0);
  }
  /** Scorecard foot: e.g. "Regular · 6204 m · par 72" */
  function courseFootText(teeId) {
    const set = teeSetOf(teeId);
    return `${set.name} · ${courseLengthM(set.id)} m · par ${COURSE_PAR}`;
  }
  function holeStartHint(hole) {
    const set = teeSetOf();
    const len = hole.lengthM || 0;
    return `${hole.name} · ${set.name} · ${len} m · ${shotModeIdleHint()}`;
  }
  function applyTeeSet(teeId) {
    const id = TEE_BY_ID[teeId] ? teeId : DEFAULT_TEE_ID;
    state.teeId = id;
    for (const h of HOLES) {
      if (!h.tees) continue;
      const t = h.tees[id] || h.tees[DEFAULT_TEE_ID];
      if (!t) continue;
      h.tee = { x: t.x, y: t.y };
      h.lengthM = t.lengthM;
    }
    state.courseDirty = true;
  }
  function hideOverlay() {
    state.overlayMode = null;
    els.overlay.classList.add("hidden");
    els.scorecard.classList.add("hidden");
    els.scorecard.innerHTML = "";
    if (els.teeList) {
      els.teeList.classList.add("hidden");
      els.teeList.innerHTML = "";
    }
    if (els.tutorialBtn) els.tutorialBtn.classList.add("hidden");
    if (els.overlayBtn) els.overlayBtn.classList.remove("hidden");
  }
  function showTeeSelect() {
    state.overlayMode = "tees";
    els.overlayEyebrow.textContent = "green drop · 18";
    els.overlayTitle.textContent = "pick tees";
    els.overlayText.textContent = "championship longest · regular ~6200 m · forward shortest";
    els.scorecard.classList.add("hidden");
    els.scorecard.innerHTML = "";
    if (els.overlayBtn) els.overlayBtn.classList.add("hidden");
    if (els.teeList) {
      els.teeList.innerHTML = "";
      for (const set of TEE_SETS) {
        const total = courseLengthM(set.id);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "tee-pick" + (state.teeId === set.id ? " active" : "");
        btn.dataset.teeId = set.id;
        btn.innerHTML = `<span class="tee-swatch" style="background:${set.color}"></span><span class="tee-name">${set.name}</span><span class="tee-meta">${total} m · par ${COURSE_PAR}</span>`;
        btn.addEventListener("click", () => startRoundWithTee(set.id));
        els.teeList.appendChild(btn);
      }
      els.teeList.classList.remove("hidden");
    }
    if (els.tutorialBtn) els.tutorialBtn.classList.remove("hidden");
    els.overlay.classList.remove("hidden");
  }
  function tutorialActive() {
    return state.tutorial.active;
  }
  function clearCoachPulse() {
    if (els.swingBtn) els.swingBtn.classList.remove("coach-pulse");
    if (els.clubPanel) els.clubPanel.classList.remove("coach-pulse");
  }
  function updateCoachPulse() {
    clearCoachPulse();
    if (!tutorialActive()) return;
    const step = state.tutorial.step;
    if (step === "power" || step === "accuracy" || step === "putt") {
      if (els.swingBtn) els.swingBtn.classList.add("coach-pulse");
    } else if (step === "approach" && !state.tutorial.clubNudged) {
      if (els.clubPanel) els.clubPanel.classList.add("coach-pulse");
    }
  }
  function setTutorialStep(step) {
    state.tutorial.step = step;
    state.tutorial.active = step != null;
    if (step === "approach") state.tutorial.clubNudged = false;
    if (step == null) state.tutorial.clubNudged = false;
    if (els.hint) els.hint.classList.toggle("is-coach", state.tutorial.active);
    updateCoachPulse();
  }
  function finishTutorial() {
    state.tutorialDone = true;
    setTutorialStep(null);
    saveStorage();
  }
  /** Soft coach advances: aimLocked | startSwing | beginAccuracy | shotLanded | putter | holeComplete */
  function advanceTutorial(event) {
    if (!tutorialActive()) return;
    const step = state.tutorial.step;

    if (event === "aimLocked" || event === "startSwing") {
      if (step === "aim") {
        setTutorialStep("power");
        setHint("left end = power · then green spot = aim", { coach: true });
      }
      return;
    }

    if (event === "beginAccuracy") {
      if (step === "power" || step === "aim") {
        setTutorialStep("accuracy");
        // Same tip as power — both beats are explained in one coach line.
        setHint("left end = power · then green spot = aim", { coach: true });
      }
      return;
    }

    if (event === "shotLanded") {
      if (step === "putt" || step === "approach") return;
      if (terrainAt(state.ball) === "green") {
        setTutorialStep("putt");
        setHint("green — putter · aim then swing", { coach: true });
        return;
      }
      // First land off-green: one club nudge, then stay on approach.
      setTutorialStep("approach");
      setHint("aim · change club if too far", { coach: true });
      return;
    }

    if (event === "putter") {
      if (step === "putt") return;
      setTutorialStep("putt");
      setHint("green — putter · aim then swing", { coach: true });
      return;
    }

    if (event === "holeComplete") {
      finishTutorial();
    }
  }
  function showTutorialIntro() {
    showOverlay({
      eyebrow: "hole 1",
      title: "learn the swing",
      text: "click to aim · swing for power then accuracy",
      button: "play",
      mode: "tutorial",
    });
  }
  function beginTutorial() {
    hideOverlay();
    setTutorialStep("aim");
    setHint("click to place your target", { coach: true });
  }
  function startRoundWithTee(teeId, { forceTutorial = false } = {}) {
    applyTeeSet(teeId);
    state.holeIndex = 0;
    resetHole(false);
    if (forceTutorial || !state.tutorialDone) showTutorialIntro();
  }
  function startTutorialFromMenu() {
    startRoundWithTee(state.teeId || DEFAULT_TEE_ID, { forceTutorial: true });
  }
  function nineSum(start) {
    let sum = 0, n = 0;
    for (let i = start; i < start + 9; i++) {
      if (state.card[i] == null) continue;
      sum += state.card[i];
      n += 1;
    }
    return n ? String(sum) : "—";
  }
  function renderScorecard(footText) {
    const cell = (i, isHead) => {
      if (isHead) return `<span class="sc-head">${i + 1}</span>`;
      const v = state.card[i];
      if (v == null) return `<span class="sc-empty">·</span>`;
      return `<span>${v}</span>`;
    };
    const row = (label, start) => {
      let html = `<span class="sc-label">${label}</span>`;
      for (let i = 0; i < 9; i++) html += cell(start + i, label === "#");
      html += `<span class="sc-sum">${label === "#" ? "Σ" : nineSum(start)}</span>`;
      return `<div class="scorecard-nine">${html}</div>`;
    };
    els.scorecard.innerHTML =
      row("#", 0) +
      row("out", 0) +
      row("in", 9) +
      (footText ? `<p class="scorecard-foot">${footText}</p>` : "");
    els.scorecard.classList.remove("hidden");
  }
  function showOverlay({ eyebrow, title, text, button, mode = "hole", scorecardFoot = null }) {
    state.overlayMode = mode;
    els.overlayEyebrow.textContent = eyebrow;
    els.overlayTitle.textContent = title;
    els.overlayText.textContent = text;
    els.overlayBtn.textContent = button;
    els.overlayBtn.classList.remove("hidden");
    if (els.teeList) {
      els.teeList.classList.add("hidden");
      els.teeList.innerHTML = "";
    }
    if (els.tutorialBtn) els.tutorialBtn.classList.add("hidden");
    if (mode === "round" || mode === "card") renderScorecard(scorecardFoot);
    else {
      els.scorecard.classList.add("hidden");
      els.scorecard.innerHTML = "";
    }
    els.overlay.classList.remove("hidden");
  }
  function showCardOverlay() {
    if (state.phase === "done" || state.phase === "flying") return;
    let thru = 0;
    for (let i = 0; i < state.card.length; i++) {
      if (state.card[i] != null) thru += state.card[i];
    }
    const bestTxt = state.bestRound != null ? ` · best round ${state.bestRound}` : " · no best round yet";
    showOverlay({
      eyebrow: "scorecard",
      title: `hole ${state.holeIndex + 1}`,
      text: `thru ${thru} · shot ${state.strokes}${bestTxt}`,
      button: "close",
      mode: "card",
      scorecardFoot: courseFootText(),
    });
  }
  function maybeSuggestPutter() {
    if (terrainAt(state.ball) === "green") {
      setClubIndex(CLUBS.findIndex((c) => c.id === "putter"));
      advanceTutorial("putter");
      setHint("green — putter. aim · swing");
    }
  }
  function selectClub(i) {
    if (state.phase === "flying" || state.phase === "done") return;
    const idx = ((i % CLUBS.length) + CLUBS.length) % CLUBS.length;
    if (!clubAllowed(CLUBS[idx])) {
      if (CLUBS[idx].id === "driver") setHint("driver — tee only");
      return;
    }
    setClubIndex(idx);
    state.aimDist = resolveAimDist(state.aimDist);
    // Approach coach: one club nudge — clear panel pulse after they pick
    if (tutorialActive() && state.tutorial.step === "approach" && !state.tutorial.clubNudged) {
      state.tutorial.clubNudged = true;
      updateCoachPulse();
    }
    updateHud();
    if (state.pointer && state.phase === "idle") {
      refreshHoverHint();
      return;
    }
    // No pointer: suggest from cup distance when current club can't reach
    if (state.phase === "idle") {
      const cup = currentHole().cup;
      const suggest = clubSuggestPhrase(dist(state.ball, cup));
      if (suggest) setHint(suggest);
      else setHint(shotModeIdleHint());
    }
  }
  function startSwing() {
    if (state.phase !== "idle") return;
    if (!clubAllowed(currentClub())) {
      retireDriverIfNeeded();
      updateHud();
      setHint("driver — tee only");
      return;
    }
    // On green: don't swing toward an auto-aimed cup — player must place the target.
    if (inGreen(state.ball) && !state.aimLocked) {
      setHint("aim first — click a target", { coach: true });
      return;
    }
    closeClubPicker();
    // Keep phase "swinging" for both power + accuracy so HUD / aim / button stay wired
    state.phase = "swinging";
    state.swingStage = "power";
    state.swingPos = 1;
    state.swingDir = -1;
    state.swingPower = 0;
    state.swingValue = 1;
    state.accuracyArmed = false;
    state.accuracyArmAt = 0;
    state.swingHoldUntil = 0;
    advanceTutorial("startSwing");
    setHint("left end = power · then green spot = aim", { coach: true });
    updateHud();
  }
  function beginAccuracyStage(power) {
    const teachAccuracy = tutorialActive() && (state.tutorial.step === "power" || state.tutorial.step === "aim");
    state.swingPower = resolveSwingPower(power);
    state.swingStage = "accuracy";
    // Fresh run from the left so aim is a clear second beat (not glued to the power press)
    state.swingDir = 1;
    state.swingPos = 0.001;
    // Ignore the power press / ghost click until delay + leaving the power zone
    state.accuracyArmed = false;
    advanceTutorial("beginAccuracy");
    setHint("left end = power · then green spot = aim", { coach: true });
    // First tutorial accuracy: hold the needle so the tip can be read before the run
    if (teachAccuracy) {
      state.swingHoldUntil = performance.now() + TUTORIAL_ACCURACY_HOLD * 1000;
      state.accuracyArmAt = 0;
    } else {
      state.swingHoldUntil = 0;
      state.accuracyArmAt = performance.now() + ACCURACY_ARM_DELAY * 1000;
    }
    updateHud();
  }
  function releaseSwingHold() {
    if (!state.swingHoldUntil) return false;
    state.swingHoldUntil = 0;
    state.accuracyArmed = false;
    state.accuracyArmAt = performance.now() + ACCURACY_ARM_DELAY * 1000;
    return true;
  }
  function finishAccuracySwing(band, side) {
    state.swingHoldUntil = 0;
    state.swingFactor = band.factor;
    state.swingLabel = band.name;
    state.swingSide = side;
    state.swingBias = band.bias != null ? band.bias : 0.65;
    // Fixed-carry: aimDist ≈ club range (±margin); swingPower shortens if tip was missed
    const range = state.aimDist * state.swingPower;
    const intended = {
      x: state.ball.x + Math.cos(state.aim) * range,
      y: state.ball.y + Math.sin(state.aim) * range,
    };
    startDrop(intended);
  }
  function stopSwing() {
    if (state.phase !== "swinging") return;
    if (state.swingStage === "power") {
      // Left tip (pos≈0) = max; further right = weaker
      const power = clamp(1 - state.swingPos, 0, 1);
      beginAccuracyStage(power);
      return;
    }
    // Tutorial hold: next press skips the read pause and starts the accuracy run
    if (state.swingHoldUntil && performance.now() < state.swingHoldUntil) {
      releaseSwingHold();
      return;
    }
    // Don't finish on the power press / ghost click / key-repeat
    if (!state.accuracyArmed || performance.now() < state.accuracyArmAt) return;
    // Accuracy: grade vs middle sweet spot
    const band = gradeSwing(state.swingPos);
    const side = state.swingPos < SWEET_SPOT ? -1 : 1;
    finishAccuracySwing(band, side);
  }
  function ensureWorldBuffers() {
    const w = holeW(), h = holeH();
    if (buffer.width !== w || buffer.height !== h) {
      buffer.width = w;
      buffer.height = h;
      courseLayer.width = w;
      courseLayer.height = h;
      state.courseDirty = true;
    }
  }
  /** Full-hole overview on the tee shot through aim + swing (no zoom-down to tee). */
  function isAimOverview() {
    return state.strokes === 0 && (state.phase === "idle" || state.phase === "swinging");
  }
  /** Putter on the green: tight close-up so slope carets read clearly. */
  function isPuttCloseView() {
    return currentClub()?.id === "putter" && inGreen(ballPos());
  }
  /** 2nd+ shot aim: show ball and flag together (zooms out on long par-5 approaches). */
  function isFlagAimView() {
    return state.strokes >= 1 && (state.phase === "idle" || state.phase === "swinging");
  }
  /** World rect covering ball + cup, clamped to the hole. */
  function ballFlagFitRect() {
    const pos = ballPos();
    const cup = currentHole().cup;
    const pad = 40;
    const ww = holeW(), wh = holeH();
    let x0 = Math.min(pos.x, cup.x) - pad;
    let y0 = Math.min(pos.y, cup.y) - pad;
    let x1 = Math.max(pos.x, cup.x) + pad;
    let y1 = Math.max(pos.y, cup.y) + pad;
    // Never tighter than the normal close-up window
    let sw = Math.max(x1 - x0, VIEW_W);
    let sh = Math.max(y1 - y0, VIEW_H);
    let sx = (x0 + x1) / 2 - sw / 2;
    let sy = (y0 + y1) / 2 - sh / 2;
    sx = clamp(sx, 0, Math.max(0, ww - sw));
    sy = clamp(sy, 0, Math.max(0, wh - sh));
    sw = Math.min(sw, ww - sx);
    sh = Math.min(sh, wh - sy);
    return { sx, sy, sw, sh };
  }
  /**
   * Tight putt frame around ball + cup (~2.4× closer than VIEW_W/H).
   * Keeps canvas aspect so the green fills the screen without letterbox stretch.
   */
  function puttFitRect() {
    const pos = ballPos();
    const cup = currentHole().cup;
    const pad = 22;
    const ww = holeW(), wh = holeH();
    let x0 = Math.min(pos.x, cup.x) - pad;
    let y0 = Math.min(pos.y, cup.y) - pad;
    let x1 = Math.max(pos.x, cup.x) + pad;
    let y1 = Math.max(pos.y, cup.y) + pad;
    const minW = 84, minH = 122;
    let sw = Math.max(x1 - x0, minW);
    let sh = Math.max(y1 - y0, minH);
    const aspect = VIEW_W / VIEW_H;
    if (sw / sh < aspect) sw = sh * aspect;
    else sh = sw / aspect;
    let sx = (x0 + x1) / 2 - sw / 2;
    let sy = (y0 + y1) / 2 - sh / 2;
    sx = clamp(sx, 0, Math.max(0, ww - sw));
    sy = clamp(sy, 0, Math.max(0, wh - sh));
    sw = Math.min(sw, ww - sx);
    sh = Math.min(sh, wh - sy);
    return { sx, sy, sw, sh };
  }
  function fitBlit(r) {
    const scale = Math.min(canvas.width / r.sw, canvas.height / r.sh);
    const dw = r.sw * scale;
    const dh = r.sh * scale;
    return {
      sx: r.sx, sy: r.sy, sw: r.sw, sh: r.sh,
      dx: (canvas.width - dw) / 2,
      dy: (canvas.height - dh) / 2,
      dw, dh,
    };
  }
  /** Source/dest blit: full hole, putt close-up, ball+flag fit, or cam crop. */
  function viewBlit() {
    const ww = holeW(), wh = holeH();
    if (isAimOverview()) {
      const scale = Math.min(canvas.width / ww, canvas.height / wh);
      const dw = ww * scale;
      const dh = wh * scale;
      return {
        sx: 0, sy: 0, sw: ww, sh: wh,
        dx: (canvas.width - dw) / 2,
        dy: (canvas.height - dh) / 2,
        dw, dh,
      };
    }
    if (isPuttCloseView()) return fitBlit(puttFitRect());
    if (isFlagAimView()) return fitBlit(ballFlagFitRect());
    return {
      sx: state.cam.x, sy: state.cam.y, sw: VIEW_W, sh: VIEW_H,
      dx: 0, dy: 0, dw: canvas.width, dh: canvas.height,
    };
  }
  function camTarget() {
    const pos = ballPos();
    // Flight / settle: follow the ball. Aim framing is handled by viewBlit fit.
    const maxCamX = Math.max(0, holeW() - VIEW_W);
    const maxCamY = Math.max(0, holeH() - VIEW_H);
    return {
      x: clamp(pos.x - VIEW_W / 2, 0, maxCamX),
      y: clamp(pos.y - VIEW_H / 2, 0, maxCamY),
    };
  }
  function snapCam() {
    const t = camTarget();
    state.cam.x = t.x;
    state.cam.y = t.y;
  }
  function updateCam(dt) {
    const t = camTarget();
    // Exponential ease — snappier on swing, tightest in flight
    const rate = state.phase === "flying" ? 14 : state.phase === "swinging" ? 10 : 7;
    const k = 1 - Math.exp(-rate * Math.max(dt || 0.016, 0));
    state.cam.x += (t.x - state.cam.x) * k;
    state.cam.y += (t.y - state.cam.y) * k;
  }
  function resetHole(preserveTotal = true) {
    // Leaving hole 1 ends the soft coach if it was still running.
    if (tutorialActive() && state.holeIndex !== 0) finishTutorial();
    const hole = currentHole();
    state.ball = { ...hole.tee }; state.lastSafe = { ...hole.tee };
    state.strokes = 0; state.phase = "idle"; state.flight = null; state.pointer = null;
    state.shotMode = "full";
    state.swingStage = "power"; state.swingPos = 1; state.swingDir = 1; state.swingPower = 0;
    state.swingLabel = "—"; state.swingFactor = 0.22; state.swingSide = 1; state.swingBias = 0;
    state.accuracyArmed = false; state.accuracyArmAt = 0; state.swingHoldUntil = 0;
    const teeDist = dist(hole.tee, hole.cup);
    const best = bestClubFor(teeDist);
    const pick = best || CLUBS.find((c) => c.id === "driver");
    const idx = pick ? CLUBS.findIndex((c) => c.id === pick.id) : -1;
    setClubIndex(idx >= 0 ? idx : DEFAULT_CLUB_INDEX);
    setAimAt(hole.cup);
    state.facing = hole.cup.x >= hole.tee.x ? 1 : -1;
    state.courseDirty = true;
    ensureWorldBuffers();
    snapCam();
    if (!preserveTotal) {
      state.totalStrokes = 0;
      state.card = [];
    }
    hideOverlay();
    setHint(holeStartHint(hole));
    updateHud();
  }
  function holeResultLabel(strokes, par) {
    const diff = strokes - par;
    if (diff <= -2) return "eagle!";
    if (diff === -1) return "birdie!";
    if (diff === 0) return "par";
    if (diff === 1) return "bogey";
    return `+${diff}`;
  }
  function completeHole() {
    state.phase = "done";
    state.card[state.holeIndex] = state.strokes;
    state.totalStrokes += state.strokes;
    const prev = state.best[state.holeIndex];
    if (prev == null || state.strokes < prev) state.best[state.holeIndex] = state.strokes;
    if (state.holeIndex === 0 && (tutorialActive() || !state.tutorialDone)) finishTutorial();
    const hole = currentHole();
    const result = holeResultLabel(state.strokes, hole.par);
    const last = state.holeIndex >= HOLES.length - 1;
    let newBest = false;
    if (last) {
      if (state.bestRound == null || state.totalStrokes < state.bestRound) {
        state.bestRound = state.totalStrokes;
        newBest = true;
      }
    }
    saveStorage();
    const vsPar = state.totalStrokes - COURSE_PAR;
    const vsParTxt = vsPar === 0 ? "E" : (vsPar > 0 ? `+${vsPar}` : String(vsPar));
    const bestTxt = state.bestRound != null ? ` · best ${state.bestRound}` : "";
    showOverlay({
      eyebrow: last ? "round complete" : "hole complete",
      title: result,
      text: last
        ? `total ${state.totalStrokes} (par ${COURSE_PAR}, ${vsParTxt})${bestTxt}${newBest ? " · new best!" : ""}`
        : `${state.strokes} on ${hole.name} (par ${hole.par}) · thru ${state.totalStrokes}`,
      button: last ? "play again" : "next hole",
      mode: last ? "round" : "hole",
      scorecardFoot: last
        ? `out ${nineSum(0)} · in ${nineSum(9)} · ${vsParTxt} · ${courseFootText()}`
        : null,
    });
    updateHud();
  }
  /** Soft pull of launch velocity toward cup on putter + perfect/good when intended is close. */
  function applyPuttMagnet(intended, vx, vy) {
    if (currentClub().id !== "putter") return { vx, vy };
    if (state.swingLabel !== "perfect" && state.swingLabel !== "good") return { vx, vy };
    const hole = currentHole();
    const cup = hole.cup;
    if (dist(intended, cup) > 10) return { vx, vy };
    // Slope reading matters: mute magnet on meaningful break.
    const g = greenSlopeAt(state.ball, hole);
    const slopeMag = Math.hypot(g.sx, g.sy);
    if (slopeMag >= PUTT_MAGNET_SLOPE_KILL) return { vx, vy };
    let pull = state.swingLabel === "perfect" ? 0.55 : 0.32;
    if (slopeMag > PUTT_MAGNET_SLOPE_SOFT) {
      const t = (slopeMag - PUTT_MAGNET_SLOPE_SOFT) /
        (PUTT_MAGNET_SLOPE_KILL - PUTT_MAGNET_SLOPE_SOFT);
      pull *= 1 - clamp(t, 0, 1);
    }
    if (pull < 0.02) return { vx, vy };
    const speed = Math.hypot(vx, vy);
    let dx = cup.x - state.ball.x;
    let dy = cup.y - state.ball.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.001) return { vx, vy };
    const tvx = (dx / len) * speed;
    const tvy = (dy / len) * speed;
    return {
      vx: vx + (tvx - vx) * pull,
      vy: vy + (tvy - vy) * pull,
    };
  }
  function startDrop(intended) {
    closeClubPicker();
    state.facing = intended.x >= state.ball.x ? 1 : -1;
    state.phase = "flying";
    state.strokes += 1;
    updateHud();

    const club = currentClub();
    const shot = effectiveShot(club);
    const from = state.ball;
    const maxRange = clubMaxReach(club) * clamp(state.swingPower, 0, 1);
    const intendedDist = Math.min(dist(from, intended), maxRange);

    // Shot axis: ball → intended (fallback to aim * intendedDist)
    let dx = intended.x - from.x;
    let dy = intended.y - from.y;
    const shotLen = Math.hypot(dx, dy);
    if (shotLen < 0.001) {
      dx = Math.cos(state.aim) * Math.max(intendedDist, 1);
      dy = Math.sin(state.aim) * Math.max(intendedDist, 1);
    }
    const inv = 1 / (Math.hypot(dx, dy) || 1);
    const fx0 = dx * inv;
    const fy0 = dy * inv;
    // Perpendicular left of shot (CCW); swingSide -1 = left, +1 = right
    const nx = -fy0;
    const ny = fx0;
    const radius = scatterRadius();
    const side = state.swingSide || 1;
    const biasMag = (state.swingBias || 0) * Math.max(radius, 1) * 0.9;
    // Small residual random so launches aren't fully deterministic
    const randR = Math.max(radius, 0.4) * 0.35;
    const randAng = Math.random() * Math.PI * 2;
    const randMag = Math.random() * randR;
    // Lateral + random bias on direction (not a precomputed landing point)
    dx += nx * side * biasMag + Math.cos(randAng) * randMag;
    dy += ny * side * biasMag + Math.sin(randAng) * randMag;
    const dirLen = Math.hypot(dx, dy) || 1;
    const fx = dx / dirLen;
    const fy = dy / dirLen;

    const isPutt = club.id === "putter" || shot.loft <= 0;
    // Air: carry is short of intended so bounce+roll finish near the aim point
    let speed;
    if (isPutt) {
      speed = intendedDist * 2.8;
    } else {
      const carryTarget = intendedDist / (1 + shot.bounce * CARRY_BOUNCE_BUDGET);
      speed = Math.sqrt((carryTarget * GRAVITY) / (2 * Math.tan(shot.loft)));
    }
    // High loft → taller arc, same carry (scale vz up and horizontal speed down).
    const heightMul = isPutt ? 1 : flightHeightMul(shot.loft);
    let vx = fx * speed / heightMul;
    let vy = fy * speed / heightMul;
    ({ vx, vy } = applyPuttMagnet(intended, vx, vy));
    const vz = isPutt ? 0 : speed * Math.tan(shot.loft) * heightMul;
    const peakZ = isPutt ? 0 : (vz * vz) / (2 * GRAVITY);
    const carryDist = isPutt
      ? Math.max(intendedDist, 1)
      : Math.max(intendedDist / (1 + shot.bounce * CARRY_BOUNCE_BUDGET), 1);

    state.flight = {
      x: from.x,
      y: from.y,
      z: 0,
      vx,
      vy,
      vz,
      peakZ,
      ox: from.x,
      oy: from.y,
      carryDist,
      scale: ballBaseScale(from), // smoothed draw scale (lerped each frame)
      mode: isPutt ? "roll" : "air",
      bounces: 0,
      clubId: club.id,
      // Snapshot so mid-flight club/mode changes can't alter bounce/roll
      loft: shot.loft,
      bounce: shot.bounce,
    };
  }
  function finishDrop(landed) {
    state.flight = null;
    const cup = currentHole().cup;
    if (dist(landed, cup) <= CUP_HOLE_R) { state.ball = { ...cup }; completeHole(); return; }
    const terrain = terrainAt(landed);
    if (terrain === "water" || terrain === "oob" || terrain === "forest") {
      state.strokes += 1;
      const drop = findLateralDrop(landed) || { ...state.lastSafe };
      state.ball = { ...drop };
      state.lastSafe = { ...drop };
      state.phase = "idle";
      retireDriverIfNeeded();
      setAimAt(cup);
      snapCam(); // frame ball + flag for next aim
      advanceTutorial("shotLanded");
      setHint(terrain === "water" ? "water! +1 · drop" : "oob / trees! +1 · drop");
      updateHud();
      return;
    }
    state.ball = { ...landed }; state.lastSafe = { ...landed }; state.phase = "idle";
    retireDriverIfNeeded();
    maybeSuggestPutter();
    snapCam(); // frame ball + flag for 2nd/3rd shot aim
    if (terrainAt(state.ball) === "green") {
      // Don't auto-aim the cup — player places the putt target.
      state.aimLocked = false;
      state.aimDist = 0;
      updateHud();
      return;
    }
    setAimAt(cup);
    advanceTutorial("shotLanded");
    if (terrain === "sand") setHint("blast out");
    else if (terrain === "rough") setHint("rough — more scatter");
    else if (dist(state.ball, cup) <= 32) setHint("near green — putter");
    else {
      const suggest = clubSuggestPhrase(dist(state.ball, cup));
      setHint(suggest || "nice shot — continue");
    }
    updateHud();
  }

  /** Taller flight arc for higher loft; 1 for putter / low-loft woods. */
  function flightHeightMul(loft) {
    return 1 + Math.max(0, (loft || 0) - FLIGHT_HEIGHT_LOFT0) * FLIGHT_HEIGHT_LOFT_GAIN;
  }
  /** Soft canopy height — wedges clear tree walls; driver stays under. */
  function forestCanopyZ(loft = 0) {
    return clamp(FOREST_CANOPY_MAX - (loft || 0) * 6, FOREST_CANOPY_MIN, FOREST_CANOPY_MAX);
  }
  /** Ground hazard for flight: water/oob always on ground; forest only under canopy (fairway/green/bridge clear). */
  function flightHazardAt(p, z, loft = 0) {
    const h = currentHole();
    if (z > 0.01) {
      if (z > forestCanopyZ(loft)) return null;
      if (inFairway(p) || inGreen(p) || inAny(p, h.bridges || [])) return null;
      if (inAny(p, h.forest || [])) return "forest";
      return null;
    }
    const t = terrainAt(p);
    if (t === "water" || t === "oob" || t === "forest") return t;
    return null;
  }

  function rollFrictionAt(p) {
    const t = terrainAt(p);
    if (t === "green") return 70;
    if (t === "sand") return 220;
    if (t === "rough") return 170;
    if (t === "bridge") return 95;
    return 120; // fairway / default — keeps runout short
  }

  /** Dump horizontal speed when the ball first starts rolling. */
  function applyRollLanding(f, club) {
    const rest = f.bounce != null ? f.bounce : (club.bounce || 0);
    const mul = 0.26 + rest * 0.22;
    f.vx *= mul;
    f.vy *= mul;
    f.vz = 0;
    f.mode = "roll";
  }

  function clubById(id) {
    return CLUBS.find((c) => c.id === id) || currentClub();
  }

  function updateFlight(dt) {
    if (state.phase !== "flying" || !state.flight) return;
    const f = state.flight;
    const club = clubById(f.clubId);
    const hole = currentHole();
    const cup = hole.cup;
    const pos = () => ({ x: f.x, y: f.y });

    if (f.mode === "air") {
      const wAng = windDirAngle(hole.windDir);
      const wAcc = (hole.wind || 0) * clubWindMul(club) * WIND_ACCEL;
      f.vx += Math.cos(wAng) * wAcc * dt;
      f.vy += Math.sin(wAng) * wAcc * dt;
      f.vz -= GRAVITY * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.z += f.vz * dt;
      // Ease ball scale toward arc target (kills integer-size popping)
      {
        const target = ballFlightScaleTarget(f.x, f.y, f.z);
        const k = 1 - Math.exp(-10 * Math.max(dt, 0.001));
        f.scale += (target - (f.scale ?? ballBaseScale(pos()))) * k;
      }

      const midHaz = flightHazardAt(pos(), f.z, f.loft);
      if (midHaz) { finishDrop(pos()); return; }

      if (f.z <= 0) {
        f.z = 0;
        const groundHaz = flightHazardAt(pos(), 0, f.loft);
        if (groundHaz) { finishDrop(pos()); return; }
        if (dist(pos(), cup) <= CUP_HOLE_R) { finishDrop(pos()); return; }

        const impact = Math.abs(f.vz);
        const rest = f.bounce != null ? f.bounce : (club.bounce || 0);
        if (impact >= BOUNCE_MIN_VZ && rest > 0) {
          f.vz = impact * rest;
          const keep = 0.40 + rest * 0.18;
          f.vx *= keep;
          f.vy *= keep;
          f.bounces += 1;
        } else {
          applyRollLanding(f, club);
        }
      }
      return;
    }

    // roll — settle scale back to ground size (smaller on green)
    f.z = 0;
    f.vz = 0;
    {
      const ground = ballBaseScale(pos());
      const k = 1 - Math.exp(-14 * Math.max(dt, 0.001));
      f.scale += (ground - (f.scale ?? ground)) * k;
    }
    if (dist(pos(), cup) <= CUP_HOLE_R) { finishDrop(pos()); return; }

    const haz = flightHazardAt(pos(), 0);
    if (haz) { finishDrop(pos()); return; }

    const speed = Math.hypot(f.vx, f.vy);
    if (speed < ROLL_STOP_SPEED) { finishDrop(pos()); return; }

    const fric = rollFrictionAt(pos());
    const decel = Math.min(speed, fric * dt);
    const inv = 1 / speed;
    f.vx -= f.vx * inv * decel;
    f.vy -= f.vy * inv * decel;
    // Green undulations: accelerate downhill while rolling on the green.
    if (inGreen(pos())) {
      const g = greenSlopeAt(pos(), hole);
      f.vx += g.sx * SLOPE_ACCEL * dt;
      f.vy += g.sy * SLOPE_ACCEL * dt;
    }
    f.x += f.vx * dt;
    f.y += f.vy * dt;

    if (flightHazardAt(pos(), 0)) { finishDrop(pos()); return; }
    if (dist(pos(), cup) <= CUP_HOLE_R) { finishDrop(pos()); return; }

    const after = Math.hypot(f.vx, f.vy);
    if (after < ROLL_STOP_SPEED) finishDrop(pos());
  }

  function worldFromEvent(evt) {
    const rect = canvas.getBoundingClientRect();
    const cx = ((evt.clientX - rect.left) / rect.width) * canvas.width;
    const cy = ((evt.clientY - rect.top) / rect.height) * canvas.height;
    const v = viewBlit();
    return {
      x: v.sx + ((cx - v.dx) / v.dw) * v.sw,
      y: v.sy + ((cy - v.dy) / v.dh) * v.sh,
    };
  }
  canvas.addEventListener("pointermove", (e) => {
    state.pointer = worldFromEvent(e);
    refreshHoverHint();
  });
  canvas.addEventListener("pointerleave", () => {
    state.pointer = null;
    restorePhaseHint();
  });
  canvas.addEventListener("pointerdown", (e) => {
    if (state.phase === "swinging") { stopSwing(); return; }
    if (state.phase !== "idle") return;
    setAimAt(worldFromEvent(e), true);
  });
  els.swingBtn.addEventListener("click", () => { if (state.phase === "idle") startSwing(); else if (state.phase === "swinging") stopSwing(); });
  if (els.shotModeBtn) {
    els.shotModeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeClubPicker();
      cycleShotMode();
    });
  }
  els.clubPanel.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleClubPicker();
  });
  document.addEventListener("click", (e) => {
    if (!isClubPickerOpen()) return;
    if (els.clubList.contains(e.target) || els.clubPanel.contains(e.target)) return;
    closeClubPicker();
  });
  els.restartBtn.addEventListener("click", () => showCardOverlay());
  if (els.tutorialBtn) els.tutorialBtn.addEventListener("click", () => startTutorialFromMenu());
  els.overlayBtn.addEventListener("click", () => {
    if (state.overlayMode === "tees") return;
    if (state.overlayMode === "tutorial") {
      beginTutorial();
      return;
    }
    if (state.overlayMode === "card") {
      hideOverlay();
      return;
    }
    if (state.holeIndex >= HOLES.length - 1 && state.phase === "done") {
      state.holeIndex = 0;
      showTeeSelect();
      return;
    }
    if (state.phase === "done") { state.holeIndex += 1; resetHole(true); }
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeClubPicker(); return; }
    if (e.code === "KeyC") {
      if (e.repeat) return;
      if (state.phase !== "idle") return;
      if (!shotModesAllowed()) return;
      e.preventDefault();
      closeClubPicker();
      cycleShotMode();
      return;
    }
    if (e.code === "Space") {
      e.preventDefault();
      if (e.repeat) return;
      if (state.phase === "idle") startSwing();
      else if (state.phase === "swinging") stopSwing();
    }
  });

  // ===== PIXEL ART (reference style) =====
  function pset(c, x, y, col) { c.fillStyle = col; c.fillRect(x | 0, y | 0, 1, 1); }
  function fillRect(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(x | 0, y | 0, w | 0, h | 0); }

  function drawOrganicStripes(c, r, a, b, stripe) {
    const pad = 8;
    const x0 = (r.x - pad) | 0, y0 = (r.y - pad) | 0;
    const x1 = (r.x + r.w + pad) | 0, y1 = (r.y + r.h + pad) | 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        if (!inOrganicRect({ x, y }, r)) continue;
        pset(c, x, y, ((((x + y) / stripe) | 0) & 1) ? b : a);
      }
    }
  }

  function drawFairwayBlobs(c, blobs, a, b, stripe) {
    if (!blobs || !blobs.length) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const bl of blobs) {
      minX = Math.min(minX, bl.x - bl.r - 4);
      minY = Math.min(minY, bl.y - bl.r - 4);
      maxX = Math.max(maxX, bl.x + bl.r + 4);
      maxY = Math.max(maxY, bl.y + bl.r + 4);
    }
    for (let y = minY | 0; y <= maxY; y++) {
      for (let x = minX | 0; x <= maxX; x++) {
        if (!blobs.some((bl) => inFairwayBlob({ x, y }, bl))) continue;
        pset(c, x, y, ((((x + y) / stripe) | 0) & 1) ? b : a);
      }
    }
  }

  function drawRoundTree(c, cx, cy, r) {
    // soft shadow bottom-right like refs
    for (let y = -r; y <= r + 4; y++) {
      for (let x = -r; x <= r + 5; x++) {
        if ((x - 3) * (x - 3) + (y - 4) * (y - 4) <= (r + 1) * (r + 1) && x * x + y * y > r * r)
          pset(c, cx + x, cy + y, "rgba(20,70,35,0.28)");
      }
    }
    fillRect(c, cx - 1, cy + r - 2, 3, 5, PAL.trunk);
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        const d = x * x + y * y;
        if (d > r * r) continue;
        const px = cx + x, py = cy + y;
        if (d > (r - 1) * (r - 1)) { pset(c, px, py, PAL.outline); continue; }
        const dither = ((px + py * 2) & 1) === 0;
        let col = PAL.treeRound1;
        if (d < r * r * 0.25) col = dither ? PAL.treeRound3 : PAL.treeRound1;
        else col = dither ? PAL.treeRound2 : PAL.treeRound1;
        if (hash(px, py) % 17 === 0) col = PAL.treeDark;
        pset(c, px, py, col);
      }
    }
  }

  function drawTallTree(c, cx, cy, h) {
    const w = Math.max(6, (h * 0.45) | 0);
    // shadow
    for (let i = 0; i < h; i++) {
      const tw = ((1 - i / h) * w) | 0;
      for (let x = -tw; x <= tw + 4; x++) pset(c, cx + x + 3, cy + i + 3, "rgba(20,70,35,0.22)");
    }
    fillRect(c, cx - 1, cy + h - 4, 3, 6, PAL.trunk);
    for (let i = 0; i < h; i++) {
      const tw = Math.max(2, ((1 - i / h) * w) | 0);
      for (let x = -tw; x <= tw; x++) {
        const edge = x === -tw || x === tw || i === 0;
        const dither = ((cx + x + i) & 1) === 0;
        let col = edge ? PAL.outline : (i < h * 0.3 ? (dither ? PAL.treeTall3 : PAL.treeTall1) : (dither ? PAL.treeTall2 : PAL.treeTall1));
        pset(c, cx + x, cy + i, col);
      }
    }
  }

  function nearFairwayEdge(x, y) {
    if (inFairway({ x, y }) || inGreen({ x, y })) return false;
    for (let dy = -14; dy <= 14; dy += 7) {
      for (let dx = -14; dx <= 14; dx += 7) {
        if (!dx && !dy) continue;
        if (inFairway({ x: x + dx, y: y + dy })) return true;
      }
    }
    return false;
  }

  function drawForest(c, r) {
    // Dense Golf Clash–style tree walls hugging the fairway
    const style = r.style || "mixed";
    const isTopBand = r.y <= 4 && r.w >= holeW() - 8 && r.h <= 50;
    const step = isTopBand ? 10 : 6;
    for (let y = r.y + 3; y < r.y + r.h + 4; y += step) {
      if (!isTopBand && y < 30) continue;
      for (let x = r.x + 3; x < r.x + r.w + 4; x += step) {
        if (!inOrganicRect({ x, y }, r) && hash(x, y) % 4 !== 0) continue;
        if (inFairway({ x, y }) || inGreen({ x, y })) continue;
        if (inWater({ x, y })) continue;
        const hug = nearFairwayEdge(x, y);
        if (isTopBand) {
          if (hash(x, y) % 3 === 0) continue;
          const ox = (hash(x, y) % 5) - 2;
          const oy = (hash(y, x) % 3) - 1;
          drawRoundTree(c, x + ox, y + oy + 2, 7 + (hash(x + 1, y) % 4));
          continue;
        }
        // denser near fairway edges (corridor walls)
        if (!hug && hash(x, y) % 5 === 0) continue;
        if (hug) {
          const ox2 = (hash(x + 9, y) % 5) - 2;
          const oy2 = (hash(y + 9, x) % 5) - 2;
          drawRoundTree(c, x + ox2, y + oy2, 5 + (hash(x, y + 3) % 4));
        }
        const ox = (hash(x, y) % 7) - 3;
        const oy = (hash(y, x) % 7) - 3;
        const pick = hash(x + 3, y + 7) % 5;
        // Mostly round canopies (Golf Clash look); tall only when style asks
        const useTall = style === "tall" || (style === "mixed" && pick === 0);
        if (useTall) drawTallTree(c, x + ox, y + oy - 6, 13 + (hash(x, y) % 9));
        else drawRoundTree(c, x + ox, y + oy, 5 + (hash(x + 1, y) % 5));
      }
    }
  }

  function drawFlowers(c, r) {
    // Soft overlapping blobs instead of a square bed
    const blobs = 5 + (hash(r.x, r.y) % 4);
    for (let i = 0; i < blobs; i++) {
      const cx = r.x + r.w * (0.2 + 0.6 * ((hash(r.x + i, r.y) % 100) / 100));
      const cy = r.y + r.h * (0.2 + 0.6 * ((hash(r.y + i, r.x) % 100) / 100));
      const rad = 8 + (hash(i, r.w) % 10);
      for (let y = -rad; y <= rad; y++) {
        for (let x = -rad; x <= rad; x++) {
          if (x * x + y * y > rad * rad) continue;
          const px = Math.round(cx + x), py = Math.round(cy + y);
          const h = hash(px, py);
          if (h % 3 === 0) pset(c, px, py, PAL.flowers[h % PAL.flowers.length]);
          else if (h % 5 === 0) pset(c, px, py, PAL.treeRound3);
          else pset(c, px, py, PAL.flowerBase);
        }
      }
    }
  }

  function drawBunker(c, sand) {
    const pts = sand.pts.map(([x, y]) => ({ x: sand.x + x, y: sand.y + y }));
    const greens = currentHole().green || [];
    // fill polygon roughly via bbox scan — never paint over green
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const q of pts) { minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x); minY = Math.min(minY, q.y); maxY = Math.max(maxY, q.y); }
    for (let py = minY | 0; py <= maxY; py++) {
      for (let px = minX | 0; px <= maxX; px++) {
        if (!inSandPoly({ x: px, y: py }, sand)) continue;
        if (inGreenBlobs(px, py, greens)) continue;
        const shade = px > (minX + maxX) / 2 || py > (minY + maxY) / 2;
        pset(c, px, py, shade && ((px + py) & 1) ? PAL.sandShade : PAL.sand);
      }
    }
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y), 1);
      for (let s = 0; s <= steps; s++) {
        const ox = Math.round(a.x + ((b.x - a.x) * s) / steps);
        const oy = Math.round(a.y + ((b.y - a.y) * s) / steps);
        if (inGreenBlobs(ox, oy, greens)) continue;
        pset(c, ox, oy, PAL.sandEdge);
      }
    }
  }

  function drawWater(c, r) {
    const pad = r.ocean ? 10 : 6;
    const ocean = !!r.ocean;
    for (let y = r.y - pad; y < r.y + r.h + pad; y++) {
      for (let x = r.x - pad; x < r.x + r.w + pad; x++) {
        // Soft oval lake / ocean corner (not a box)
        let inside;
        if (ocean) {
          const nx = (x - (r.x + r.w * 0.15)) / (r.w * 0.72);
          const ny = (y - (r.y + r.h * 0.2)) / (r.h * 0.7);
          const wobble = edgeWiggle(x, y) * 0.04;
          inside = nx * nx * 0.75 + ny * ny + wobble <= 1;
          // keep top-left open to the edge like an ocean horizon
          if (x < r.x + 18 && y < r.y + r.h * 0.55) inside = true;
          if (x < 2 || y < 2) inside = x < r.x + r.w * 0.85 && y < r.y + r.h * 0.85;
        } else {
          inside = inOrganicRect({ x, y }, r);
        }
        if (!inside) continue;
        const nearEdge = ocean
          ? (!((() => {
              const nx = (x + 3 - (r.x + r.w * 0.15)) / (r.w * 0.72);
              const ny = (y - (r.y + r.h * 0.2)) / (r.h * 0.7);
              return nx * nx * 0.75 + ny * ny <= 1.05;
            })()) ||
            !((() => {
              const nx = (x - (r.x + r.w * 0.15)) / (r.w * 0.72);
              const ny = (y + 3 - (r.y + r.h * 0.2)) / (r.h * 0.7);
              return nx * nx * 0.75 + ny * ny <= 1.05;
            })()))
          : (
            !inOrganicRect({ x: x + 2, y }, r) ||
            !inOrganicRect({ x: x - 2, y }, r) ||
            !inOrganicRect({ x, y: y + 2 }, r) ||
            !inOrganicRect({ x, y: y - 2 }, r)
          );
        // shore only on inland edge (right / bottom), not on screen rim
        if (nearEdge && x > 4 && y > 4) {
          pset(c, x, y, ocean ? "#C8E8F0" : PAL.waterShore);
          continue;
        }
        if (ocean) {
          const depth = (x / Math.max(1, r.w)) + (y / Math.max(1, r.h)) * 0.35;
          const wave = Math.sin(x * 0.22 + y * 0.08) > 0.35;
          const foam = Math.sin(x * 0.5 + y * 0.15) > 0.82 && y < r.y + 28;
          let col = depth < 0.45 ? "#2A78B8" : (depth < 0.75 ? PAL.waterDeep : "#1A5A98");
          if (wave) col = depth < 0.5 ? "#3A98D0" : PAL.water;
          if (foam) col = "#D8F0F8";
          pset(c, x, y, col);
        } else {
          const wave = Math.sin((x + y * 0.4) * 0.4) > 0;
          pset(c, x, y, wave ? PAL.water : PAL.waterDeep);
        }
      }
    }
  }

  function drawBridge(c, r) {
    fillRect(c, r.x, r.y, r.w, r.h, "#A09890");
    for (let x = r.x; x < r.x + r.w; x += 3) fillRect(c, x, r.y, 2, r.h, x % 6 ? "#A09890" : "#C8C0B8");
    fillRect(c, r.x, r.y, r.w, 1, PAL.outline);
    fillRect(c, r.x, r.y + r.h - 1, r.w, 1, PAL.outline);
  }

  function inGreenBlobs(px, py, greens) {
    for (const g of greens) {
      const dx = px - g.x, dy = py - g.y;
      if (dx * dx + dy * dy <= g.r * g.r) return true;
    }
    return false;
  }

  /** Height + TL lighting → greenA / greenB / greenShade. */
  function greenShadeColor(px, py, hole) {
    const h = greenHeightAt({ x: px, y: py }, hole);
    const hN = greenHeightAt({ x: px, y: py - 1 }, hole);
    const hW = greenHeightAt({ x: px - 1, y: py }, hole);
    // Light from top-left (same bias as the ball sprite)
    const lit = (h - hN) + (h - hW);
    const tone = h * 0.55 + lit * 0.9;
    if (tone > 0.45) return PAL.greenA;
    if (tone < -0.45) return PAL.greenShade;
    return ((px + py) & 1) ? PAL.greenB : PAL.greenA;
  }

  /**
   * Mario Golf carets — exactly 3 pixels each (no 2×2 blocks).
   * Octants: 0=E … clockwise in screen space (+y down). Match local downhill.
   */
  const SLOPE_ARROWS = [
    /* E  > */ [[0, -1], [1, 0], [0, 1]],
    /* SE ↘ */ [[-1, 0], [0, 0], [0, 1]],
    /* S  ∨ */ [[-1, 0], [0, 1], [1, 0]],
    /* SW ↙ */ [[1, 0], [0, 0], [0, 1]],
    /* W  < */ [[0, -1], [-1, 0], [0, 1]],
    /* NW ↖ */ [[1, 0], [0, 0], [0, -1]],
    /* N  ∧ */ [[-1, 0], [0, -1], [1, 0]],
    /* NE ↗ */ [[-1, 0], [0, 0], [0, -1]],
  ];

  /** Soft mid-green carets — readable without harsh contrast. */
  const SLOPE_ARROW_COL = "#6B9A48";

  /** Tiny downhill caret — points along local slope at this pixel. */
  function drawSlopeArrow(c, px, py, sx, sy, greens) {
    const mag = Math.hypot(sx, sy);
    if (mag < 1e-6) return;
    const oct = Math.round(Math.atan2(sy, sx) / (Math.PI / 4)) & 7;
    const glyph = SLOPE_ARROWS[oct];
    for (const [ox, oy] of glyph) {
      const x = px + ox, y = py + oy;
      if (!inGreenBlobs(x, y, greens)) continue;
      pset(c, x, y, SLOPE_ARROW_COL);
    }
  }

  /** Sparse grid of carets — each follows the local downhill of the undulations. */
  function drawGreenPuttMarks(c, greens, hole) {
    if (!greens.length) return;
    const step = 7;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const g of greens) {
      minX = Math.min(minX, g.x - g.r);
      minY = Math.min(minY, g.y - g.r);
      maxX = Math.max(maxX, g.x + g.r);
      maxY = Math.max(maxY, g.y + g.r);
    }
    const x0 = Math.ceil(minX / step) * step;
    const y0 = Math.ceil(minY / step) * step;
    for (let py = y0; py <= maxY; py += step) {
      for (let px = x0; px <= maxX; px += step) {
        if (!inGreenBlobs(px, py, greens)) continue;
        const sl = greenSlopeAt({ x: px, y: py }, hole);
        if (Math.hypot(sl.sx, sl.sy) < 0.02) continue;
        drawSlopeArrow(c, px, py, sl.sx, sl.sy, greens);
      }
    }
  }

  function drawGreen(c, greens) {
    if (!greens.length) return;
    const hole = currentHole();
    const puttMode = currentClub().id === "putter";
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const g of greens) {
      minX = Math.min(minX, g.x - g.r); minY = Math.min(minY, g.y - g.r);
      maxX = Math.max(maxX, g.x + g.r); maxY = Math.max(maxY, g.y + g.r);
    }
    for (let py = minY | 0; py <= maxY; py++) {
      for (let px = minX | 0; px <= maxX; px++) {
        if (!inGreenBlobs(px, py, greens)) continue;
        pset(c, px, py, greenShadeColor(px, py, hole));
      }
    }
    if (puttMode) {
      drawGreenPuttMarks(c, greens, hole);
    } else {
      // Decorative V grain when not reading putts
      for (const g of greens) {
        for (let i = 0; i < 10; i++) {
          const ang = (i / 10) * Math.PI * 2 + 0.2;
          const gx = Math.round(g.x + Math.cos(ang) * g.r * 0.45);
          const gy = Math.round(g.y + Math.sin(ang) * g.r * 0.4);
          if (!inGreenBlobs(gx, gy, greens)) continue;
          pset(c, gx, gy, PAL.greenMark);
          pset(c, gx + 1, gy + 1, PAL.greenMark);
          pset(c, gx + 2, gy, PAL.greenMark);
        }
      }
    }
    // single outer edge
    for (let py = (minY | 0) - 1; py <= maxY + 1; py++) {
      for (let px = (minX | 0) - 1; px <= maxX + 1; px++) {
        if (inGreenBlobs(px, py, greens)) continue;
        if (inGreenBlobs(px + 1, py, greens) || inGreenBlobs(px - 1, py, greens) || inGreenBlobs(px, py + 1, greens) || inGreenBlobs(px, py - 1, greens))
          pset(c, px, py, PAL.greenEdge);
      }
    }
  }

  /** Dark-green grass squares — one tee box per distance — with colored marker pegs. */
  function drawTeeBoxes(c, hole) {
    if (!hole || !hole.tees) return;
    const size = TEE_BOX_SIZE; // odd so the tee point sits in the center
    const half = (size - 1) >> 1;
    for (const set of TEE_SETS) {
      const tee = hole.tees[set.id];
      if (!tee) continue;
      const cx = Math.round(tee.x);
      const cy = Math.round(tee.y);
      const nx = tee.nx || 1, ny = tee.ny || 0;
      const active = set.id === state.teeId;
      const a = set.grassA || "#6EAE48";
      const b = set.grassB || "#5E9A3C";
      // Axis-aligned lighter grass square (still darker than fairway)
      for (let dy = -half; dy <= half; dy++) {
        for (let dx = -half; dx <= half; dx++) {
          const px = cx + dx, py = cy + dy;
          const edge = dx === -half || dx === half || dy === -half || dy === half;
          if (edge) {
            pset(c, px, py, active ? "#3A6E28" : "#4A7E32");
          } else {
            pset(c, px, py, ((((px + py) / 2) | 0) & 1) ? b : a);
          }
        }
      }
      // Paired marker pegs on the sides of the square (across the fairway)
      for (const side of [-1, 1]) {
        const mx = Math.round(cx + nx * side * (half + 2));
        const my = Math.round(cy + ny * side * (half + 2));
        fillRect(c, mx - 1, my - 1, 3, 3, "#101010");
        fillRect(c, mx, my, 2, 2, set.color);
        if (active) {
          pset(c, mx, my - 1, "#FFF");
          pset(c, mx + 1, my - 1, "#FFF");
        }
      }
    }
  }

  /** Flag always; cup only on-green (smaller hole for putt close-up). */
  function drawCupFlag(c, cup, n, showCup) {
    if (showCup) {
      // Compact cup — rim r≈2, hole r≈1 (was 5 / 3)
      for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) if (x * x + y * y <= 4) pset(c, cup.x + x, cup.y + y, "#244A30");
      for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) if (x * x + y * y <= 1) pset(c, cup.x + x, cup.y + y, PAL.cup);
    }
    fillRect(c, cup.x, cup.y - 17, 1, 17, "#EEE");
    // checkered flag like some refs
    for (let yy = 0; yy < 6; yy++) {
      for (let xx = 0; xx < 9; xx++) {
        const chk = ((xx >> 1) + (yy >> 1)) & 1;
        pset(c, cup.x + 1 + xx, cup.y - 17 + yy, chk ? PAL.flag : PAL.flagW);
      }
    }
    c.fillStyle = "#111";
    c.font = "5px monospace";
    c.fillText(String(n), cup.x + 3, cup.y - 12);
  }

  function bakeCourse() {
    ensureWorldBuffers();
    const hole = currentHole();
    const ww = holeW(), wh = holeH();
    cctx.imageSmoothingEnabled = false;
    // Full rough wash, then curved fairway (circle blobs — no boxes)
    drawOrganicStripes(cctx, { x: -10, y: -10, w: ww + 20, h: wh + 20 }, PAL.roughA, PAL.roughB, 4);
    for (const r of hole.rough || []) drawOrganicStripes(cctx, r, PAL.roughA, PAL.roughB, 4);
    drawFairwayBlobs(cctx, hole.fairway, PAL.fairA, PAL.fairB, 3);
    drawTeeBoxes(cctx, hole);
    drawGreen(cctx, hole.green || []);
    for (const r of hole.water || []) drawWater(cctx, r);
    for (const r of hole.bridges || []) drawBridge(cctx, r);
    for (const s of hole.sand || []) drawBunker(cctx, s);
    for (const r of hole.flowers || []) drawFlowers(cctx, r);
    for (const r of hole.forest || []) drawForest(cctx, r);
    state.courseDirty = false;
  }

  function drawGolfer(pos) {
    if (state.phase === "flying") return;
    const f = state.facing;
    const x = Math.round(pos.x) - f * 3, y = Math.round(pos.y);
    fillRect(bctx, x, y + 3, 4, 1, "#0005");
    fillRect(bctx, x + 1, y + 2, 1, 2, PAL.pants);
    fillRect(bctx, x + 3, y + 2, 1, 2, PAL.pants);
    fillRect(bctx, x + 1, y, 3, 3, PAL.shirt);
    fillRect(bctx, x + 1, y, 3, 1, PAL.outline);
    fillRect(bctx, x + 1, y + 2, 3, 1, PAL.outline);
    fillRect(bctx, x + 1, y - 2, 2, 2, PAL.skin);
    fillRect(bctx, x + 1, y - 3, 3, 1, PAL.golfer);
    fillRect(bctx, x + (f > 0 ? 4 : -1), y, 1, 3, "#777");
    fillRect(bctx, x + (f > 0 ? 4 : -2), y + 2, 2, 1, "#555");
  }

  function drawAimCross(x, y, color) {
    const ax = Math.round(x);
    const ay = Math.round(y);
    // Tiny + only on the green (putt close-up); full cross elsewhere
    if (terrainAt(ballPos()) === "green") {
      fillRect(bctx, ax - 1, ay, 3, 1, color);
      fillRect(bctx, ax, ay - 1, 1, 3, color);
      return;
    }
    fillRect(bctx, ax - 3, ay - 1, 7, 3, color);
    fillRect(bctx, ax - 1, ay - 3, 3, 7, color);
  }
  function drawAimMarkersAt(ax, ay, tipDist) {
    const club = currentClub();
    const shot = effectiveShot(club);
    const hole = currentHole();
    // Carry marker along the aim ray (putter has no aerial carry)
    if (club.id !== "putter" && shot.loft > 0 && tipDist > 0.0001) {
      const carry = tipDist / (1 + shot.bounce * CARRY_BOUNCE_BUDGET);
      const t = carry / tipDist;
      const cx = Math.round(state.ball.x + (ax - state.ball.x) * t);
      const cy = Math.round(state.ball.y + (ay - state.ball.y) * t);
      fillRect(bctx, cx, cy, 1, 1, "#9ADCF5AA");
      fillRect(bctx, cx - 1, cy, 3, 1, "#9ADCF588");
      fillRect(bctx, cx, cy - 1, 1, 3, "#9ADCF588");
    }
    // Deterministic wind-drift ghost near aim tip (same scale as applyScatter, no random/bias)
    const wAng = windDirAngle(hole.windDir);
    const wStr = (hole.wind || 0) * clubWindMul(club) * 2.4;
    if (wStr > 0.05) {
      const gx = Math.round(ax + Math.cos(wAng) * wStr);
      const gy = Math.round(ay + Math.sin(wAng) * wStr);
      const s = club.id === "putter" ? 1 : 2;
      fillRect(bctx, gx - (s >> 1), gy - (s >> 1), s, s, "#9ADCF5AA");
    }
  }
  function drawRangeAndAim() {
    if (state.phase === "flying" || state.phase === "done") return;
    const cosA = Math.cos(state.aim);
    const sinA = Math.sin(state.aim);
    const lockDist = state.aimDist;
    const ax = state.ball.x + cosA * lockDist;
    const ay = state.ball.y + sinA * lockDist;

    // Solid cross only after player click (or while swinging that locked aim)
    const showLocked = state.aimLocked && (state.phase === "idle" || state.phase === "swinging");
    if (showLocked) {
      drawAimCross(ax, ay, "#FFFFFF");
      drawAimMarkersAt(ax, ay, lockDist);
    }

    // Idle hover preview — follows cursor; no lock until click
    if (state.phase === "idle" && state.pointer) {
      const preview = snapAimPoint(state.pointer);
      const dx = preview.x - state.ball.x;
      const dy = preview.y - state.ball.y;
      const clickDist = Math.hypot(dx, dy);
      const prevDist = resolveAimDist(clickDist);
      let px = preview.x;
      let py = preview.y;
      // Fixed-carry clubs: ghost lands at full club range along aim direction
      if (clubFixedCarry(currentClub()) && clickDist > 0.0001) {
        px = state.ball.x + (dx / clickDist) * prevDist;
        py = state.ball.y + (dy / clickDist) * prevDist;
      }
      if (!showLocked || Math.hypot(px - ax, py - ay) > 2) {
        drawAimCross(px, py, "#FFFFFF66");
        drawAimMarkersAt(px, py, prevDist);
      }
    }
  }

  /** Live flight pose while phase is flying; rest pose after finishDrop clears flight. */
  function ballPos() {
    if (state.flight) {
      return {
        x: state.flight.x,
        y: state.flight.y,
        z: Math.max(0, state.flight.z),
      };
    }
    return { x: state.ball.x, y: state.ball.y, z: 0 };
  }
  /** Grounded ball size — smaller only on the green, full size on fairway/rough/etc. */
  function ballBaseScale(p) {
    const at = p || state.ball;
    if (at && terrainAt(at) === "green") return 0.28;
    return 0.55;
  }
  function ballFlightScaleTarget(wx, wy, wz) {
    const BASE = ballBaseScale({ x: wx, y: wy });
    const PEAK = 1.35;
    const f = state.flight;
    if (!f || f.mode !== "air" || !(f.carryDist > 0)) return BASE;
    const traveled = Math.hypot(wx - f.ox, wy - f.oy);
    let u = clamp(traveled / f.carryDist, 0, 1);
    // Smoothstep progress — softer ease in/out along the shot
    u = u * u * (3 - 2 * u);
    // sin² envelope: flat near start/end, round peak at mid-flight
    const s = Math.sin(u * Math.PI);
    const arc = s * s;
    const peak = Math.max(f.peakZ || 0, 1);
    const h = clamp((wz || 0) / peak, 0, 1);
    const hSmooth = h * h * (3 - 2 * h);
    const blend = arc * (0.25 + 0.75 * hSmooth);
    return BASE + (PEAK - BASE) * blend;
  }
  function drawBall(pos) {
    const z = Math.max(0, pos.z || 0);
    const x = pos.x;
    const groundY = Math.round(pos.y);
    const y = pos.y - z;
    const f = state.flight;
    const base = ballBaseScale(pos);
    const heightScale = (f && typeof f.scale === "number")
      ? f.scale
      : ballFlightScaleTarget(pos.x, pos.y, z);
    const lift = clamp((heightScale - base) / 0.8, 0, 1);
    const shadowW = Math.max(2, 2 + lift * 4);
    fillRect(bctx, Math.round(x - shadowW / 2), groundY + 1, Math.round(shadowW), 1, "#0005");
    if (ballSpriteReady) {
      const sw = ballSprite.naturalWidth || 7;
      const sh = ballSprite.naturalHeight || 7;
      const minPx = terrainAt(pos) === "green" ? 2 : 3;
      const dw = Math.max(minPx, sw * heightScale);
      const dh = Math.max(minPx, sh * heightScale);
      // Sub-pixel scale + light smoothing = fluid size change in flight
      bctx.imageSmoothingEnabled = !!(f && f.mode === "air");
      bctx.drawImage(ballSprite, 0, 0, sw, sh, x - dw / 2, y - dh / 2, dw, dh);
      bctx.imageSmoothingEnabled = false;
      return;
    }
    const r = Math.max(1, Math.round(1 + heightScale * 2));
    const r2 = r * r;
    const ix = Math.round(x), iy = Math.round(y);
    for (let yy = -r; yy <= r; yy++) {
      for (let xx = -r; xx <= r; xx++) {
        if (xx * xx + yy * yy > r2) continue;
        const shade = xx + yy > r * 0.4 ? "#7D8E8E" : PAL.ball;
        pset(bctx, ix + xx, iy + yy, shade);
      }
    }
    pset(bctx, ix - Math.max(1, r >> 1), iy - Math.max(1, r >> 1), "#FFF");
  }

  function drawSwingMeter() {
    const w = swingCanvas.width, h = swingCanvas.height;
    const padX = 8, padY = 10;
    const barX = padX, barY = padY;
    const barW = w - padX * 2, barH = h - padY * 2;
    const pos = clamp(state.swingPos, 0, 1);
    const accuracy = state.phase === "swinging" && state.swingStage === "accuracy";
    const perfectHalf = SWING_BANDS[0].maxDev / 2;
    const powerActive = !accuracy;
    const sweetActive = accuracy;

    sctx.imageSmoothingEnabled = false;
    sctx.fillStyle = "#141618";
    sctx.fillRect(0, 0, w, h);

    // Neutral track — no band colors
    sctx.fillStyle = "#1e2226";
    sctx.fillRect(barX, barY, barW, barH);
    sctx.fillStyle = "#0a0c0e";
    sctx.fillRect(barX, barY + barH - 2, barW, 2);
    sctx.strokeStyle = "#000";
    sctx.lineWidth = 2;
    sctx.strokeRect(barX + 0.5, barY + 0.5, barW - 1, barH - 1);

    function drawPressMark(t, active, col) {
      const x = Math.round(barX + clamp(t, 0, 1) * barW);
      // Tall tick + top/bottom caps so the press point reads clearly
      sctx.fillStyle = active ? col : "#3a3e42";
      sctx.fillRect(x - 1, barY - 5, 3, barH + 10);
      if (active) {
        sctx.fillStyle = "#FFF";
        sctx.fillRect(x, barY - 5, 1, barH + 10);
        sctx.fillRect(x - 3, barY - 5, 7, 2);
        sctx.fillRect(x - 3, barY + barH + 3, 7, 2);
      }
    }

    // Only the two press targets: left power + middle accuracy
    drawPressMark(0, powerActive, "#FF6A3A");
    drawPressMark(SWEET_SPOT, sweetActive, "#8CFF7A");

    // Cursor
    const cx = Math.round(barX + pos * barW);
    const cursorW = 4, cursorH = barH + 6;
    sctx.fillStyle = "#000";
    sctx.fillRect(cx - Math.floor(cursorW / 2) - 1, barY - 4, cursorW + 2, cursorH + 2);
    sctx.fillStyle = "#FFF";
    sctx.fillRect(cx - Math.floor(cursorW / 2), barY - 3, cursorW, cursorH);
    if (accuracy && Math.abs(pos - SWEET_SPOT) <= perfectHalf) {
      sctx.fillStyle = "#8CFF7A";
      sctx.fillRect(cx - 1, barY - 3, 2, cursorH);
    } else if (!accuracy && pos <= POWER_WINDOW) {
      sctx.fillStyle = "#FF6A3A";
      sctx.fillRect(cx - 1, barY - 3, 2, cursorH);
    }
  }

  function paintDockTrees() {
    const w = dockTrees.width, h = dockTrees.height;
    dctx.imageSmoothingEnabled = false;
    dctx.fillStyle = PAL.treeDark; dctx.fillRect(0, 0, w, h);
    for (let y = 10; y < h + 12; y += 12) {
      for (let x = 8; x < w + 10; x += 12) {
        const ox = (hash(x, y) % 5) - 2, oy = (hash(y, x) % 5) - 2;
        const r = 8 + (hash(x, y + 3) % 5);
        for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) {
          const d = xx * xx + yy * yy; if (d > r * r) continue;
          const px = x + ox + xx, py = y + oy + yy;
          if (d > (r - 1) * (r - 1)) dctx.fillStyle = PAL.outline;
          else {
            const dither = ((px ^ (py * 3)) & 1) === 0;
            dctx.fillStyle = d < r * r * 0.3 ? (dither ? PAL.treeRound3 : PAL.treeRound1) : (dither ? PAL.treeRound2 : PAL.treeRound1);
          }
          dctx.fillRect(px, py, 1, 1);
        }
      }
    }
  }

  function updateSwing(dt) {
    if (state.phase !== "swinging") return;
    // Soft coach pause after power — needle stays put while accuracy tip is shown
    if (state.swingHoldUntil) {
      if (performance.now() < state.swingHoldUntil) {
        state.swingValue = state.swingPos;
        return;
      }
      releaseSwingHold();
    }
    const stageMul = state.swingStage === "accuracy" ? SWING_ACCURACY_SPEED_MUL : 1;
    const speed = SWING_SPEED * swingSpeedMul() * stageMul;
    state.swingPos += state.swingDir * dt * speed;
    if (state.swingStage === "power") {
      // Single pass right→left; overflow past tip = weak power, then accuracy
      if (state.swingPos <= 0) {
        state.swingPos = 0;
        beginAccuracyStage(POWER_OVERFLOW);
      }
    } else {
      // Arm only after delay + leaving the left power zone (driver is fast enough to
      // clear the zone before a ghost second press from the power tap otherwise)
      if (
        !state.accuracyArmed &&
        state.swingPos >= POWER_WINDOW &&
        performance.now() >= state.accuracyArmAt
      ) {
        state.accuracyArmed = true;
      }
      if (state.swingPos >= 1) {
        // Accuracy runs left→right; past right end = max miss
        state.swingPos = 1;
        finishAccuracySwing(SWING_BANDS[SWING_BANDS.length - 1], 1);
      }
    }
    state.swingValue = state.swingPos;
  }

  canvas.width = VIEW_W * PX; canvas.height = VIEW_H * PX;
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    updateSwing(dt);
    // Physics settle / hazard / hole-out all go through finishDrop
    updateFlight(dt);
    updateCam(dt);
    if (state.courseDirty) bakeCourse();
    bctx.imageSmoothingEnabled = false;
    bctx.drawImage(courseLayer, 0, 0);
    const pos = ballPos();
    // Cup only when on green; from fairway/rough you just see the pin.
    drawCupFlag(bctx, currentHole().cup, state.holeIndex + 1, inGreen(pos));
    drawRangeAndAim();
    drawGolfer(pos); drawBall(pos);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const v = viewBlit();
    ctx.drawImage(buffer, v.sx, v.sy, v.sw, v.sh, v.dx, v.dy, v.dw, v.dh);
    drawSwingMeter();
    requestAnimationFrame(frame);
  }

  paintDockTrees();
  buildClubList();
  applyTeeSet(DEFAULT_TEE_ID);
  resetHole(false);
  showTeeSelect();
  requestAnimationFrame(frame);
})();
