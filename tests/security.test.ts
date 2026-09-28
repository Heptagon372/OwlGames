import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { simulate as flightSim } from "@/games/flight/engine/bot";
import { CFG as CHEF } from "@/games/chef/config";
import { createGame as chefGame, update as chefUpdate } from "@/games/chef/engine/game";
import { BOTS, createBot, stepBot } from "@/games/chef/engine/bot";
import { rawScore as chefRaw } from "@/games/chef/engine/score";
import { createGame as owlisGame, hooksOf, update as owlisUpdate } from "@/games/owlis/engine/game";
import { newBrain, updateBrain } from "@/games/owlis/engine/ai";
import { rawScore as owlisRaw } from "@/games/owlis/engine/score";
import { LIMITS, blockedFor, hit, reset, resetAll } from "@/lib/rate-limit";
import { isValidName, isValidStudentId, passwordProblem, safeSearchTerm } from "@/lib/validate";
import { PLAY_BOUND, playSecBound } from "@/lib/anticheat";
import { buildMeta as chefMeta } from "@/games/chef/engine/score";
import { buildMeta as owlisMeta } from "@/games/owlis/engine/score";
import { bossesBefore } from "@/games/survive/config";

// DECISIONS §5-27 — 보안 강화

const DIR = join(__dirname, "..", "supabase", "migrations");
const FILES = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
const SECURITY_SQL = readFileSync(join(DIR, "20261008000000_security.sql"), "utf8");
const SECURITY2_SQL = readFileSync(join(DIR, "20261009000000_security_v2.sql"), "utf8");

describe("입력 검사 (로그인·가입)", () => {
  it("이름은 한글·영문만", () => {
    for (const ok of ["홍길동", "Kim Minsu", "남궁 민", "Jean-Luc", "O.K", "마리·안"]) expect(isValidName(ok), ok).toBe(true);
    for (const bad of [
      "",
      "홍",
      "'; drop table profiles; --",
      "<script>alert(1)</script>",
      "admin\u0000",
      "홍길동1",
      " 홍길동",
      "a".repeat(21),
      "😀😀",
      "Robert'); --",
    ])
      expect(isValidName(bad), bad).toBe(false);
  });

  it("학번은 설정 형식 + 영문·숫자만", () => {
    const pat = "^[0-9]{9}$";
    expect(isValidStudentId("202612345", pat)).toBe(true);
    for (const bad of ["20261234", "2026123456", "' or 1=1 --", "202612345@x.com", "202612345%", "abc", "20261 2345"])
      expect(isValidStudentId(bad, pat), bad).toBe(false);
    // 설정 정규식이 느슨해도(앵커 없음) 안전 문자 검사가 남는다
    expect(isValidStudentId("1234' or '1'='1", "[0-9]+")).toBe(false);
    // 설정 정규식이 깨져 있어도 던지지 않는다
    expect(isValidStudentId("202612345", "([")).toBe(true);
  });

  it("비밀번호 8자 이상 · 72바이트 이하 · 학번과 다르게", () => {
    expect(passwordProblem("short", "202612345")).toBe("short");
    expect(passwordProblem("202612345", "202612345")).toBe("same");
    expect(passwordProblem("가".repeat(25), "202612345")).toBe("long"); // 한글 1자 = 3바이트
    expect(passwordProblem("correct horse", "202612345")).toBeNull();
  });

  it("검색어는 필터 문자를 전부 버린다 (PostgREST 필터 인젝션)", () => {
    expect(safeSearchTerm("홍길동")).toBe("홍길동");
    expect(safeSearchTerm("a%,role.eq.admin")).toBe("aroleeqadmin");
    expect(safeSearchTerm('x),id.neq.(0"')).toBe("xidneq0");
    expect(safeSearchTerm("1".repeat(50))).toHaveLength(20);
  });
});

