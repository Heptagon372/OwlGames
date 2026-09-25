"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, Save, Search, ShieldCheck, Trash2 } from "lucide-react";
import { PendingList } from "@/components/staff/PendingList";
import { RankBadge } from "@/components/RankBadge";
import { Button } from "@/components/ui/Button";
import { Card, Chip, TermLabel } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/cn";
import { PLACE_EMOJI, type AppConfig, type ForceOpen } from "@/lib/config";
import {
  fetchAuditLog,
  fetchPrizes,
  fetchRejectedSessions,
  fetchUnclaimedDraws,
  fetchUsers,
  type UnclaimedDraw,
} from "@/lib/client-queries";
import { formatDateTime, timeAgo } from "@/lib/format";
import { GAMES } from "@/lib/games";
import {
  deleteUser,
  fetchAdminStats,
  setConfigValue,
  setForceOpen,
  setStock,
  setUserEnergy,
  setUserRole,
} from "@/lib/rpc";
import { formatNumber } from "@/lib/format";
import type { AdminStats, AuditRow, GameId, GameSessionRow, PrizeRow, Profile, UserRole } from "@/lib/types";

const TABS = [
  { key: "dash", label: "대시보드" },
  { key: "approve", label: "가입 승인" },
  { key: "users", label: "유저" },
  { key: "stock", label: "상품 재고" },
  { key: "config", label: "설정" },
  { key: "logs", label: "로그" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export function AdminPanel({ config, meId }: { config: AppConfig; meId: string }) {
  const [tab, setTab] = useState<TabKey>("dash");

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-16">
      <div className="no-scrollbar -mx-4 mb-5 flex gap-2 overflow-x-auto px-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "min-h-11 shrink-0 rounded-full border px-4 text-sm font-bold transition-colors",
              tab === t.key ? "border-neon bg-neon/15 text-neon" : "border-line text-mute hover:text-ink",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "dash" && <DashTab />}
      {tab === "approve" && <PendingList />}
      {tab === "users" && <UsersTab meId={meId} />}
      {tab === "stock" && <StockTab />}
      {tab === "config" && <ConfigTab config={config} />}
      {tab === "logs" && <LogsTab />}
    </div>
  );
}

/* ─── 대시보드 (§운영) ─────────────────────────────────────────────
   행사 중에 한 화면에서 봐야 하는 것만 모은다. 30초마다 스스로 갱신한다. */

