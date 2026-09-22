export type GameEndMeta = Record<string, unknown>;

export type GameComponentProps = {
  /** 게임이 끝나면 호출 — 원점수와 부가 정보(서버 검증용 로그) */
  onEnd: (rawScore: number, meta: GameEndMeta) => void;
};
