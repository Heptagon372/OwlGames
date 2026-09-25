// 데모 모드용 가짜 데이터 (Supabase 미설정 시). 실제 모드에서는 쓰이지 않는다.

import { maskName } from "./format";
import { levelFromPoints, rankFromLevel, tierFromRank } from "./rank";
import { DEFAULT_CONFIG } from "./config";
import type {
  AdminStats,
  AuditRow,
  BoardEvent,
  BoardStats,
  BoothDrawResult,
  BoothLookup,
  DrawRow,
  GameBestRow,
  GameId,
  GameSessionRow,
  LeaderboardRow,
  OwlEnergy,
  PrizeRow,
  Profile,
  TicketRow,
} from "./types";

const NAMES = [
  "김민준", "이서연", "박도윤", "최하은", "정시우", "강지아", "조하준", "윤서아", "장은우", "임지호",
  "한수아", "오예준", "서지유", "신건우", "권하린", "황우진", "안채원", "송민재", "류다은", "남궁현우",
];

const POINTS = [
  27720, 21480, 18810, 15230, 12970, 11020, 9340, 8120, 7005, 6110,
  5260, 4480, 3720, 3010, 2420, 1880, 1310, 820, 410, 150,
];

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

export const DEMO_PROFILE: Profile = (() => {
  const total = 6480;
  const level = levelFromPoints(total);
  return {
    id: "demo-me",
    name: "데모부엉",
    student_id: "202612345",
    role: "admin",
    verified: true,
    total_points: total,
    level,
    rank_idx: rankFromLevel(level),
    created_at: minutesAgo(180),
  };
})();

export const DEMO_LEADERBOARD: LeaderboardRow[] = (() => {
  const rows = NAMES.map((n, i) => {
    const level = levelFromPoints(POINTS[i]);
    return {
      user_id: `demo-${i}`,
      masked_name: maskName(n),
      rank_idx: rankFromLevel(level),
      level,
      total_points: POINTS[i],
      position: 0,
    };
  });
  rows.splice(9, 0, {
    user_id: DEMO_PROFILE.id,
    masked_name: maskName(DEMO_PROFILE.name),
    rank_idx: DEMO_PROFILE.rank_idx,
    level: DEMO_PROFILE.level,
    total_points: DEMO_PROFILE.total_points,
    position: 0,
  });
  return rows.sort((a, b) => b.total_points - a.total_points).map((r, i) => ({ ...r, position: i + 1 }));
})();

const BEST_BASE: Record<GameId, number> = { typer: 1080, flight: 5200, phish: 2700, logic: 4100, survive: 6800 };

export function demoGameBests(game: GameId): GameBestRow[] {
  return NAMES.slice(0, 15).map((n, i) => ({
    game,
    user_id: `demo-${i}`,
    masked_name: maskName(n),
    rank_idx: DEMO_LEADERBOARD[i]?.rank_idx ?? 0,
    best_score: Math.round(BEST_BASE[game] * (1 - i * 0.055)),
    position: i + 1,
  }));
}

export const DEMO_SESSIONS: GameSessionRow[] = [
  { game: "typer", raw: 812, pts: 233, m: 6 },
  { game: "survive", raw: 3420, pts: 144, m: 9 },
  { game: "phish", raw: 1830, pts: 213, m: 14 },
  { game: "logic", raw: 2960, pts: 178, m: 18 },
  { game: "flight", raw: 402, pts: 164, m: 21 },
  { game: "typer", raw: 640, pts: 190, m: 33 },
  { game: "flight", raw: 90, pts: 0, m: 38, rejected: true },
  { game: "phish", raw: 2410, pts: 271, m: 52 },
].map((s, i) => ({
  id: `demo-s${i}`,
  user_id: DEMO_PROFILE.id,
  game: s.game as GameId,
  started_at: minutesAgo(s.m + 1),
  submitted_at: minutesAgo(s.m),
  raw_score: s.raw,
  points: s.pts,
  meta: null,
  status: s.rejected ? "rejected" : "submitted",
}));

export const DEMO_TICKETS: TicketRow[] = [0, 1, 2, 3, 4, 5].map((r) => ({
  id: `demo-t${r}`,
  earned_rank_idx: r + 1,
  status: r < 2 ? "used" : "unused",
  redeem_code_id: null,
  created_at: minutesAgo(120 - r * 15),
  used_at: r < 2 ? minutesAgo(60) : null,
}));

