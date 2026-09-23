"use client";

// 클라이언트 → Supabase RPC 래퍼 (§10.3). 포인트·티켓·추첨은 전부 서버가 계산한다.
// 데모 모드에서는 화면 확인용으로 흉내만 낸다 (DB 쓰기 없음).

import { DEFAULT_CONFIG } from "./config";
import { DEMO_PROFILE, demoAddEnergy, demoDraw, demoEnergyStatus, demoLookup, demoSpendEnergy } from "./demo";
import { estimatePoints } from "./games";
import { levelFromPoints, rankFromLevel } from "./rank";
import { getBrowserSupabase } from "./supabase/client";
import type {
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
  if (!supabase) throw new RpcError("데모 모드에서는 사용할 수 없어요");
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new RpcError(error.message || "요청에 실패했어요");
  return data as T;
}

const demo = () => getBrowserSupabase() === null;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- 게임 ----

let demoTotal = DEMO_PROFILE.total_points;

export async function startGameSession(game: GameId): Promise<string> {
  if (demo()) {
    // 데모에서도 아울 에너지를 쓰게 해서 실제 흐름을 그대로 확인할 수 있게 한다
    if (!demoSpendEnergy()) throw new RpcError("아울 에너지가 부족해요. 10분마다 1개씩 충전돼요");
    return `demo-${game}-${Date.now()}`;
  }
  return call<string>("start_game_session", { p_game: game });
}

// ── 아울 에너지 ──────────────────────────────────────────

export async function owlEnergyStatus(): Promise<OwlEnergy> {
  if (demo()) return demoEnergyStatus();
  return call<OwlEnergy>("owl_energy_status");
}

/** 부스 미션 보상 지급 (staff) */
export async function boothGrantEnergy(
  studentId: string,
  amount: number,
  reason: string,
): Promise<EnergyGrantResult> {
  if (demo()) {
    await wait(300);
    const granted = demoAddEnergy(amount);
    if (granted === 0) throw new RpcError("이미 에너지가 가득 찼어요");
    return {
      user_id: DEMO_PROFILE.id,
      name: "홍길동",
      student_id: studentId,
      energy: demoEnergyStatus().energy,
      granted,
    };
  }
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
  if (demo()) {
    await wait(400);
    const points = estimatePoints(rawScore, DEFAULT_CONFIG.game_k[game]);
    const levelBefore = levelFromPoints(demoTotal);
    demoTotal += points;
    const levelAfter = levelFromPoints(demoTotal);
    const rankBefore = rankFromLevel(levelBefore);
    const rankAfter = rankFromLevel(levelAfter);
    // 아울러닝에서 에너지를 주웠다면 데모에서도 1개 지급
    const energyGained = meta.owl_energy_found ? demoAddEnergy(1) : 0;
    return {
      status: "ok",
      raw_score: rawScore,
      points,
      total_points: demoTotal,
      level_before: levelBefore,
      level_after: levelAfter,
      rank_before: rankBefore,
      rank_after: rankAfter,
      tickets_gained: rankAfter - rankBefore,
      owl_energy_gained: energyGained,
      owl_energy: demoEnergyStatus().energy,
    };
  }
  return call<SubmitResult>("submit_game_session", {
    p_session_id: sessionId,
    p_raw_score: Math.max(0, Math.floor(rawScore)),
    p_meta: meta,
  });
}

// ---- 티켓 ----

/** 만료된 코드·세션 정리 (지연 처리). 티켓 화면 진입 시 한 번 호출한다 */
export async function expireStale(): Promise<void> {
  if (demo()) return;
  try {
    await call<null>("expire_stale");
  } catch {
    // 정리는 실패해도 화면을 막지 않는다
  }
}

export async function issueRedeemCode(count: number): Promise<IssuedCode> {
  if (demo()) {
    await wait(300);
    const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
    const code = Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
    return { code, ticket_count: count, expires_at: new Date(Date.now() + 10 * 60_000).toISOString() };
  }
  return call<IssuedCode>("issue_redeem_code", { p_count: count });
}

// ---- 부스 (staff) ----

export async function boothLookupCode(code: string): Promise<BoothLookup> {
  if (demo()) {
    await wait(300);
    return demoLookup(code);
  }
  return call<BoothLookup>("booth_lookup_code", { p_code: code });
}

export async function boothDraw(code: string, tier: number): Promise<BoothDrawResult> {
  if (demo()) {
    await wait(300);
    return demoDraw(tier);
  }
  return call<BoothDrawResult>("booth_draw", { p_code: code });
}

export async function boothMarkClaimed(drawId: string): Promise<void> {
  if (demo()) return;
  await call<null>("booth_mark_claimed", { p_draw_id: drawId });
}

// ---- 관리 ----

export async function verifyUser(userId: string): Promise<void> {
  if (demo()) return;
  await call<null>("admin_verify_user", { p_user_id: userId });
}

export async function deleteUser(userId: string): Promise<void> {
  if (demo()) return;
  await call<null>("admin_delete_user", { p_user_id: userId });
}

export async function setUserRole(userId: string, role: UserRole): Promise<void> {
  if (demo()) return;
  await call<null>("admin_set_role", { p_user_id: userId, p_role: role });
}

export async function setForceOpen(mode: "auto" | "open" | "closed"): Promise<void> {
  if (demo()) return;
  await call<null>("admin_set_force_open", { p_mode: mode });
}

export async function setUserEnergy(userId: string, value: number): Promise<void> {
  if (demo()) return;
  await call<null>("admin_set_energy", { p_user_id: userId, p_value: value });
}

export async function setStock(place: number, stock: number): Promise<void> {
  if (demo()) return;
  await call<null>("admin_set_stock", { p_place: place, p_stock: stock });
}
