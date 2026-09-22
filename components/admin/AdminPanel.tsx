"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Search, Trash2 } from "lucide-react";
import { PendingList } from "@/components/staff/PendingList";
import { RankBadge } from "@/components/RankBadge";
import { Button } from "@/components/ui/Button";
import { Card, Chip, TermLabel } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/cn";
import { PLACE_EMOJI, type AppConfig, type ForceOpen } from "@/lib/config";
import {
  fetchPrizes,
  fetchRejectedSessions,
  fetchUnclaimedDraws,
  fetchUsers,
  type UnclaimedDraw,
} from "@/lib/client-queries";
import { formatDateTime, timeAgo } from "@/lib/format";
import { GAMES } from "@/lib/games";
import { deleteUser, setForceOpen, setStock, setUserRole } from "@/lib/rpc";
import type { GameSessionRow, PrizeRow, Profile, UserRole } from "@/lib/types";

const TABS = [
  { key: "approve", label: "가입 승인" },
  { key: "users", label: "유저" },
  { key: "stock", label: "상품 재고" },
  { key: "config", label: "설정" },
  { key: "logs", label: "로그" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export function AdminPanel({ config, meId }: { config: AppConfig; meId: string }) {
  const [tab, setTab] = useState<TabKey>("approve");

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

      {tab === "approve" && <PendingList />}
      {tab === "users" && <UsersTab meId={meId} />}
      {tab === "stock" && <StockTab />}
      {tab === "config" && <ConfigTab config={config} />}
      {tab === "logs" && <LogsTab />}
    </div>
  );
}

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
          <p className="mt-2 text-xs text-dim">
            이 값들은 Supabase <span className="num">app_config</span> 테이블에서 바꿀 수 있어요.
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
