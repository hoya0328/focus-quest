export type InstallPlatform = "ios" | "android" | "desktop";
export function getInstallPlatform(userAgent: string, maxTouchPoints = 0): InstallPlatform {
  if (/iPad|iPhone|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1)) return "ios";
  return /Android/i.test(userAgent) ? "android" : "desktop";
}

export const INSTALL_STEPS: Record<InstallPlatform, string[]> = {
  ios: ["Safari에서 Focus Quest를 여세요.", "공유 버튼을 누르고 ‘홈 화면에 추가’를 선택하세요.", "‘웹 앱으로 열기’가 보이면 켠 뒤 ‘추가’를 누르세요."],
  android: ["Chrome 또는 설치를 지원하는 브라우저에서 Focus Quest를 여세요.", "브라우저 메뉴에서 ‘앱 설치’ 또는 ‘홈 화면에 추가’를 선택하세요.", "안내에 따라 설치하면 홈 화면에서 바로 열 수 있어요."],
  desktop: ["Chrome 또는 Edge에서 Focus Quest를 여세요.", "주소창의 설치 아이콘 또는 브라우저 메뉴의 ‘앱 설치’를 선택하세요.", "설치 항목이 없다면 이미 설치되어 있는지 확인하거나 브라우저를 업데이트해 주세요."],
};
