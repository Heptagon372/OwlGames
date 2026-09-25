// DB 행 / RPC 응답 타입 (supabase/migrations 와 1:1)

export type UserRole = "user" | "staff" | "admin";
export type GameId = "typer" | "flight" | "phish" | "logic" | "survive" | "space";

export type Profile = {
  id: string;
  name: string;
  student_id: string;
  role: UserRole;
  verified: boolean;
  total_points: number;
  level: number;
  rank_idx: number;
  /** 아울 에너지 (마이그레이션 20260925 이후) */
  owl_energy?: number;
  created_at: string;
};

export type LeaderboardRow = {
  user_id: string;
  masked_name: string;
  rank_idx: number;
  level: number;
  total_points: number;
  position: number;
};

export type GameBestRow = {
  game: GameId;
  user_id: string;
  masked_name: string;
  rank_idx: number;
  best_score: number;
  position: number;
};

/** admin_stats() 응답 (20260927000100_admin_system.sql) */
export type AdminStats = {
  users: {
    total: number;
    verified: number;
    pending: number;
    staff: number;
    admin: number;
    today: number;
    energy_avg: number;
  };
  today: { plays: number; rejected: number; active: number; points: number; adjusted: number };
  games: {
    game: GameId;
    plays: number;
    rejected: number;
    avg_raw: number;
    best_raw: number;
    avg_pts: number;
  }[];
  tickets: { unused: number; reserved: number; used: number };
  prizes: { place: number; name: string; stock: number; drawn: number }[];
  energy_today: number;
  energy_drops_today: number;
  draws_today: number;
  generated_at: string;
};

/** admin_audit 행 — 남의 계정·설정·재고를 건드린 기록 */
export type AuditRow = {
  id: number;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  target_id: string | null;
  target_name: string | null;
  detail: Record<string, unknown>;
  created_at: string;
};

export type GameSessionStatus = "active" | "submitted" | "rejected" | "expired";

export type GameSessionRow = {
  id: string;
  user_id: string;
  game: GameId;
  started_at: string;
  submitted_at: string | null;
  raw_score: number | null;
  points: number | null;
  meta: Record<string, unknown> | null;
  status: GameSessionStatus;
};

export type TicketStatus = "unused" | "reserved" | "used";

export type TicketRow = {
  id: string;
  earned_rank_idx: number;
  status: TicketStatus;
  redeem_code_id: string | null;
  created_at: string;
  used_at: string | null;
};

export type RedeemCodeRow = {
  id: string;
  code: string;
  ticket_count: number;
  expires_at: string;
  status: "active" | "used" | "expired" | "revoked";
  created_at: string;
};

export type PrizeRow = { place: number; name: string; stock: number };

export type DrawRow = {
  id: string;
  ticket_id: string;
  user_id: string;
  rank_idx: number;
  tier: number;
  place: number | null;
  claimed: boolean;
  claimed_at: string | null;
  drawn_at: string;
};

export type BoardEvent = {
  id: number;
  kind: "draw" | "rank_up";
  masked_name: string;
  rank_idx: number | null;
  place: number | null;
  prize_name: string | null;
  created_at: string;
};

export type BoardStats = {
  participants: number;
  plays: number;
  challengers: number;
  draws: number;
};

// ---- RPC 응답 ----

/** 아울 에너지 (스태미나) — 10분마다 1개, 최대 10개 */
export type OwlEnergy = {
  energy: number;
  cap: number;
  hard_cap: number;
  cost: number;
  /** 다음 1개까지 남은 초 (가득 찼으면 0) */
  next_refill_sec: number;
  /** 가득 찰 때까지 남은 초 */
  full_in_sec: number;
};

export type EnergyGrantResult = {
  user_id: string;
  name: string;
  student_id: string;
  energy: number;
  granted: number;
};

export type SubmitResult = {
  status: "ok" | "rejected";
  reason?: string;
  raw_score: number;
  points: number;
  total_points: number;
  level_before: number;
  level_after: number;
  rank_before: number;
  rank_after: number;
  tickets_gained: number;
  /** 게임에서 아울 에너지를 주웠는지 (서버가 최종 판정) */
  owl_energy_gained?: number;
  /** 제출 후 남은 아울 에너지 */
  owl_energy?: number;
};

export type IssuedCode = {
  code: string;
  ticket_count: number;
  expires_at: string;
};

export type BoothLookup = {
  code_id: string;
  code: string;
  user_id: string;
  name: string;
  student_id: string;
  rank_idx: number;
  level: number;
  tier: number;
  remaining: number;
  expires_at: string;
};

export type BoothDrawResult = {
  draw_id: string;
  place: number | null;
  prize_name: string | null;
  tier: number;
  rank_idx: number;
  remaining: number;
};