export const DEMO_DRAWS: (DrawRow & { prize_name: string | null })[] = [
  {
    id: "demo-d0",
    ticket_id: "demo-t0",
    user_id: DEMO_PROFILE.id,
    rank_idx: 3,
    tier: 2,
    place: 4,
    prize_name: "과자",
    claimed: true,
    claimed_at: minutesAgo(59),
    drawn_at: minutesAgo(60),
  },
  {
    id: "demo-d1",
    ticket_id: "demo-t1",
    user_id: DEMO_PROFILE.id,
    rank_idx: 3,
    tier: 2,
    place: null,
    prize_name: null,
    claimed: false,
    claimed_at: null,
    drawn_at: minutesAgo(60),
  },
];

export const DEMO_PRIZES: PrizeRow[] = [
  { place: 1, name: "게이밍 PC", stock: 1 },
  { place: 2, name: "게이밍 마우스", stock: 4 },
  { place: 3, name: "장패드", stock: 17 },
  { place: 4, name: "과자", stock: 82 },
  { place: 5, name: "젤리", stock: 163 },
];

export const DEMO_STATS: BoardStats = { participants: 214, plays: 1387, challengers: 1, draws: 96 };

/** 관리자 대시보드 (admin_stats RPC 대용) */
export const DEMO_ADMIN_STATS: AdminStats = {
  users: { total: 214, verified: 201, pending: 13, staff: 6, admin: 2, today: 47, energy_avg: 6.4 },
  today: { plays: 1387, rejected: 21, active: 3, points: 243_910, adjusted: 4 },
  games: [
    { game: "typer", plays: 412, rejected: 5, avg_raw: 1180, best_raw: 3420, avg_pts: 228 },
    { game: "phish", plays: 351, rejected: 4, avg_raw: 1960, best_raw: 4180, avg_pts: 212 },
    { game: "flight", plays: 298, rejected: 9, avg_raw: 3140, best_raw: 9860, avg_pts: 187 },
    { game: "logic", plays: 186, rejected: 2, avg_raw: 2870, best_raw: 6240, avg_pts: 173 },
    { game: "survive", plays: 140, rejected: 1, avg_raw: 3620, best_raw: 8110, avg_pts: 151 },
  ],
  tickets: { unused: 88, reserved: 12, used: 96 },
  prizes: [
    { place: 1, name: "게이밍 PC", stock: 1, drawn: 0 },
    { place: 2, name: "게이밍 마우스", stock: 4, drawn: 2 },
    { place: 3, name: "장패드", stock: 17, drawn: 9 },
    { place: 4, name: "과자", stock: 82, drawn: 38 },
    { place: 5, name: "젤리", stock: 163, drawn: 47 },
  ],
  energy_today: 62,
  energy_drops_today: 18,
  draws_today: 96,
  generated_at: new Date().toISOString(),
};

/** 감사 로그 (admin_audit 대용) */
export const DEMO_AUDIT: AuditRow[] = [
  { action: "user.role", actor: "데모부엉", target: "김민수", detail: { from: "user", to: "staff" }, m: 4 },
  { action: "user.energy", actor: "부원A", target: "이서연", detail: { from: 2, to: 7 }, m: 12 },
  { action: "prize.stock", actor: "데모부엉", target: "장패드", detail: { place: 3, from: 20, to: 17 }, m: 31 },
  { action: "config.set", actor: "데모부엉", target: "open_hours", detail: { key: "open_hours" }, m: 55 },
  { action: "user.verify", actor: "부원A", target: "박도윤", detail: { student_id: "202612345" }, m: 78 },
  { action: "user.delete", actor: "데모부엉", target: "탈퇴계정", detail: { total_points: 120 }, m: 140 },
].map((a, i) => ({
  id: i + 1,
  actor_id: DEMO_PROFILE.id,
  actor_name: a.actor,
  action: a.action,
  target_id: null,
  target_name: a.target,
  detail: a.detail as Record<string, unknown>,
  created_at: minutesAgo(a.m),
}));

export const DEMO_BOARD_EVENTS: BoardEvent[] = [
  { kind: "draw" as const, name: "홍길동", rank: 5, place: 3, prize: "장패드", m: 1 },
  { kind: "rank_up" as const, name: "김민수", rank: 8, place: null, prize: null, m: 2 },
  { kind: "draw" as const, name: "이서연", rank: 9, place: 5, prize: "젤리", m: 4 },
  { kind: "rank_up" as const, name: "박도윤", rank: 12, place: null, prize: null, m: 6 },
  { kind: "draw" as const, name: "최하은", rank: 3, place: 4, prize: "과자", m: 7 },
].map((e, i) => ({
  id: i + 1,
  kind: e.kind,
  masked_name: maskName(e.name),
  rank_idx: e.rank,
  place: e.place,
  prize_name: e.prize,
  created_at: minutesAgo(e.m),
}));

export type PendingUser = Pick<Profile, "id" | "name" | "student_id" | "created_at">;

