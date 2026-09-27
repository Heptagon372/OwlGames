/**
 * 게임 안 문구의 국제화 (§13).
 *
 * 엔진은 **완성된 문장을 만들지 않는다.** 대신 메시지 키와 값만 담아 두고,
 * 화면에 그릴 때 HUD가 번역한다 — 엔진은 React 밖에서(봇 테스트 포함) 돌기 때문에
 * `useTranslations`를 쓸 수 없다.
 *
 * 이름이 번역돼야 하면 값에 `ref("boss.hexa")`(= "@boss.hexa")를 넣는다 — HUD 가 먼저 번역해 끼운다.
 * 스킬 이름은 아직 데이터(`data/skills.ts`)에 한국어로 박혀 있어서 값(`p`)으로 그대로 넘어간다.
 */

export type MsgParams = Record<string, string | number>;

/** 엔진이 담고 HUD가 푸는 메시지 */
export type Msg = { k: string; p?: MsgParams };

export function msg(k: string, p?: MsgParams): Msg {
  return p ? { k, p } : { k };
}

/**
 * 번역할 게 없는 문자열(이미 영문인 라벨, 데이터에서 온 이름)을 그대로 통과시킨다.
 * 각 게임 네임스페이스에 `"raw": "{text}"` 키가 있어야 한다.
 */
export function rawMsg(text: string): Msg {
  return { k: "raw", p: { text } };
}

/** next-intl 의 `t`를 받아 메시지를 문자열로 (키가 없으면 키를 그대로 보여준다) */
export type Translate = (key: string, values?: MsgParams) => string;

/**
 * 값이 `@키` 로 시작하면 그 키를 먼저 번역해서 넣는다.
 * 엔진은 보스·몬스터 이름을 모르고 id 만 안다 — `msg("bossIn", { boss: "@boss.hexa" })`.
 */
export function ref(key: string): string {
  return `@${key}`;
}

export function text(t: Translate, m: Msg | null | undefined): string {
  if (!m) return "";
  try {
    let p = m.p;
    if (p) {
      for (const [k, v] of Object.entries(p)) {
        if (typeof v === "string" && v.startsWith("@")) {
          p = p === m.p ? { ...m.p } : p;
          p[k] = t(v.slice(1));
        }
      }
    }
    return t(m.k, p);
  } catch {
    // 번역이 비어 있어도 게임이 멈추면 안 된다
    return m.k;
  }
}
