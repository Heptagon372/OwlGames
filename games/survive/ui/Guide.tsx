"use client";

// 🦉 아울 서바이버즈 v3 — 게임 가이드 (시작 화면의 [가이드])
// 스킬(액티브 35 · 패시브 28 · 진화 27) · 몬스터 10종 · 보스 4종의 패턴을 한 화면에 모은다.
// 이름·수치는 전부 데이터(`data/skills.ts` · `data/stages.ts` · `config.ts`)에서 읽는다 —
// 튜닝하면 가이드도 따라 바뀐다. 문장만 `messages/*.json` 의 `hud.survive.guide` 에 있다.

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { CFG } from "../config";
import { ACTIVE_IDS, ACTIVES, EVO_IDS, EVOLUTIONS, PASSIVE_IDS, PASSIVES, STARTER } from "../data/skills";
import { ENEMY_SPEC, MOB_SPEC, STAGES, type BossKind, type MobKind } from "../data/stages";
import { mobArtSrc, type MobArt } from "../engine/assets";
import type { Theme } from "../theme";
import type { ActiveId, PassiveId } from "../types";

type Tab = "skills" | "mobs" | "bosses";
const TABS: Tab[] = ["skills", "mobs", "bosses"];

type Params = Record<string, string | number>;

/** 부동소수 찌꺼기 없이 (0.04 × 100 → 4) */
const n = (v: number) => Math.round(v * 100) / 100;

/* ── 몬스터 — 단계 순서대로, 특수 행동 수치는 CFG.ai 에서 ─────── */

const MOBS: { kind: MobKind; stage: number }[] = STAGES.flatMap((s) => (s.mob ? [{ kind: s.mob, stage: s.id }] : []));

const MOB_PARAMS: Partial<Record<MobKind, Params>> = {
  penta: { windup: CFG.ai.charge.windup, cd: CFG.ai.charge.cd, dmg: CFG.ai.charge.dmg },
  hepta: { cd: CFG.ai.shoot4.cd, sec: CFG.ai.shoot4.slowSec, mult: CFG.ai.shoot4.slowMult },
  hendeca: { cd: CFG.ai.summon.cd, n: CFG.ai.summon.count },
  tetradeca: { pct: n(CFG.ai.regen.perSec * 100) },
};

const STAT_MAX = {
  hp: Math.max(...Object.values(MOB_SPEC).map((m) => m.hp)),
  speed: Math.max(...Object.values(MOB_SPEC).map((m) => m.speed)),
  dmg: Math.max(...Object.values(MOB_SPEC).map((m) => m.dmg)),
};

/* ── 보스 — 패턴 목록은 여기, 문장은 messages, 수치는 CFG ─────── */

const BOSSES: { kind: BossKind; stage: number }[] = STAGES.flatMap((s) => (s.boss ? [{ kind: s.boss, stage: s.id }] : []));

const BOSS_PATTERNS: Record<BossKind, string[]> = {
  hexa: ["laser", "bomb"],
  nona: ["eat", "armor", "buff", "shot"],
  trideca: ["arena", "dash", "laser", "doom", "near", "hole", "slow"],
  chrono: ["time", "rewind", "homing", "rain", "bombs", "clones", "rage", "clock", "stop", "reverse", "judgement"],
};

const pct = (v: number) => n(v * 100);