export const DEMO_PENDING: PendingUser[] = [
  { id: "demo-p0", name: "신입생", student_id: "202614001", created_at: minutesAgo(2) },
  { id: "demo-p1", name: "김부엉", student_id: "202511093", created_at: minutesAgo(5) },
  { id: "demo-p2", name: "이올빼", student_id: "202420517", created_at: minutesAgo(11) },
];

export const DEMO_ALL_USERS: Profile[] = NAMES.slice(0, 12).map((n, i) => {
  const level = levelFromPoints(POINTS[i]);
  return {
    id: `demo-${i}`,
    name: n,
    student_id: `2026${String(10001 + i * 37).padStart(5, "0")}`,
    role: i === 0 ? "staff" : "user",
    verified: true,
    owl_energy: (i * 3) % 11,
    total_points: POINTS[i],
    level,
    rank_idx: rankFromLevel(level),
    created_at: minutesAgo(300 - i * 10),
  };
});

// ---- 부스 키오스크 시뮬레이션 ----

let demoRemaining = 3;

export function demoLookup(code: string): BoothLookup {
  demoRemaining = 3;
  return {
    code_id: "demo-code",
    code: code.toUpperCase(),
    user_id: DEMO_PROFILE.id,
    name: "홍길동",
    student_id: "202612345",
    rank_idx: DEMO_PROFILE.rank_idx,
    level: DEMO_PROFILE.level,
    tier: tierFromRank(DEMO_PROFILE.rank_idx),
    remaining: demoRemaining,
    expires_at: new Date(Date.now() + 8 * 60_000).toISOString(),
  };
}

/** 데모 전용 추첨 — 실제 추첨은 서버 booth_draw RPC(gen_random_bytes) */
export function demoDraw(tier: number): BoothDrawResult {
  const table = DEFAULT_CONFIG.gacha_table[String(tier)] ?? DEFAULT_CONFIG.gacha_table["1"];
  // 데모에서는 1·2등 특수 연출을 확인하기 쉽도록 해당 확률만 20배로 부풀린다
  const boost = [20, 20, 1, 1, 1];
  const roll = Math.random() * 100;
  let acc = 0;
  let place: number | null = null;
  for (let i = 0; i < table.length; i++) {
    acc += table[i] * boost[i];
    if (roll < acc) {
      place = i + 1;
      break;
    }
  }
  demoRemaining = Math.max(0, demoRemaining - 1);
  return {
    draw_id: `demo-draw-${Date.now()}`,
    place,
    prize_name: place ? DEMO_PRIZES[place - 1].name : null,
    tier,
    rank_idx: DEMO_PROFILE.rank_idx,
    remaining: demoRemaining,
  };
}


// ── 아울 에너지 (데모 전용 시뮬레이션) ──────────────────
// 서버에서는 profiles.owl_energy + 10분마다 1개 충전으로 동작한다.
const EN = DEFAULT_CONFIG.owl_energy;
let demoEnergy = 7;
let demoEnergyAt = Date.now();

function demoSync(): void {
  if (demoEnergy >= EN.cap) {
    demoEnergyAt = Date.now();
    return;
  }
  const step = EN.regen_min * 60_000;
  const n = Math.floor((Date.now() - demoEnergyAt) / step);
  if (n > 0) {
    demoEnergy = Math.min(EN.cap, demoEnergy + n);
    demoEnergyAt = demoEnergy >= EN.cap ? Date.now() : demoEnergyAt + n * step;
  }
}

export function demoEnergyStatus(): OwlEnergy {
  demoSync();
  const step = EN.regen_min * 60;
  const elapsed = (Date.now() - demoEnergyAt) / 1000;
  const next = demoEnergy >= EN.cap ? 0 : Math.max(0, Math.round(step - (elapsed % step)));
  const missing = Math.max(0, EN.cap - demoEnergy);
  return {
    energy: demoEnergy,
    cap: EN.cap,
    hard_cap: EN.hard_cap,
    cost: EN.cost,
    next_refill_sec: next,
    full_in_sec: missing === 0 ? 0 : next + (missing - 1) * step,
  };
}

/** 데모에서 게임 시작 시 소모. 부족하면 false */
export function demoSpendEnergy(): boolean {
  demoSync();
  if (demoEnergy < EN.cost) return false;
  if (demoEnergy >= EN.cap) demoEnergyAt = Date.now();
  demoEnergy -= EN.cost;
  return true;
}

export function demoAddEnergy(amount: number): number {
  demoSync();
  const before = demoEnergy;
  demoEnergy = Math.min(EN.hard_cap, demoEnergy + amount);
  return demoEnergy - before;
}