function DashTab() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setStats(await fetchAdminStats());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "집계를 불러오지 못했어요");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  if (error) return <p className="py-10 text-center text-sm text-alert">{error}</p>;
  if (!stats) return <p className="py-10 text-center text-sm text-dim">집계 중...</p>;

  const rejectRate =
    stats.today.plays + stats.today.rejected > 0
      ? (stats.today.rejected / (stats.today.plays + stats.today.rejected)) * 100
      : 0;

  return (
    <div className="grid gap-6">
      <div>
        <div className="flex items-end justify-between">
          <TermLabel>stats --today</TermLabel>
          <button
            type="button"
            onClick={load}
            className="flex items-center gap-1 text-xs text-mute hover:text-ink"
          >
            <RefreshCw className={cn("size-3", busy && "animate-spin")} /> 30초마다 갱신
          </button>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="오늘 플레이" value={formatNumber(stats.today.plays)} tone="neon" />
          <Stat label="발행 포인트" value={`${formatNumber(stats.today.points)}P`} />
          <Stat label="진행 중" value={`${stats.today.active}판`} />
          <Stat label="승인 대기" value={`${stats.users.pending}명`} tone={stats.users.pending > 0 ? "alert" : undefined} />
          <Stat label="오늘 가입" value={`${stats.users.today}명`} />
          <Stat label="오늘 뽑기" value={`${stats.draws_today}회`} />
        </div>
      </div>

      <div>
        <TermLabel>stats --games</TermLabel>
        <Card className="mt-2 p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-dim">
                <th className="px-4 py-2 text-left font-bold">게임</th>
                <th className="px-2 py-2 text-right font-bold">플레이</th>
                <th className="px-2 py-2 text-right font-bold">평균 P</th>
                <th className="px-2 py-2 text-right font-bold">최고 원점수</th>
                <th className="px-4 py-2 text-right font-bold">거부</th>
              </tr>
            </thead>
            <tbody>
              {stats.games.map((g) => (
                <tr key={g.game} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-2.5">
                    {GAMES[g.game as GameId]?.emoji} {GAMES[g.game as GameId]?.title ?? g.game}
                  </td>
                  <td className="num px-2 py-2.5 text-right">{formatNumber(g.plays)}</td>
                  <td className="num px-2 py-2.5 text-right text-neon">{g.avg_pts}</td>
                  <td className="num px-2 py-2.5 text-right">{formatNumber(g.best_raw)}</td>
                  <td className={cn("num px-4 py-2.5 text-right", g.rejected > 0 && "text-alert")}>{g.rejected}</td>
                </tr>
              ))}
              {stats.games.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-dim">
                    아직 플레이 기록이 없어요
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
        <p className="mt-2 text-xs text-dim">
          오늘 거부율 <span className="num text-alert">{rejectRate.toFixed(1)}%</span> · 점수 보정{" "}
          <span className="num">{stats.today.adjusted}</span>건 — 거부·보정이 갑자기 늘면 클라이언트 배포가
          꼬였는지부터 확인하세요.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <TermLabel>tickets</TermLabel>
          <Card className="mt-2 grid gap-2 text-sm">
            <Row label="미사용 티켓" value={`${formatNumber(stats.tickets.unused)}장`} />
            <Row label="코드 예약" value={`${formatNumber(stats.tickets.reserved)}장`} />
            <Row label="사용 완료" value={`${formatNumber(stats.tickets.used)}장`} />
          </Card>
        </div>
        <div>
          <TermLabel>owl-energy</TermLabel>
          <Card className="mt-2 grid gap-2 text-sm">
            <Row label="오늘 지급" value={`${stats.energy_today}회`} />
            <Row label="게임 중 획득" value={`${stats.energy_drops_today}회`} />
            <Row label="평균 보유" value={`${stats.users.energy_avg}개`} />
          </Card>
        </div>
      </div>

      <div>
        <TermLabel>prizes</TermLabel>
        <Card className="mt-2 divide-y divide-line p-0">
          {stats.prizes.map((p) => (
            <div key={p.place} className="flex items-center gap-3 px-4 py-2.5">
              <span className="text-xl">{PLACE_EMOJI[p.place - 1]}</span>
              <span className="min-w-0 flex-1 font-bold">{p.name}</span>
              <span className="num text-sm text-mute">{p.drawn}회 당첨</span>
              <span className={cn("num w-16 text-right font-bold", p.stock === 0 ? "text-alert" : "text-neon")}>
                {p.stock}개
              </span>
            </div>
          ))}
        </Card>
      </div>

      <div>
        <TermLabel>users</TermLabel>
        <Card className="mt-2 grid gap-2 text-sm">
          <Row label="전체" value={`${formatNumber(stats.users.total)}명`} />
          <Row label="인증 완료" value={`${formatNumber(stats.users.verified)}명`} />
          <Row label="부원 / 관리자" value={`${stats.users.staff}명 / ${stats.users.admin}명`} />
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "neon" | "alert" }) {
  return (
    <Card className="px-4 py-3">
      <p className="text-xs text-mute">{label}</p>
      <p
        className={cn(
          "num mt-1 text-xl font-black",
          tone === "neon" ? "text-neon" : tone === "alert" ? "text-alert" : "text-ink",
        )}
      >
        {value}
      </p>
    </Card>
  );
}

/* ─── 설정 편집 공통 ─────────────────────────────────────────────── */