/** 패턴 문장에 들어갈 수치 — 한 보스의 모든 패턴이 같은 묶음을 받는다 (안 쓰는 값은 무시된다) */
const BOSS_PARAMS: Record<BossKind, Params> = {
  hexa: { warn: CFG.hexa.laserWarn, bombs: CFG.hexa.bombCount, bombWarn: CFG.hexa.bombWarn },
  nona: {
    cap: CFG.nona.maxHpCap,
    bullets: CFG.nona.blastBullets,
    armor: pct(CFG.nona.armorAt),
    move: CFG.nona.weakMoveSec,
    buffCd: CFG.nona.buffCd,
    buffHp: CFG.nona.buffHp,
    buffDmg: CFG.nona.buffDmg,
    shotCd: CFG.nona.shotCd,
    spread: CFG.nona.shotSpread,
  },
  trideca: {
    dashCd: CFG.trideca.dashCd,
    dashWarn: CFG.trideca.dashWarn,
    laserCd: CFG.trideca.laserCd,
    tile: CFG.trideca.tileLife,
    doom: pct(CFG.trideca.doomAt),
    doomWarn: CFG.trideca.doomWarn,
    doomCount: CFG.trideca.doomCount,
    nearR: CFG.trideca.nearR,
    nearMin: CFG.trideca.nearMin,
    holeWarn: CFG.trideca.holeWarn,
    holeLife: CFG.trideca.holeLife,
    holeEvery: CFG.trideca.holePullEvery,
  },
  chrono: {
    limit: CFG.chrono.limitSec / 60,
    step: CFG.chrono.limitStepSec / 60,
    rewind: pct(CFG.chrono.rewindAt),
    back: CFG.chrono.rewindBackSec,
    homingCd: CFG.chrono.homingCd,
    homingN: CFG.chrono.homingCount,
    homingLife: CFG.chrono.homingLife,
    bombEvery: CFG.chrono.bombEvery,
    bombN: CFG.chrono.bombCount,
    fuse: CFG.chrono.bombFuse,
    cloneN: CFG.chrono.cloneCount,
    cloneLife: CFG.chrono.cloneLife,
    clock: pct(CFG.chrono.clockAt),
    clockOn: CFG.chrono.clockOn,
    clockOff: CFG.chrono.clockOff,
    stopCd: CFG.chrono.stopCd,
    stopSec: CFG.chrono.stopSec,
    reverse: CFG.chrono.reverseAt.map(pct).join("·"),
    judge: CFG.chrono.timeoutSec,
  },
};

/* ── 도형 아이콘 — 캔버스 렌더(`render.ts` 의 shape)와 같은 꼭짓점 배치 ── */

function Shape({
  sides, color, dot, theme, size = 40, art,
}: { sides: number; color: string; dot?: boolean; theme: Theme; size?: number; art?: MobArt }) {
  // 게임과 같은 네온 도형 그림 (라이트 테마는 어두운 배지 위에 얹는다)
  if (art) {
    return (
      <span
        aria-hidden
        className="grid shrink-0 place-items-center rounded-full"
        style={{ width: size, height: size, background: theme.glow ? "transparent" : "rgba(16,24,50,0.92)" }}
      >
        <Image src={mobArtSrc(art)} alt="" width={size} height={size} className="h-full w-full object-contain" draggable={false} />
      </span>
    );
  }
  const c = size / 2;
  const r = size * 0.4;
  const points = Array.from({ length: sides }, (_, i) => {
    const a = (Math.PI * 2 * i) / sides - Math.PI / 2;
    return `${n(c + Math.cos(a) * r)},${n(c + Math.sin(a) * r)}`;
  }).join(" ");
  const stroke = theme.glow ? undefined : "rgba(20,27,51,0.55)";
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden
      className="shrink-0"
      style={{ filter: theme.glow ? `drop-shadow(0 0 6px ${color})` : undefined }}
    >
      {sides === 0 ? (
        <circle cx={c} cy={c} r={r} fill={color} stroke={stroke} strokeWidth={1.5} />
      ) : (
        <polygon points={points} fill={color} stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" />
      )}
      {dot && <circle cx={c} cy={c} r={r * 0.3} fill={theme.bg} fillOpacity={0.8} />}
    </svg>
  );
}

/* ── 본체 ───────────────────────────────────────────────────── */

