"use client";

/** 루트 레이아웃까지 실패한 경우 — 스타일 없이도 읽히게 인라인으로만 그린다 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#0b1020",
          color: "#e8ecf8",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: "24px",
          textAlign: "center",
        }}
      >
        <div>
          <p style={{ fontSize: "44px", margin: 0 }}>🦉</p>
          <h1 style={{ fontSize: "20px", margin: "16px 0 8px" }}>아울게임즈를 불러오지 못했어요</h1>
          <p style={{ color: "#8d97ba", fontSize: "14px", margin: 0 }}>
            브라우저를 새로고침하거나, 다른 브라우저(크롬·사파리)로 열어보세요.
          </p>
          {error.digest && (
            <p style={{ color: "#5b6588", fontSize: "12px", marginTop: "12px" }}>오류 코드 {error.digest}</p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "24px",
              minHeight: "48px",
              padding: "0 24px",
              borderRadius: "16px",
              border: "none",
              background: "#ffb020",
              color: "#0b1020",
              fontWeight: 700,
              fontSize: "15px",
            }}
          >
            다시 시도
          </button>
        </div>
      </body>
    </html>
  );
}