function useSaver() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = useCallback(async (key: string, value: unknown) => {
    setBusy(true);
    setMsg(null);
    try {
      await setConfigValue(key, value);
      setMsg({ ok: true, text: "저장했어요" });
    } catch (e) {
      // 값 검증은 서버가 한다 — 서버가 준 이유를 그대로 보여준다
      setMsg({ ok: false, text: e instanceof Error ? e.message : "저장에 실패했어요" });
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, msg, save };
}

function SaveButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <Button size="sm" onClick={onClick} disabled={busy}>
      <Save className="size-4" />
      {busy ? "저장중" : "저장"}
    </Button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span className="shrink-0 text-mute">{label}</span>
      {children}
    </label>
  );
}

const INPUT = "num min-h-11 w-28 rounded-xl border border-line bg-night px-3 text-right outline-none focus:border-aqua/60";

function UsersTab({ meId }: { meId: string }) {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<Profile[]>([]);
  const [target, setTarget] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (q: string) => {
    setUsers(await fetchUsers(q));
  }, []);

  useEffect(() => {
    load("");
  }, [load]);

  async function changeRole(user: Profile, role: UserRole) {
    try {
      await setUserRole(user.id, role);
      setUsers((list) => list.map((u) => (u.id === user.id ? { ...u, role } : u)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "역할 변경에 실패했어요");
    }
  }

  async function remove(user: Profile) {
    try {
      await deleteUser(user.id);
      setUsers((list) => list.filter((u) => u.id !== user.id));
      setTarget(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "삭제에 실패했어요");
    }
  }

  return (
    <div>
      <form
        className="mb-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          load(query);
        }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이름 또는 학번"
          className="min-h-12 flex-1 rounded-2xl border border-line bg-night px-4 text-[15px] outline-none focus:border-aqua/60"
        />
        <Button type="submit" variant="outline">
          <Search className="size-4" /> 검색
        </Button>
      </form>
      {error && <p className="mb-3 text-sm text-alert">{error}</p>}

      <Card className="divide-y divide-line p-0">
        {users.map((u) => (
          <div key={u.id} className="flex items-center gap-3 px-4 py-3">
            <RankBadge rankIdx={u.rank_idx} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">
                {u.name}
                {!u.verified && <Chip tone="alert" className="ml-2">미인증</Chip>}
              </p>
              <p className="num text-xs text-mute">
                {u.student_id} · Lv {u.level} · {u.total_points}P
              </p>
            </div>
            <label className="flex items-center gap-1 text-xs text-mute" title="아울 에너지">
              🦉
              <input
                type="number"
                min={0}
                max={20}
                defaultValue={u.owl_energy ?? 0}
                onBlur={(e) => {
                  const v = Math.max(0, Math.min(20, Number(e.target.value)));
                  setUserEnergy(u.id, v).catch((err) =>
                    setError(err instanceof Error ? err.message : "에너지 조정에 실패했어요"),
                  );
                }}
                aria-label={`${u.name} 아울 에너지`}
                className="num min-h-11 w-14 rounded-xl border border-line bg-night px-2 text-right outline-none focus:border-aqua/60"
              />
            </label>
            <select
              value={u.role}
              onChange={(e) => changeRole(u, e.target.value as UserRole)}
              disabled={u.id === meId}
              aria-label={`${u.name} 역할`}
              className="min-h-11 rounded-xl border border-line bg-night px-2 text-sm"
            >
              <option value="user">user</option>
              <option value="staff">staff</option>
              <option value="admin">admin</option>
            </select>
            <Button variant="danger" size="sm" onClick={() => setTarget(u)} disabled={u.id === meId}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        {users.length === 0 && <p className="px-4 py-10 text-center text-sm text-dim">결과가 없어요</p>}
      </Card>

      <Modal open={target !== null} onClose={() => setTarget(null)} title="계정을 삭제할까요?">
        <p className="text-sm leading-relaxed text-mute">
          <span className="font-bold text-ink">
            {target?.name} ({target?.student_id})
          </span>
          {" "}계정과 모든 기록(포인트·티켓·뽑기 내역)이 함께 삭제돼요. 되돌릴 수 없어요.
        </p>
        <p className="mt-3 rounded-tile border border-alert/40 bg-alert/10 px-3 py-2 text-xs text-alert">
          학번 중복 해결 등 꼭 필요한 경우에만 사용하세요.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button variant="ghost" onClick={() => setTarget(null)}>
            취소
          </Button>
          <Button variant="danger" onClick={() => target && remove(target)}>
            삭제
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function StockTab() {
  const [prizes, setPrizes] = useState<PrizeRow[]>([]);
  const [saving, setSaving] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPrizes().then(setPrizes);
  }, []);

  async function save(place: number, stock: number) {
    setSaving(place);
    try {
      await setStock(place, stock);
      setPrizes((list) => list.map((p) => (p.place === place ? { ...p, stock } : p)));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장에 실패했어요");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div>
      <TermLabel>prizes --stock</TermLabel>
      {error && <p className="mt-2 text-sm text-alert">{error}</p>}
      <Card className="mt-2 divide-y divide-line p-0">
        {prizes.map((p) => (
          <div key={p.place} className="flex items-center gap-3 px-4 py-3">
            <span className="text-2xl">{PLACE_EMOJI[p.place - 1]}</span>
            <div className="min-w-0 flex-1">
              <p className="font-bold">
                <span className="num mr-2 text-neon">{p.place}등</span>
                {p.name}
              </p>
            </div>
            <input
              type="number"
              min={0}
              defaultValue={p.stock}
              onBlur={(e) => {
                const v = Math.max(0, Number(e.target.value));
                if (v !== p.stock) save(p.place, v);
              }}
              aria-label={`${p.name} 재고`}
              className="num min-h-11 w-24 rounded-xl border border-line bg-night px-3 text-right outline-none focus:border-aqua/60"
            />
            {saving === p.place && <span className="text-xs text-mute">저장중</span>}
          </div>
        ))}
      </Card>
      <p className="mt-3 text-xs text-dim">
        재고가 0이면 해당 등수는 추첨에서 제외되고, 그 확률은 꽝으로 처리돼요 (상위 등수로 재분배하지 않아요).
      </p>
    </div>
  );
}

function ConfigTab({ config }: { config: AppConfig }) {
  const [mode, setMode] = useState<ForceOpen>(config.force_open);
  const [error, setError] = useState<string | null>(null);

  async function change(next: ForceOpen) {
    const prev = mode;
    setMode(next);
    try {
      await setForceOpen(next);
    } catch (e) {
      setMode(prev);
      setError(e instanceof Error ? e.message : "설정 변경에 실패했어요");
    }
  }

  return (
    <div className="grid gap-5">
      <div>
        <TermLabel>config --force-open</TermLabel>
        <Card className="mt-2">
          <p className="mb-3 text-sm text-mute">
            운영시간 강제 제어 — <span className="num">auto</span>는 {config.open_hours.start}~{config.open_hours.end}{" "}
            사이에만 열려요.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {(["auto", "open", "closed"] as ForceOpen[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => change(m)}
                className={cn(
                  "min-h-12 rounded-2xl border text-sm font-bold transition-colors",
                  mode === m ? "border-neon bg-neon/15 text-neon" : "border-line text-mute hover:text-ink",
                )}
              >
                {m === "auto" ? "자동" : m === "open" ? "강제 오픈" : "강제 종료"}
              </button>
            ))}
          </div>
          {error && <p className="mt-3 text-sm text-alert">{error}</p>}
        </Card>
      </div>

      <div>
        <TermLabel>config --edit</TermLabel>
        <h3 className="mb-2 mt-1 font-extrabold">운영 값 바꾸기</h3>
        <div className="grid gap-3">
          <HoursCard config={config} />
          <EnergyCard config={config} />
          <KCard config={config} />
          <MasterCard config={config} />
        </div>
        <p className="mt-3 text-xs text-dim">
          값 검사는 서버(<span className="num">admin_set_config</span>)가 하고, 바뀐 내역은 로그 탭의 운영 기록에
          남아요. 바꾼 값은 다음 요청부터 바로 적용돼요.
        </p>
      </div>
      <div>
        <TermLabel>config --show</TermLabel>
        <Card className="mt-2 grid gap-2 text-sm">
          <Row label="운영시간" value={`${config.open_hours.start} ~ ${config.open_hours.end} (${config.open_hours.tz})`} />
          <Row label="레벨 곡선" value={`필요 포인트 = ${config.level_curve.base} + ${config.level_curve.step} × Lv`} />
          <Row
            label="게임 K값"
            value={Object.entries(config.game_k)
              .map(([k, v]) => `${GAMES[k as keyof typeof GAMES].title} ${v}`)
              .join(" · ")}
          />
          <Row label="코드 유효시간" value={`${config.redeem_code_ttl_min}분`} />
          <Row label="학번 형식" value={config.student_id_pattern} />
          <Row
            label="부스 위치"
            value={`${config.booth_location.building} ${config.booth_location.floor} · ${config.booth_location.spot}`}
          />
          <Row
            label="마스터 관리자"
            value={
              config.master_admin.student_ids.join(", ") +
              (config.master_admin.bootstrap_only ? " (첫 관리자 전용)" : " (항상)")
            }
          />
          <p className="mt-2 text-xs text-dim">
            위에서 못 바꾸는 값(레벨 곡선·뽑기 확률·학번 형식)은 Supabase{" "}
            <span className="num">app_config</span> 테이블에서 직접 바꿔요.
          </p>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line/60 py-2 last:border-0">
      <span className="shrink-0 text-mute">{label}</span>
      <span className="num text-right break-all">{value}</span>
    </div>
  );
}

function Msg({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return <p className={cn("mt-2 text-xs", msg.ok ? "text-ok" : "text-alert")}>{msg.text}</p>;
}

function HoursCard({ config }: { config: AppConfig }) {
  const { busy, msg, save } = useSaver();
  const [start, setStart] = useState(config.open_hours.start);
  const [end, setEnd] = useState(config.open_hours.end);

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <p className="font-bold">운영시간</p>
        <SaveButton busy={busy} onClick={() => save("open_hours", { ...config.open_hours, start, end })} />
      </div>
      <div className="grid gap-2">
        <Field label="시작">
          <input value={start} onChange={(e) => setStart(e.target.value)} placeholder="09:00" className={INPUT} />
        </Field>
        <Field label="종료">
          <input value={end} onChange={(e) => setEnd(e.target.value)} placeholder="18:00" className={INPUT} />
        </Field>
      </div>
      <p className="mt-2 text-xs text-dim">HH:MM · {config.open_hours.tz} 기준</p>
      <Msg msg={msg} />
    </Card>
  );
}

function EnergyCard({ config }: { config: AppConfig }) {
  const { busy, msg, save } = useSaver();
  const [regen, setRegen] = useState(config.owl_energy.regen_min);
  const [cap, setCap] = useState(config.owl_energy.cap);
  const [hard, setHard] = useState(config.owl_energy.hard_cap);
  const [cost, setCost] = useState(config.owl_energy.cost);

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <p className="font-bold">🦉 아울 에너지</p>
        <SaveButton
          busy={busy}
          onClick={() => save("owl_energy", { regen_min: regen, cap, hard_cap: hard, cost })}
        />
      </div>
      <div className="grid gap-2">
        <Field label="충전 간격(분)">
          <input type="number" min={1} max={240} value={regen} onChange={(e) => setRegen(Number(e.target.value))} className={INPUT} />
        </Field>
        <Field label="자동 충전 상한">
          <input type="number" min={1} max={50} value={cap} onChange={(e) => setCap(Number(e.target.value))} className={INPUT} />
        </Field>
        <Field label="보관 상한(부스 지급)">
          <input type="number" min={1} max={99} value={hard} onChange={(e) => setHard(Number(e.target.value))} className={INPUT} />
        </Field>
        <Field label="게임 1판 비용">
          <input type="number" min={0} max={10} value={cost} onChange={(e) => setCost(Number(e.target.value))} className={INPUT} />
        </Field>
      </div>
      <p className="mt-2 text-xs text-dim">
        대기열이 길면 충전 간격을 줄이고, 너무 붐비면 늘리세요. 드롭 조건은 그대로 유지돼요.
      </p>
      <Msg msg={msg} />
    </Card>
  );
}

function KCard({ config }: { config: AppConfig }) {
  const { busy, msg, save } = useSaver();
  const [k, setK] = useState<Record<string, number>>({ ...config.game_k });

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <p className="font-bold">게임 K값</p>
        <SaveButton busy={busy} onClick={() => save("game_k", k)} />
      </div>
      <div className="grid gap-2">
        {Object.values(GAMES).map((g) => (
          <Field key={g.id} label={`${g.emoji} ${g.title}`}>
            <input
              type="number"
              min={1}
              max={1000}
              value={k[g.id] ?? 0}
              onChange={(e) => setK((prev) => ({ ...prev, [g.id]: Number(e.target.value) }))}
              className={INPUT}
            />
          </Field>
        ))}
      </div>
      <p className="mt-2 text-xs text-dim">
        포인트 = 30 + min(270, 원점수 ÷ K). K가 작을수록 후하게 줘요 — 한 판 상한은 300P로 고정입니다.
      </p>
      <Msg msg={msg} />
    </Card>
  );
}