export function Guide({ theme, onClose }: { theme: Theme; onClose: () => void }) {
  const t = useTranslations("hud.survive");
  const g = useTranslations("hud.survive.guide");
  const [tab, setTab] = useState<Tab>("skills");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [tab]);

  const th = theme;
  const gold = th.glow ? "#FACC15" : "#A16207";
  const panel = { background: th.surface, border: `1px solid ${th.dim}33` };

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto" style={{ background: th.bg }}>
      {/* 머리 + 탭 — 스크롤해도 붙어 있다 */}
      <div className="sticky top-0 z-10 px-4 pb-3 pt-3" style={{ background: `${th.bg}f2`, backdropFilter: "blur(6px)" }}>
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            aria-label={g("close")}
            className="grid size-11 shrink-0 place-items-center rounded-tile"
            style={{ color: th.text, border: `1px solid ${th.dim}44` }}
          >
            <ArrowLeft className="size-5" />
          </button>
          <div className="min-w-0">
            <p className="arcade text-[10px]" style={{ color: th.accent }}>
              OWL SURVIVORS
            </p>
            <h2 className="truncate text-lg font-black" style={{ color: th.text }}>
              {g("title")}
            </h2>
          </div>
        </div>
        <div role="tablist" className="mx-auto mt-3 grid max-w-3xl grid-cols-3 gap-1.5">
          {TABS.map((id) => {
            const on = id === tab;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setTab(id)}
                className="min-h-11 rounded-tile text-sm font-bold"
                style={{
                  background: on ? th.accent : th.surface,
                  color: on ? th.bg : th.text,
                  border: `1px solid ${on ? th.accent : `${th.dim}44`}`,
                  boxShadow: on && th.glow ? `0 0 16px ${th.accent}66` : "none",
                }}
              >
                {g(`tabs.${id}`)}
              </button>
            );
          })}
        </div>
      </div>

      <div role="tabpanel" className="mx-auto max-w-3xl px-4 pb-8">
        {tab === "skills" && <SkillsTab theme={th} gold={gold} panel={panel} />}

        {tab === "mobs" && (
          <>
            <p className="mb-3 text-xs leading-relaxed" style={{ color: th.dim }}>
              {g("mobsIntro", {
                sec: CFG.stage.normalSec,
                hp: pct(CFG.stage.hpPerStage),
                atk: pct(CFG.stage.atkPerStage),
              })}
            </p>
            <StageStrip theme={th} />
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {MOBS.map(({ kind, stage }) => {
                const s = MOB_SPEC[kind];
                return (
                  <div key={kind} className="rounded-tile p-3" style={panel}>
                    <div className="flex items-center gap-3">
                      <Shape sides={s.sides} color={th.mobs[kind]} dot={s.special} theme={th} art={kind} size={48} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-extrabold" style={{ color: th.text }}>
                          {t(`mob.${kind}`)}
                        </p>
                        <p className="num mt-0.5 flex flex-wrap gap-1 text-[10px] font-bold">
                          <Chip color={th.dim}>{g("stageAt", { stage })}</Chip>
                          {s.special && <Chip color={th.accent}>{g("special")}</Chip>}
                          {s.max < 999 && <Chip color={th.dim}>{g("maxAlive", { n: s.max })}</Chip>}
                        </p>
                      </div>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed" style={{ color: th.text }}>
                      {g(`mob.${kind}`, MOB_PARAMS[kind] ?? {})}
                    </p>
                    <div className="mt-2 grid gap-1">
                      <Stat label={g("hp")} value={s.hp} max={STAT_MAX.hp} color={th.hp} theme={th} />
                      <Stat label={g("speed")} value={s.speed} max={STAT_MAX.speed} color={th.accent} theme={th} />
                      <Stat label={g("dmg")} value={s.dmg} max={STAT_MAX.dmg} color={th.danger} theme={th} />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {tab === "bosses" && (
          <>
            <p className="mb-3 text-xs leading-relaxed" style={{ color: th.dim }}>
              {g("bossesIntro")}
            </p>
            <div className="grid gap-3">
              {BOSSES.map(({ kind, stage }) => (
                <div key={kind} className="rounded-card p-4" style={{ ...panel, borderColor: `${th.boss}66` }}>
                  <div className="flex items-center gap-3">
                    <Shape sides={ENEMY_SPEC[kind].sides} color={th.boss} theme={th} size={64} art={kind} />
                    <div className="min-w-0 flex-1">
                      <p className="num flex flex-wrap gap-1 text-[10px] font-bold">
                        <Chip color={th.boss}>
                          {kind === "chrono"
                            ? g("chronoStage", { stage, every: CFG.stage.chronoEvery, hp: pct(CFG.chrono.loopHp) })
                            : g("bossStage", { stage })}
                        </Chip>
                        <Chip color={th.dim}>{g("bossHp", { hp: CFG[kind].hp })}</Chip>
                      </p>
                      <p className="mt-1 text-base font-black" style={{ color: th.text }}>
                        👑 {t(`boss.${kind}`)} — {t(`bossTitle.${kind}`)}
                      </p>
                      <p className="text-xs" style={{ color: th.dim }}>
                        {t(`bossRuleText.${kind}`)}
                      </p>
                    </div>
                  </div>
                  <ol className="mt-3 grid gap-1.5">
                    {BOSS_PATTERNS[kind].map((p, i) => (
                      <li key={p} className="flex gap-2 rounded-lg px-2.5 py-2 text-xs leading-relaxed" style={{ background: `${th.dim}14` }}>
                        <span className="num shrink-0 font-black" style={{ color: th.boss }}>
                          {i + 1}
                        </span>
                        <span style={{ color: th.text }}>
                          <b className="font-extrabold">{g(`pattern.${kind}.${p}.name`)}</b>
                          <span style={{ color: th.dim }}> — </span>
                          {g(`pattern.${kind}.${p}.text`, BOSS_PARAMS[kind])}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── 스킬 탭 ────────────────────────────────────────────────── */

function SkillsTab({ theme: th, gold, panel }: { theme: Theme; gold: string; panel: React.CSSProperties }) {
  const g = useTranslations("hud.survive.guide");
  const skillName = (id: ActiveId | PassiveId) => {
    const s = id.startsWith("A") ? ACTIVES[id as ActiveId] : PASSIVES[id as PassiveId];
    return `${s.emoji} ${s.name}`;
  };

  return (
    <>
      <div className="rounded-tile p-3 text-xs leading-relaxed" style={panel}>
        <p className="mb-1 font-extrabold" style={{ color: th.text }}>
          {g("rules.title")}
        </p>
        <ul className="grid gap-0.5" style={{ color: th.dim }}>
          <li>• {g("rules.slots", { active: CFG.slots.active, passive: CFG.slots.passive })}</li>
          <li>• {g("rules.level", { choices: CFG.card.choices, max: CFG.evolution.maxSkillLv })}</li>
          <li>• {g("rules.evo", { active: CFG.evolution.activeMaxLv, passive: CFG.evolution.passiveReqLv })}</li>
          <li>• {g("rules.reroll", { reroll: CFG.card.reroll, skip: CFG.card.skip, xp: pct(CFG.card.skipXpRatio) })}</li>
        </ul>
        <p className="mb-1 mt-3 font-extrabold" style={{ color: th.text }}>
          {g("synergy.title")}
        </p>
        <ul className="grid gap-0.5" style={{ color: th.dim }}>
          {(["slowElectric", "burnExplosion", "pullAoe", "markPierce"] as const).map((k) => (
            <li key={k}>• {g(`synergy.${k}`)}</li>
          ))}
        </ul>
      </div>

      <Section title={g("active", { n: ACTIVE_IDS.length })} sub={g("activeSub")} theme={th} />
      <div className="grid gap-2 sm:grid-cols-2">
        {ACTIVE_IDS.map((id) => {
          const s = ACTIVES[id];
          const evo = s.evo ? EVOLUTIONS[s.evo] : null;
          return (
            <div key={id} className="flex gap-3 rounded-tile p-3" style={panel}>
              <span className="text-2xl leading-none">{s.emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-extrabold" style={{ color: th.text }}>
                    {s.name}
                  </span>
                  <Chip color={th.dim}>
                    {s.arch === "onkill"
                      ? g("onKill", { n: s.count })
                      : s.cd > 0 && s.arch !== "aura" // 오라의 cd 는 틱 간격이라 "상시"로 보여 준다
                        ? g("cd", { sec: s.cd })
                        : g("always")}
                  </Chip>
                  {id === STARTER && <Chip color={th.accent}>{g("starter")}</Chip>}
                </p>
                <p className="mt-0.5 text-xs" style={{ color: th.dim }}>
                  {s.desc}
                </p>
                {evo && s.evoReq && (
                  <p className="mt-1 text-[11px] font-bold" style={{ color: gold }}>
                    {g("evoHint", { evo: `${evo.emoji} ${evo.name}`, req: skillName(s.evoReq) })}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Section title={g("passive", { n: PASSIVE_IDS.length })} sub={g("passiveSub")} theme={th} />
      <div className="grid gap-2 sm:grid-cols-2">
        {PASSIVE_IDS.map((id) => {
          const s = PASSIVES[id];
          const feeds = EVO_IDS.filter((e) => EVOLUTIONS[e].req === id || EVOLUTIONS[e].base === id);
          return (
            <div key={id} className="flex items-center gap-3 rounded-tile px-3 py-2.5" style={panel}>
              <span className="text-2xl leading-none">{s.emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-extrabold" style={{ color: th.text }}>
                  {s.name}
                </p>
                <p className="text-xs" style={{ color: th.dim }}>
                  {s.desc}
                </p>
              </div>
              {feeds.length > 0 && (
                <span
                  className="shrink-0 text-base"
                  title={feeds.map((e) => EVOLUTIONS[e].name).join(", ")}
                  aria-label={g("feeds", { list: feeds.map((e) => EVOLUTIONS[e].name).join(", ") })}
                >
                  <span className="text-[10px] font-black" style={{ color: gold }}>
                    ⭐
                  </span>
                  {feeds.map((e) => EVOLUTIONS[e].emoji).join("")}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <Section title={g("evolution", { n: EVO_IDS.length })} sub={g("evolutionSub")} theme={th} />
      <div className="grid gap-2 sm:grid-cols-2">
        {EVO_IDS.map((id) => {
          const s = EVOLUTIONS[id];
          return (
            <div
              key={id}
              className="flex gap-3 rounded-tile p-3"
              style={{ ...panel, border: `1.5px solid ${gold}88`, boxShadow: th.glow ? "0 0 14px rgba(250,204,21,0.15)" : "none" }}
            >
              <span className="text-2xl leading-none">{s.emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-extrabold" style={{ color: th.text }}>
                  {s.name}
                </p>
                <p className="mt-0.5 text-[11px] font-bold" style={{ color: gold }}>
                  {g("recipe", { base: skillName(s.base), req: skillName(s.req), lv: CFG.evolution.passiveReqLv })}
                </p>
                <p className="mt-0.5 text-xs" style={{ color: th.dim }}>
                  {s.desc}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ── 조각들 ─────────────────────────────────────────────────── */

function Section({ title, sub, theme }: { title: string; sub: string; theme: Theme }) {
  return (
    <div className="mb-2 mt-6">
      <h3 className="text-base font-black" style={{ color: theme.text }}>
        {title}
      </h3>
      <p className="text-[11px]" style={{ color: theme.dim }}>
        {sub}
      </p>
    </div>
  );
}

function Chip({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="num rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ color, background: `${color}1f` }}>
      {children}
    </span>
  );
}

function Stat({ label, value, max, color, theme }: { label: string; value: number; max: number; color: string; theme: Theme }) {
  return (
    <div className="flex items-center gap-2 text-[10px]">
      <span className="w-8 shrink-0 font-bold" style={{ color: theme.dim }}>
        {label}
      </span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: `${theme.dim}22` }}>
        <span className="block h-full rounded-full" style={{ width: `${Math.max(4, (value / max) * 100)}%`, background: color }} />
      </span>
      <span className="num w-7 shrink-0 text-right font-bold" style={{ color: theme.text }}>
        {value}
      </span>
    </div>
  );
}

/** 1 → 15 단계 흐름 — 어느 단계에서 무엇이 새로 나오는지 */
function StageStrip({ theme: th }: { theme: Theme }) {
  const g = useTranslations("hud.survive.guide");
  return (
    <div className="rounded-tile p-3" style={{ background: th.surface, border: `1px solid ${th.dim}33` }}>
      <p className="mb-2 text-xs font-extrabold" style={{ color: th.text }}>
        {g("flow")}
      </p>
      <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-8">
        {STAGES.map((s) => {
          const kind = s.boss ?? s.mob;
          const spec = kind ? ENEMY_SPEC[kind] : null;
          const color = s.boss ? th.boss : s.mob ? th.mobs[s.mob] : th.enemy;
          return (
            <div
              key={s.id}
              className="flex flex-col items-center gap-0.5 rounded-lg py-1.5"
              style={{ background: s.boss ? `${th.boss}1f` : `${th.dim}12` }}
            >
              <span className="num text-[10px] font-black" style={{ color: s.boss ? th.boss : th.dim }}>
                {s.id}
              </span>
              {spec ? (
                <Shape sides={spec.sides} color={color} dot={!s.boss && spec.special} theme={th} size={26} art={kind ?? undefined} />
              ) : (
                <span className="grid h-[22px] place-items-center text-[9px] font-black" style={{ color: th.danger }}>
                  ALL
                </span>
              )}
            </div>
          );
        })}
        <div className="flex flex-col items-center gap-0.5 rounded-lg py-1.5" style={{ background: `${th.dim}12` }}>
          <span className="num text-[10px] font-black" style={{ color: th.dim }}>
            16~
          </span>
          <span className="grid h-[22px] place-items-center text-sm" style={{ color: th.accent }}>
            ♾️
          </span>
        </div>
      </div>
      <p className="mt-2 text-[10px]" style={{ color: th.dim }}>
        {g("flowNote", { every: CFG.stage.chronoEvery, allOut: CFG.stage.allOutSec })}
      </p>
    </div>
  );
}