describe("시도 제한", () => {
  beforeEach(() => resetAll());

  it("학번당 로그인 실패가 한도에 닿으면 막히고, 창이 지나면 풀린다", () => {
    const { limit, windowMs } = LIMITS.loginFail;
    const t0 = 1_000_000;
    for (let i = 0; i < limit; i++) {
      expect(blockedFor("k", limit, windowMs, t0 + i)).toBe(0);
      hit("k", windowMs, t0 + i);
    }
    expect(blockedFor("k", limit, windowMs, t0 + limit)).toBeGreaterThan(0);
    expect(blockedFor("k", limit, windowMs, t0 + windowMs + limit)).toBe(0);
  });

  it("성공하면 초기화", () => {
    for (let i = 0; i < 5; i++) hit("k", 60_000);
    reset("k");
    expect(blockedFor("k", 5, 60_000)).toBe(0);
  });
});

describe("보안 래퍼 (20261008_security)", () => {
  /** 이 함수를 마지막으로 정의한 마이그레이션의 본문 */
  const lastDef = (fn: string) => {
    const re = new RegExp(`create or replace function public\\.${fn}\\(([\\s\\S]*?)\\$\\$;`, "g");
    let body: string | null = null;
    let file = "";
    for (const f of FILES) {
      const sql = readFileSync(join(DIR, f), "utf8");
      for (const m of sql.matchAll(re)) {
        body = m[1];
        file = f;
      }
    }
    return { body: body ?? "", file };
  };

  it("submit_game_session / start_game_session 의 마지막 정의는 _core 를 부르는 래퍼다", () => {
    // 게임 본문을 고치려면 *_core 를 create or replace 할 것 — 래퍼를 통째로 덮으면 보안 검사가 사라진다
    const submit = lastDef("submit_game_session");
    expect(submit.body, submit.file).toContain("public.submit_game_session_core(");
    expect(submit.body).toContain("security_reject");
    expect(submit.body).toContain("security_play_sec");
    expect(submit.body).toContain("security_review_check");
    const start = lastDef("start_game_session");
    expect(start.body, start.file).toContain("public.start_game_session_core(");
    expect(start.body).toContain("locked_until");
  });

  it("본문(_core)은 클라이언트가 직접 부를 수 없다", () => {
    expect(SECURITY_SQL).toMatch(
      /revoke execute on function public\.submit_game_session_core\(uuid, int, jsonb\) from public, anon, authenticated/,
    );
    expect(SECURITY_SQL).toMatch(
      /revoke execute on function public\.start_game_session_core\(public\.game_id\) from public, anon, authenticated/,
    );
    for (const f of FILES.filter((f) => f > "20261008000000")) {
      expect(readFileSync(join(DIR, f), "utf8"), f).not.toMatch(/grant execute on function public\.\w+_core/);
    }
  });

  it("마이그레이션에 문자열을 이어 붙이는 동적 SQL 이 없다 (SQL 인젝션)", () => {
    for (const f of FILES) {
      const sql = readFileSync(join(DIR, f), "utf8").replace(/--.*$/gm, "");
      // EXECUTE 는 카탈로그 식별자(regprocedure)를 format(%s) 로 넣는 권한 정리에만 쓴다
      for (const m of sql.matchAll(/\bexecute\s+(?!function|procedure|on\b)([^;]+);/gi)) {
        expect(m[1], `${f}: ${m[1]}`).toMatch(/^format\('revoke execute on function %s from public, anon', r\.sig\)$/);
      }
      expect(sql, f).not.toMatch(/execute\s+'[^']*'\s*\|\|/i);
    }
  });

  it("민감 설정은 관리자만 읽는다", () => {
    expect(SECURITY_SQL).toMatch(/key <> all \(array\['master_admin', 'game_guards', 'security'\]\)/);
    expect(SECURITY_SQL).toMatch(/revoke insert, update on table public\.app_config from authenticated/);
  });
});