function MasterCard({ config }: { config: AppConfig }) {
  const { busy, msg, save } = useSaver();
  const [ids, setIds] = useState(config.master_admin.student_ids.join(", "));
  const [only, setOnly] = useState(config.master_admin.bootstrap_only);

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-2 font-bold">
          <ShieldCheck className="size-4 text-neon" /> 마스터 관리자
        </p>
        <SaveButton
          busy={busy}
          onClick={() =>
            save("master_admin", {
              student_ids: ids
                .split(",")
                .map((v) => v.trim())
                .filter(Boolean),
              bootstrap_only: only,
            })
          }
        />
      </div>
      <input
        value={ids}
        onChange={(e) => setIds(e.target.value)}
        placeholder="202612345, 202698765"
        aria-label="마스터 관리자 학번"
        className="num min-h-11 w-full rounded-xl border border-line bg-night px-3 outline-none focus:border-aqua/60"
      />
      <label className="mt-3 flex items-center gap-2 text-sm text-mute">
        <input
          type="checkbox"
          checked={only}
          onChange={(e) => setOnly(e.target.checked)}
          className="size-4 accent-[#FFB020]"
        />
        관리자가 한 명도 없을 때만 승격 (권장)
      </label>
      <p className="mt-2 text-xs text-dim">
        이 학번으로 가입하면 SQL 편집기 없이 바로 관리자가 돼요. 공개 레포라 기본값은 그대로 두지 말고
        행사 전에 본인 학번으로 바꾸세요.
      </p>
      <Msg msg={msg} />
    </Card>
  );
}

