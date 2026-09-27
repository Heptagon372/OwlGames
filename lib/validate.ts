// 로그인·회원가입 입력 검사 (DECISIONS §5-27).
// SQL 인젝션은 Supabase 파라미터 바인딩이 막지만, 들어오는 값 자체도 화이트리스트로 좁힌다.
// DB 트리거(profiles_validate, 20261008_security)와 같은 규칙이다 — 바꾸면 양쪽을 같이.

/** 이름: 한글·영문으로 시작, 한글·영문·공백·가운뎃점·마침표·하이픈만 (가입 화면은 2~20자) */
export const NAME_RE = /^[가-힣A-Za-z][가-힣A-Za-z .·-]{1,19}$/;

/** 학번: 영문·숫자 4~20자 — 학번 형식 설정(student_id_pattern)과 별개인 최후 방어선 */
export const STUDENT_ID_SAFE_RE = /^[0-9A-Za-z]{4,20}$/;

export const PASSWORD_MIN = 8;
/** bcrypt 는 72바이트 뒤를 버린다 — 그보다 길면 사용자가 모르는 새 잘린다 */
export const PASSWORD_MAX_BYTES = 72;

// 제어문자 (NUL·줄바꿈·탭 등). 이름·학번에는 절대 필요 없다
const CONTROL_RE = /[\u0000-\u001f\u007f]/;

export function isValidName(name: string): boolean {
  return NAME_RE.test(name) && !CONTROL_RE.test(name);
}

/** 설정된 학번 형식 + 안전 문자 둘 다 맞아야 한다. 설정 정규식이 깨져 있으면 안전 문자만 본다 */
export function isValidStudentId(id: string, pattern: string): boolean {
  if (!STUDENT_ID_SAFE_RE.test(id)) return false;
  try {
    return new RegExp(pattern).test(id);
  } catch {
    return true;
  }
}

export function passwordProblem(password: string, studentId: string): "short" | "long" | "same" | null {
  if (password.length < PASSWORD_MIN) return "short";
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) return "long";
  if (password === studentId) return "same";
  return null;
}

/**
 * 검색어를 PostgREST 필터 문자열(.or("name.ilike.%q%,…"))에 넣기 전에 거른다.
 * 쉼표·괄호·점·따옴표·%·*·_ 가 들어가면 필터 조건을 덧붙이는 "필터 인젝션"이 되므로
 * 한글·영문·숫자만 남긴다 (이름·학번 검색엔 그걸로 충분하다).
 */
export function safeSearchTerm(q: string): string {
  return q.replace(/[^가-힣A-Za-z0-9]/g, "").slice(0, 20);
}
