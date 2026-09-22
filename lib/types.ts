// DB 행 / RPC 응답 타입 (supabase/migrations 와 1:1)

export type UserRole = "user" | "staff" | "admin";
export type GameId = "typer" | "flight" | "phish";

export type Profile = {
  id: string;
  name: string;
  student_id: string;
  role: UserRole;
  verified: boolean;
  total_points: number;
  level: number;
  rank_idx: number;
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
