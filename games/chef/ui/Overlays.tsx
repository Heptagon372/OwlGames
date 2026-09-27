"use client";

// 🍳 화면 위에 뜨는 것들 — STAGE CLEAR · NEW 카드 · 알림 · 게임 오버 글리치 (GDD §26 · §31)

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { STAGE_MAX, type ToolId } from "../config";
import type { RecipeId } from "../data/recipes";
import { Badge, Decor, DishIcon, ToolIcon, UiIcon, type BadgeName, type UiName } from "./art";

export type Banner =
  | {
      id: number;
      kind: "stage";
      stage: number;
      recipes: RecipeId[];
      tools: ToolId[];
    }
  | { id: number; kind: "inf"; level: number }
  | {
      id: number;
      kind: "big";
      text: string;
      sub?: string;
      tone: "good" | "bad" | "warn";
      badge?: BadgeName;
    };

export function BannerView({ b }: { b: Banner }) {
  const t = useTranslations("hud.chef");
  if (b.kind === "stage") {
    const inf = b.stage > STAGE_MAX;
    return (
      <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center p-4">
        <div className="card-solid animate-pop w-full max-w-xs rounded-card p-5 text-center">
          <p className="font-mono text-[11px] tracking-[0.3em] text-aqua">{inf ? "∞" : t("stageClearSub", { n: b.stage - 1 })}</p>
          {inf ? (
            <div className="flex justify-center">
              <Badge
                name="infinite"
                h={64}
                className="mt-2"
                fallback={<p className="grad-text mt-1 font-mono text-3xl font-black tracking-wider">INFINITE RESTAURANT</p>}
              />
            </div>
          ) : (
            <p className="grad-text mt-1 font-mono text-3xl font-black tracking-wider">{t("stage", { n: b.stage, max: STAGE_MAX })}</p>
          )}
          {inf && <p className="mt-1 text-xs text-mute">{t("infSub")}</p>}
          {(b.recipes.length > 0 || b.tools.length > 0) && (
            <div className="mt-4 grid gap-1.5 text-left">
              {b.tools.map((tool) => (
                <p key={tool} className="glass relative flex items-center gap-2 rounded-tile px-3 py-2 text-sm">
                  <Badge name="new" h={22} className="absolute -left-2 -top-2" />
                  <ToolIcon tool={tool} size={36} />
                  <span className="font-bold">{t("newTool", { name: t(`tools.${tool}`) })}</span>
                </p>
              ))}
              {b.recipes.map((id) => (
                <p key={id} className="glass relative flex items-center gap-2 rounded-tile px-3 py-2 text-sm">
                  <Badge name="new" h={22} className="absolute -left-2 -top-2" />
                  <DishIcon id={id} size={36} />
                  <span className="font-bold">{t("newDish", { name: t(`recipes.${id}`) })}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }
  if (b.kind === "inf") {
    return (
      <div className="pointer-events-none absolute inset-x-0 top-[22%] z-30 text-center">
        <div className="flex justify-center">
          <Badge name="infinite" h={40} className="animate-pop mb-1" />
        </div>
        <p className="animate-pop font-mono text-3xl font-black tracking-widest text-magenta text-glow">{t("infLevel", { n: b.level })}</p>
        <p className="mt-1 text-xs font-bold text-mute">{t("infUp")}</p>
      </div>
    );
  }
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[30%] z-30 text-center">
      {b.badge && (
        <div className="mb-1 flex justify-center">
          <Badge name={b.badge} h={56} className="animate-pop" />
        </div>
      )}
      <p
        className={`animate-pop font-mono text-3xl font-black tracking-wider ${
          b.tone === "good" ? "grad-text" : b.tone === "bad" ? "text-alert" : "text-magenta"
        }`}
      >
        {b.text}
      </p>
      {b.sub && <p className="mt-1 text-sm font-bold text-mute">{b.sub}</p>}
    </div>
  );
}

/** 막힘·안내 한 줄 (아래쪽) */
export function Toast({ text, icon }: { text: string; icon?: UiName }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center px-4">
      <p className="card-solid animate-rise flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold text-ink">
        {icon && <UiIcon name={icon} size={18} />}
        {text}
      </p>
    </div>
  );
}

/** 게임 오버 — 화면이 가로 띠로 찢겨 어긋나고, 오류 문구가 타이핑된다 */
export function Glitch({ lines, closing }: { lines: string[]; closing: boolean }) {
  const t = useTranslations("hud.chef");
  const full = lines.join("\n");
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((k) => Math.min(full.length, k + 3)), 16);
    return () => clearInterval(id);
  }, [full]);

  if (closing) {
    return (
      <div className="pointer-events-none absolute inset-0 z-40 grid place-items-center bg-night/60 backdrop-blur-[2px]">
        <div className="text-center">
          <div className="flex justify-center">
            <Decor name="sign" h={90} className="animate-pop mb-2" />
          </div>
          <p className="animate-pop grad-text font-mono text-4xl font-black tracking-widest">CLOSING TIME</p>
          <p className="mt-2 text-sm font-bold text-mute">{t("closingSub")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-40 overflow-hidden">
      {Array.from({ length: 9 }, (_, k) => (
        <span
          key={k}
          className="absolute inset-x-0"
          style={{
            top: `${(k * 11 + (k % 3) * 4) % 100}%`,
            height: `${3 + ((k * 7) % 6)}%`,
            backdropFilter: `hue-rotate(${60 + k * 35}deg) saturate(2.5) ${k % 2 ? "invert(0.85)" : "contrast(1.8)"}`,
            WebkitBackdropFilter: `hue-rotate(${60 + k * 35}deg) saturate(2.5) ${k % 2 ? "invert(0.85)" : "contrast(1.8)"}`,
            background: k % 3 === 0 ? "rgba(255,59,92,0.18)" : k % 3 === 1 ? "rgba(34,211,238,0.14)" : "rgba(232,121,249,0.12)",
            animation: `chef-slice ${0.18 + (k % 4) * 0.07}s steps(3) infinite`,
          }}
        />
      ))}
      <div className="absolute inset-0 bg-night/45" />
      <div className="absolute inset-0 grid place-items-center p-4">
        <div className="w-full max-w-sm">
          <div className="flex items-center justify-center gap-2 animate-[chef-glitch_0.12s_steps(2)_infinite]">
            <UiIcon name="skull" size={48} />
            <Badge
              name="gameover"
              h={64}
              fallback={<p className="text-center font-mono text-4xl font-black tracking-widest text-alert">GAME OVER</p>}
            />
          </div>
          {/* "시간이 다 됐어요!" — 손님이 기다리다 지쳤다 */}
          <div className="flex justify-center">
            <Badge name="bubble-time" h={44} className="animate-pop mt-2" />
          </div>
          <pre className="mt-3 whitespace-pre-wrap rounded-tile border border-alert/50 bg-black/70 p-3 font-mono text-[11px] leading-relaxed text-[#ff9aac]">
            {full.slice(0, n)}
            <span className="animate-caret">▌</span>
          </pre>
        </div>
      </div>
    </div>
  );
}