/* ─── 운영 기록 (감사 로그) ─────────────────────────────────────── */

const AUDIT_LABEL: Record<string, string> = {
  "user.role": "역할 변경",
  "user.verify": "가입 승인",
  "user.unverify": "인증 해제",
  "user.energy": "에너지 변경",
  "user.delete": "계정 삭제",
  "config.set": "설정 변경",
  "prize.stock": "재고 변경",
};

function auditDetail(row: AuditRow): string {
  const d = row.detail ?? {};
  if (row.action === "user.role" || row.action === "user.energy") return `${d.from} → ${d.to}`;
  if (row.action === "prize.stock") return `${d.place}등 ${d.from} → ${d.to}개`;
  if (row.action === "config.set") return String(d.key ?? "");
  if (row.action === "user.delete") return `누적 ${d.total_points ?? 0}P`;
  if (row.action === "user.verify") return String(d.student_id ?? "");
  return "";
}

function AuditList() {
  const [rows, setRows] = useState<AuditRow[]>([]);

  useEffect(() => {
    fetchAuditLog(50).then(setRows).catch(() => setRows([]));
  }, []);

  return (
    <Card className="divide-y divide-line p-0">
      {rows.map((r) => (
        <div key={r.id} className="flex items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm">
              <span className="font-bold">{r.actor_name ?? "시스템"}</span>
              <span className="text-mute"> → </span>
              <span className="font-bold">{r.target_name ?? "-"}</span>
              <Chip tone="neon" className="ml-2">
                {AUDIT_LABEL[r.action] ?? r.action}
              </Chip>
            </p>
            <p className="num text-[11px] text-dim">
              {timeAgo(r.created_at)} · {auditDetail(r)}
            </p>
          </div>
        </div>
      ))}
      {rows.length === 0 && <p className="px-4 py-8 text-center text-sm text-dim">기록이 없어요</p>}
    </Card>
  );
}