describe("원점수 상한은 정상 플레이를 막지 않는다", () => {
  const cfg = JSON.parse(SECURITY_SQL.match(/values \('security', '([\s\S]*?)'::jsonb\)/)![1]);
  const cap = (game: string, sec: number) => cfg.raw_flat[game] + (cfg.max_raw_per_min[game] * sec) / 60;

  it("아울러닝 봇 30판", () => {
    for (let i = 0; i < 30; i++) {
      const r = flightSim(500 + i);
      expect(r.raw, `seed ${500 + i}`).toBeLessThan(cap("flight", r.durationSec) / 2);
    }
  });

  it("아울 레스토랑 빠른 봇", () => {
    for (let i = 0; i < 3; i++) {
      const g = chefGame(700 + i);
      const b = createBot(BOTS.fast, 700 + i);
      while (!g.over && g.t < CHEF.run.sessionCap) {
        stepBot(g, b, CHEF.dt);
        chefUpdate(g, CHEF.dt);
      }
      expect(chefRaw(g)).toBeLessThan(cap("chef", g.t) / 2);
    }
  }, 120_000);

  it("아울리스 강한 봇", () => {
    const g = owlisGame(41);
    const bot = newBrain(41 ^ 77);
    while (!g.over && g.t < 600) {
      updateBrain(bot, g.player, g.ai, 6, 1 / 60, hooksOf(g));
      owlisUpdate(g, 1 / 60);
      g.fx.length = 0;
    }
    expect(owlisRaw(g)).toBeLessThan(cap("owlis", g.t) / 2);
  }, 120_000);
});

describe("시간 포인트 = 진행으로 증명되는 시간 (20261009_security_v2)", () => {
  it("SQL 기본값과 TS 사본이 같다", () => {
    const m = SECURITY2_SQL.match(/'play', jsonb_build_object\(([\s\S]*?)\),\s*'review'/)![1];
    const pick = (k: string) => Number(m.match(new RegExp(`'${k}', ([\\d.]+)`))![1]);
    expect(pick("slack_sec")).toBe(PLAY_BOUND.slackSec);
    expect(pick("flight_min_mps")).toBe(PLAY_BOUND.flightMinMps);
    expect(pick("chef_sec_per_plate")).toBe(PLAY_BOUND.chefSecPerPlate);
    expect(pick("owlis_sec_per_piece")).toBe(PLAY_BOUND.owlisSecPerPiece);
    expect(pick("survive_sec_per_stage")).toBe(PLAY_BOUND.surviveSecPerStage);
    expect(pick("survive_sec_per_boss")).toBe(PLAY_BOUND.surviveSecPerBoss);
  });

  // 정상 판: 서버 경과 = 게임 시간 + 메뉴·READY 몇 초. 인정 시간이 게임 시간보다 짧으면 안 된다
  it("아울러닝 봇 판은 잘리지 않는다", () => {
    for (let i = 0; i < 30; i++) {
      const m = flightSim(900 + i).stats as unknown as Record<string, number>;
      expect(playSecBound("flight", m, m.duration_s + 5)).toBeGreaterThanOrEqual(m.duration_s);
    }
  });

  it("아울 레스토랑 봇 판은 잘리지 않는다 (느린 봇 포함)", () => {
    for (const skill of [BOTS.slow, BOTS.mid, BOTS.fast]) {
      const g = chefGame(321);
      const b = createBot(skill, 321);
      while (!g.over && g.t < CHEF.run.sessionCap) {
        stepBot(g, b, CHEF.dt);
        chefUpdate(g, CHEF.dt);
      }
      const m = chefMeta(g, "desktop") as unknown as Record<string, number>;
      expect(playSecBound("chef", m, m.duration_s + 5)).toBeGreaterThanOrEqual(m.duration_s);
    }
  }, 120_000);

  it("아울리스 판은 잘리지 않는다 (아무것도 안 하는 판 포함 — 블록은 중력으로 굳는다)", () => {
    for (const skill of [0, 2, 5]) {
      const g = owlisGame(60 + skill);
      const bot = newBrain(skill + 3);
      while (!g.over && g.t < 900) {
        if (skill > 0) updateBrain(bot, g.player, g.ai, skill, 1 / 60, hooksOf(g));
        owlisUpdate(g, 1 / 60);
        g.fx.length = 0;
      }
      const m = owlisMeta(g, "desktop") as unknown as Record<string, number>;
      expect(playSecBound("owlis", m, m.duration_s + 5), `skill ${skill}`).toBeGreaterThanOrEqual(m.duration_s);
    }
  }, 120_000);

  it("서바이버즈: 보스 없는 단계 30초 · 보스 하나에 5분이 걸려도 잘리지 않는다", () => {
    let t = 0;
    for (let stage = 1; stage <= 40; stage++) {
      const boss = bossesBefore(stage + 1) > bossesBefore(stage);
      t += boss ? 300 : 30;
      expect(playSecBound("survive", { stage, duration_s: t }, t + 5), `stage ${stage}`).toBeGreaterThanOrEqual(t);
    }
  });

  it("방치·최소 메타는 시간 포인트를 거의 못 받는다", () => {
    expect(playSecBound("survive", { stage: 1 }, 2400)).toBeLessThanOrEqual(60);
    expect(playSecBound("owlis", { pieces: 0 }, 1800)).toBeLessThanOrEqual(45);
    expect(playSecBound("chef", { served_total: 0 }, 1200)).toBeLessThanOrEqual(60);
    expect(playSecBound("flight", { distance_m: 0 }, 185)).toBeLessThanOrEqual(30);
    // 일시정지: 게임 시간(duration_s)이 짧으면 벽시계가 길어도 게임 시간만
    expect(playSecBound("owlis", { pieces: 500, duration_s: 100 }, 1800)).toBe(103);
  });
});

