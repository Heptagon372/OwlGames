"use client";

// 클라이언트 → Supabase RPC 래퍼 (§10.3). 포인트·티켓·추첨은 전부 서버가 계산한다.

import { getBrowserSupabase } from "./supabase/client";
import type {
  AdminStats,
  BoothDrawResult,
  BoothLookup,
  EnergyGrantResult,
  GameId,
  IssuedCode,
  OwlEnergy,
  SubmitResult,
  UserRole,
} from "./types";

export class RpcError extends Error {}

async function call<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const supabase = getBrowserSupabase();
  if (!supabase) throw new RpcError("서버에 연결되지 않았어요 (Supabase 미설정)");
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new RpcError(error.message || "요청에 실패했어요");
  return data as T;
}

// ---- 게임 ----

export async function startGameSession(game: GameId): Promise<string> {
  return call<string>("start_game_session", { p_game: game });
}

// ── 아울 에너지 ──────────────────────────────────────────

export async function owlEnergyStatus(): Promise<OwlEnergy> {
  return call<OwlEnergy>("owl_energy_status");
}

/** 부스 미션 보상 지급 (staff) */
export async function boothGrantEnergy(
  studentId: string,
  amount: number,
  reason: string,
): Promise<EnergyGrantResult> {
  return call<EnergyGrantResult>("booth_grant_energy", {
    p_student_id: studentId,
    p_amount: amount,
    p_reason: reason,
  });
}

export async function submitGameSession(
  sessionId: string,
  game: GameId,
  rawScore: number,
  meta: Record<string, unknown>,
): Promise<SubmitResult> {
  return call<SubmitResult>("submit_game_session", {
    p_session_id: sessionId,
    p_raw_score: Math.max(0, Math.floor(rawScore)),
    p_meta: meta,
  });
}

// ---- 티켓 ----

/** 만료된 코드·세션 정리 (지연 처리). 티켓 화면 진입 시 한 번 호출한다 */
export async function expireStale(): Promise<void> {
  try {
    await call<null>("expire_stale");
  } catch {
    // 정리는 실패해도 화면을 막지 않는다
  }
}

export async function issueRedeemCode(count: number): Promise<IssuedCode> {
  return call<IssuedCode>("issue_redeem_code", { p_count: count });
}

// ---- 부스 (staff) ----

export async function boothLookupCode(code: string): Promise<BoothLookup> {
  return call<BoothLookup>("booth_lookup_code", { p_code: code });
}

export async function boothDraw(code: string): Promise<BoothDrawResult> {
  return call<BoothDrawResult>("booth_draw", { p_code: code });
}

export async function boothMarkClaimed(drawId: string): Promise<void> {
  await call<null>("booth_mark_claimed", { p_draw_id: drawId });
}

// ---- 관리 ----

export async function verifyUser(userId: string): Promise<void> {
  await call<null>("admin_verify_user", { p_user_id: userId });
}

/** 가입 자동 승인 켜기/끄기 (admin) — 켤 때 대기 중인 사람도 승인하고 그 수를 돌려준다 */
export async function setAutoApprove(on: boolean): Promise<number> {
  return Number((await call<number>("admin_set_auto_approve", { p_on: on })) ?? 0);
}

/** 로비 카운트다운 (admin) — endsAt 은 ISO 시각 */
export async function setCountdown(enabled: boolean, endsAt: string): Promise<void> {
  await call<null>("admin_set_countdown", { p_enabled: enabled, p_ends_at: endsAt });
}

export async function deleteUser(userId: string): Promise<void> {
  await call<null>("admin_delete_user", { p_user_id: userId });
}

export async function setUserRole(userId: string, role: UserRole): Promise<void> {
  await call<null>("admin_set_role", { p_user_id: userId, p_role: role });
}

export async function setForceOpen(mode: "auto" | "open" | "closed"): Promise<void> {
  await call<null>("admin_set_force_open", { p_mode: mode });
}

export async function setUserEnergy(userId: string, value: number): Promise<void> {
  await call<null>("admin_set_energy", { p_user_id: userId, p_value: value });
}

/** 플레이 잠금 (admin). minutes 0 = 해제 */
export async function setUserLock(userId: string, minutes: number, reason?: string): Promise<void> {
  await call<{ status: string }>("admin_set_lock", {
    p_user_id: userId,
    p_minutes: Math.max(0, Math.floor(minutes)),
    p_reason: reason ?? null,
  });
}

/** 뽑기 티켓 지급 (admin). tier 1~6 — 서버가 그 티어의 가장 낮은 랭크로 적는다. 받은 사람의 남은 티켓 수를 돌려준다 */
export async function grantTickets(userId: string, count: number, tier: number, reason: string): Promise<number> {
  const res = await call<{ unused: number }>("admin_grant_tickets", {
    p_user_id: userId,
    p_count: Math.floor(count),
    p_tier: Math.floor(tier),
    p_reason: reason,
  });
  return Number(res?.unused ?? 0);
}

/** 포인트 급상승 검토 완료 → 다시 뽑을 수 있다 (admin) */
export async function clearReview(userId: string): Promise<void> {
  await call<null>("admin_clear_review", { p_user_id: userId });
}

export async function setStock(place: number, stock: number): Promise<void> {
  await call<null>("admin_set_stock", { p_place: place, p_stock: stock });
}

/**
 * 운영 설정 변경 (§운영). 서버가 키 화이트리스트와 값의 모양을 검사한다 —
 * 여기서 막는 게 아니라, 서버가 막은 이유를 그대로 보여주는 게 목적이다.
 */
export async function setConfigValue(key: string, value: unknown): Promise<void> {
  await call<{ status: string }>("admin_set_config", { p_key: key, p_value: value });
}

export async function fetchAdminStats(): Promise<AdminStats> {
  return call<AdminStats>("admin_stats");
}