function LogsTab() {
  const [unclaimed, setUnclaimed] = useState<UnclaimedDraw[]>([]);
  const [rejected, setRejected] = useState<GameSessionRow[]>([]);

  useEffect(() => {
    fetchUnclaimedDraws().then(setUnclaimed);
    fetchRejectedSessions().then(setRejected);
  }, []);

  return (
    <div className="grid gap-6">
      <div>
        <TermLabel>draws --unclaimed</TermLabel>
        <h3 className="mb-2 mt-1 font-extrabold">미수령 당첨</h3>
        <Card className="divide-y divide-line p-0">
          {unclaimed.map((d) => (
            <div key={d.id} className="flex items-center gap-3 px-4 py-3">
              <span className="text-xl">{d.place ? PLACE_EMOJI[d.place - 1] : "🫥"}</span>
              <div className="min-w-0 flex-1">
                <p className="font-bold">
                  {d.profiles?.name ?? "-"} <span className="num text-xs text-mute">{d.profiles?.student_id ?? ""}</span>
                </p>
                <p className="num text-[11px] text-dim">{formatDateTime(d.drawn_at)}</p>
              </div>
              <Chip tone="alert">{d.place}등 미수령</Chip>
            </div>
          ))}
          {unclaimed.length === 0 && <p className="px-4 py-8 text-center text-sm text-dim">미수령 당첨이 없어요</p>}
        </Card>
      </div>

      <div>
        <TermLabel>audit --recent 50</TermLabel>
        <h3 className="mb-2 mt-1 flex items-center gap-2 font-extrabold">
          <ShieldCheck className="size-4 text-neon" /> 운영 기록
        </h3>
        <AuditList />
        <p className="mt-2 text-xs text-dim">
          부원·관리자가 남의 계정·설정·재고를 바꾼 기록이에요. 본인이 게임해서 바뀐 포인트·에너지는 남지 않아요.
        </p>
      </div>

      <div>
        <TermLabel>sessions --rejected</TermLabel>
        <h3 className="mb-2 mt-1 flex items-center gap-2 font-extrabold">
          <AlertTriangle className="size-4 text-alert" /> 비정상 제출
        </h3>
        <Card className="divide-y divide-line p-0">
          {rejected.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-3">
              <span className="text-xl">{GAMES[s.game].emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="num text-sm">
                  원점수 {s.raw_score ?? 0} ·{" "}
                  {typeof s.meta?.reject_reason === "string" ? s.meta.reject_reason : "사유 미기록"}
                </p>
                <p className="num text-[11px] text-dim">
                  {timeAgo(s.started_at)} · user {s.user_id.slice(0, 8)}
                </p>
              </div>
            </div>
          ))}
          {rejected.length === 0 && <p className="px-4 py-8 text-center text-sm text-dim">기록이 없어요</p>}
        </Card>
      </div>
    </div>
  );
}