describe("뽑기 (20261009_security_v2)", () => {
  const fn = (name: string) =>
    SECURITY2_SQL.match(new RegExp(`function public\\.${name}\\(([\\s\\S]*?)\\$\\$;`))![1];

  it("티어는 티켓을 얻은 랭크 기준 — 뽑는 시점 랭크가 아니다", () => {
    const draw = fn("booth_draw");
    expect(draw).toMatch(/v_tier := public\.tier_from_rank\(v_earned\)/);
    expect(draw).not.toMatch(/tier_from_rank\(v_p\.rank_idx\)/);
  });

  it("검토 보류·잠금·본인 코드는 뽑을 수 없다", () => {
    const draw = fn("booth_draw");
    expect(draw).toContain("v_p.review_required");
    expect(draw).toContain("v_p.locked_until");
    expect(draw).toContain("v_c.user_id = v_staff");
  });

  it("부원은 자기 에너지를 못 올리고, 남의 코드를 못 읽는다", () => {
    expect(fn("booth_grant_energy")).toContain("v_p.id = v_staff");
    expect(SECURITY2_SQL).toMatch(/create policy redeem_codes_select on public\.redeem_codes\s+for select to authenticated\s+using \(user_id = \(select auth\.uid\(\)\)\);/);
  });

  it("새 함수는 전부 실행 권한을 명시적으로 정리한다", () => {
    for (const m of SECURITY2_SQL.matchAll(/create or replace function public\.(\w+)\(/g)) {
      expect(SECURITY2_SQL, m[1]).toMatch(new RegExp(`revoke execute on function public\\.${m[1]}\\(`));
    }
  });
});

describe("관리자 티켓 지급 (20261015_admin_tickets)", () => {
  const SQL = readFileSync(join(DIR, "20261015000000_admin_tickets.sql"), "utf8");
  const body = SQL.match(/function public\.admin_grant_tickets\(([\s\S]*?)\$\$;/)![1];

  it("랭크 티켓은 여전히 랭크당 1장 — 제약 이름은 그대로, 랭크 티켓은 grant_seq 0", () => {
    expect(SQL).toMatch(/grant_seq\s+bigint not null default 0/);
    expect(SQL).toMatch(/add constraint tickets_one_per_rank unique \(user_id, earned_rank_idx, grant_seq\)/);
    expect(body).toContain("nextval('public.tickets_grant_seq')");
  });

  it("관리자만, 본인 제외, 장수·사유를 검사하고 로그를 남긴다", () => {
    expect(body).toContain("public.is_admin()");
    expect(body).toContain("p_user_id = v_admin");
    expect(body).toMatch(/p_count > 10/);
    expect(body).toContain("audit_write('ticket.grant'");
    expect(SQL).toMatch(/revoke execute on function public\.admin_grant_tickets\(uuid, int, int, text\) from public, anon, authenticated;/);
  });
});
