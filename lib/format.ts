// 표시용 포맷터 — DB의 mask_name()과 같은 규칙

/** 가운데 글자 마스킹: 홍길동 → 홍*동, 김수 → 김*, 남궁민수 → 남**수 */
export function maskName(name: string): string {
  const chars = Array.from(name.trim());
  if (chars.length <= 1) return chars.join("");
  if (chars.length === 2) return `${chars[0]}*`;
  return chars[0] + "*".repeat(chars.length - 2) + chars[chars.length - 1];
}

const nf = new Intl.NumberFormat("ko-KR");

export function formatNumber(n: number): string {
  return nf.format(Math.round(n));
}

export function formatPoints(n: number): string {
  return `${nf.format(Math.round(n))}P`;
}

const timeFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const dateTimeFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatTime(iso: string | Date): string {
  return timeFmt.format(new Date(iso));
}

export function formatDateTime(iso: string | Date): string {
  return dateTimeFmt.format(new Date(iso));
}

/** 남은 초 → "9:05" */
export function formatCountdown(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function timeAgo(iso: string, now: number = Date.now()): string {
  const diff = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (diff < 60) return "방금";
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}
