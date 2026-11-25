import type { Metadata } from "next";
import Link from "next/link";
import { TERMS_PATH, TERMS_VERSION } from "@/lib/operating-policy";
import { PRIVACY_CONTACT } from "@/lib/privacy";
import "../privacy/privacy.css";

export const metadata: Metadata = {
  title: "이용약관 | Focus Quest",
  description: "Focus Quest 무료 공개 베타의 이용 기준과 문의 방법을 안내합니다.",
  alternates: { canonical: TERMS_PATH },
};

export default function TermsPage() {
  return <div className="privacy-page">
    <a className="privacy-skip" href="#terms-content">본문으로 건너뛰기</a>
    <header className="privacy-header">
      <Link className="privacy-brand" href="/" prefetch={false}>Focus Quest</Link>
      <Link href="/" prefetch={false}>타이머로 돌아가기</Link>
    </header>
    <main id="terms-content" className="privacy-document">
      <h1>이용약관</h1>
      <p className="privacy-date">시행일 2026년 11월 25일 · 버전 {TERMS_VERSION}</p>
      <p className="privacy-intro">Focus Quest는 집중 타이머와 모험, 학습 기록을 제공하는 무료 공개 베타입니다. 운영자는 {PRIVACY_CONTACT.name}(HOYA)입니다.</p>
      <div className="privacy-summary"><h2>이용 전 알아두세요</h2><ul>
        <li>게스트 타이머는 가입 없이 사용할 수 있습니다. 계정 가입은 만 14세 이상만 가능합니다.</li>
        <li>현재 이용료·자동 결제·유료 AI 호출은 없습니다. 추후 유료 기능은 가격과 조건을 별도로 안내하고 신청한 경우에만 제공합니다.</li>
        <li>복습 문제는 학습 보조 자료입니다. 원문과 대조해 확인하고, 중요한 자료는 원본을 별도로 보관해 주세요.</li>
      </ul></div>
      <section><h2>계정과 기록</h2><p>본인이 사용할 이메일로 가입하고 인증 정보와 캠프 코드를 안전하게 관리해 주세요. 다른 사람의 계정 이용, 타인 사칭, 비정상적인 자동 가입·요청으로 서비스를 방해하는 행위는 허용하지 않습니다. 계정 메뉴에서 탈퇴할 수 있습니다.</p></section>
      <section><h2>자료와 저작권</h2><p>업로드한 자료의 권리는 권리자에게 남습니다. 이용할 권한이 있는 자료만 올려 주세요. 운영자는 자료 보관·동기화·복습 등 요청한 기능 제공에 필요한 범위에서 처리하며, 자료를 판매하거나 공개 학습 자료로 전환하지 않습니다. 현재 PDF는 계정당 3개, 파일당 15MB·120쪽까지 지원합니다.</p></section>
      <section><h2>함께하는 캠프</h2><p>참가자가 보는 닉네임과 채팅에 민감한 개인정보를 남기지 마세요. 괴롭힘·혐오·성적 콘텐츠·불법 자료·스팸을 금지합니다. 차단·신고 기능을 이용하거나 운영자에게 알려주세요. 위반이 확인되면 게시·참여 제한 등 필요한 조치를 하고, 가능한 범위에서 사유와 이의 제기 방법을 안내합니다. 긴급한 안전·보안 위험은 먼저 제한할 수 있습니다.</p></section>
      <section><h2>베타 운영과 변경</h2><p>기능·접속 환경에 따라 오류나 중단이 생길 수 있습니다. 점검·중요 변경·종료를 계획할 때는 가능한 한 사전에 서비스에서 알리고 기록 확인·내보내기·삭제 요청 방법을 안내합니다. 계획된 서비스 종료는 원칙적으로 30일 전에 안내하되 긴급한 보안 조치나 불가피한 사정은 별도로 설명합니다. 법령상 이용자 권리와 운영자의 책임을 이 약관으로 일괄 배제하지 않습니다.</p></section>
      <section><h2>문의와 권리 행사</h2><p><a href={`mailto:${PRIVACY_CONTACT.email}`}>{PRIVACY_CONTACT.email}</a>로 문의해 주세요. 첫 답변은 영업일 기준 3일 이내를 목표로 하며, 법령에 따른 권리 요청 처리기한이 우선합니다. 비밀번호·인증 링크·API 키를 보내지 마세요. 개인 정보 처리와 삭제 범위는 <Link href="/privacy" prefetch={false}>개인정보 처리방침</Link>에서 확인할 수 있습니다.</p></section>
      <section><h2>약관 변경</h2><p>변경 내용과 시행일을 이 페이지에 안내합니다. 이용자에게 중요한 불리한 변경이나 별도 동의가 필요한 변경은 충분한 안내와 필요한 동의 절차를 거칩니다. 분쟁은 대한민국의 관련 법령에 따라 해결하며 법령상 관할을 제한하지 않습니다.</p></section>
      <footer className="privacy-footer"><Link href="/" prefetch={false}>타이머로 돌아가기</Link><Link href="/privacy" prefetch={false}>개인정보 처리방침</Link></footer>
    </main>
  </div>;
}
