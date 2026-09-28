import type { MetadataRoute } from "next";

// 홈 화면에 추가하면 브라우저 주소창·버튼 없이 전체화면으로 열린다 (아이폰 사파리는 게임 중 전체화면 API가 없다 — §5-40)
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "아울게임즈 OWL GAMES",
    short_name: "아울게임즈",
    start_url: "/lobby",
    display: "fullscreen",
    orientation: "any",
    background_color: "#070b18",
    theme_color: "#070b18",
    icons: [{ src: "/icon.png", sizes: "any", type: "image/png" }],
  };
}
