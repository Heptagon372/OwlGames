// 피싱 헌터(phish) 카드 데이터 — 스펙 §7.3
// 총 70장 = 정상 28장 + 피싱 42장 (정상:피싱 = 4:6).
// 종류별로도 비율을 맞춰 종류만 보고 찍을 수 없게 함:
//   url 23장(정상 9 / 피싱 14), sms 24장(정상 10 / 피싱 14), email 23장(정상 9 / 피싱 14)
//
// 카드 추가 방법
// - id: url은 'u', sms는 's', email은 'e' + 두 자리 번호. 전체에서 유일해야 함 (다음 번호 이어서).
// - 4:6 비율 유지: 정상 2장 추가할 때마다 피싱 3장을 같이 추가.
// - body 길이: url 70자 이하, sms·email 110자 이하 / explain: 30자 이내 한 줄.
// - sender는 sms(번호/이름)·email(발신 주소)만, title은 email만 사용.
// - 정상 카드는 실제 공식 도메인·대표번호만 사용. 개인 번호는 010-****-1234처럼 마스킹.
// - 피싱 카드라고 전부 '!'나 링크를 넣지 말 것 (표면 패턴으로 풀리지 않게).

export type PhishCardKind = 'url' | 'sms' | 'email';

export type PhishCard = {
  id: string;           // 'u01' / 's01' / 'e01' 형식, 전체에서 유일
  kind: PhishCardKind;
  sender?: string;      // sms: 발신번호/이름, email: 발신 주소 (url 카드에는 없음)
  title?: string;       // email 제목 (email에만)
  body: string;         // url: 주소 한 줄 / sms·email: 본문
  isPhish: boolean;
  explain: string;      // 오답 시 1초 표시할 한 줄 해설 (한국어, 30자 이내)
};

export const PHISH_CARDS: readonly PhishCard[] = [
  // ───────────────────────── URL (23장: 정상 9 / 피싱 14) ─────────────────────────
  { id: 'u01', kind: 'url', body: 'https://naver.com/login', isPhish: false, explain: '공식 도메인' },
  { id: 'u02', kind: 'url', body: 'https://naver-security.co/login', isPhish: true, explain: 'naver.com이 아닌 유사 도메인' },
  { id: 'u03', kind: 'url', body: 'https://nid.naver.com/nidlogin.login', isPhish: false, explain: 'nid.naver.com은 네이버 공식 서브도메인' },
  { id: 'u04', kind: 'url', body: 'https://naver.com.login-verify.net/nidlogin', isPhish: true, explain: '진짜 도메인은 끝의 login-verify.net' },
  { id: 'u05', kind: 'url', body: 'https://accounts.kakao.com/login', isPhish: false, explain: 'kakao.com 공식 계정 주소' },
  { id: 'u06', kind: 'url', body: 'https://kakaocorp-login.com/account/login', isPhish: true, explain: 'kakao.com이 아닌 유사 도메인' },
  { id: 'u07', kind: 'url', body: 'https://www.gov.kr', isPhish: false, explain: '정부24 공식 도메인 gov.kr' },
  { id: 'u08', kind: 'url', body: 'http://www.paypa1.com/signin', isPhish: true, explain: 'paypal의 l을 숫자 1로 바꾼 가짜' },
  { id: 'u09', kind: 'url', body: 'https://www.hometax.go.kr', isPhish: false, explain: '국세청 홈택스 공식 도메인(go.kr)' },
  { id: 'u10', kind: 'url', body: 'https://www.hometax.go.kr-refund.net/tax', isPhish: true, explain: '진짜 도메인은 kr-refund.net' },
  { id: 'u11', kind: 'url', body: 'https://www.skhu.ac.kr', isPhish: false, explain: '학교 공식 도메인 skhu.ac.kr' },
  { id: 'u12', kind: 'url', body: 'http://skhu.ac.kr.login-check.com/sso', isPhish: true, explain: 'http + 실제 도메인은 login-check.com' },
  { id: 'u13', kind: 'url', body: 'https://github.com/login', isPhish: false, explain: 'github.com 공식 로그인 + HTTPS' },
  { id: 'u14', kind: 'url', body: 'https://skhu.co.kr/portal/login', isPhish: true, explain: '학교는 ac.kr, co.kr은 가짜' },
  { id: 'u15', kind: 'url', body: 'https://accounts.google.com', isPhish: false, explain: 'google.com의 공식 서브도메인' },
  { id: 'u16', kind: 'url', body: 'http://203.0.113.45/kbstar/login.php', isPhish: true, explain: 'IP 주소 + http 로그인 페이지' },
  { id: 'u17', kind: 'url', body: 'https://www.cjlogistics.com/ko/tool/parcel/tracking', isPhish: false, explain: 'CJ대한통운 공식 배송조회 주소' },
  { id: 'u18', kind: 'url', body: 'https://bit.ly/3xOwL7q', isPhish: true, explain: '단축URL은 진짜 목적지를 숨김' },
  { id: 'u19', kind: 'url', body: 'https://githuh.com/login', isPhish: true, explain: 'github가 아닌 githuh (오타 도메인)' },
  { id: 'u20', kind: 'url', body: 'https://accounts-google.com/signin', isPhish: true, explain: '구글은 accounts.google.com' },
  { id: 'u21', kind: 'url', body: 'https://www.nhis-checkup.kr/result', isPhish: true, explain: '건보공단 공식 도메인은 nhis.or.kr' },
  { id: 'u22', kind: 'url', body: 'https://daangn-pay.shop/safe/88213', isPhish: true, explain: '당근 사칭 외부 결제 링크' },
  { id: 'u23', kind: 'url', body: 'http://www.police-go.kr/fine/pay', isPhish: true, explain: '경찰청은 police.go.kr (점 주의)' },

  // ───────────────────────── SMS (24장: 정상 10 / 피싱 14) ─────────────────────────
  {
    id: 's01', kind: 'sms', sender: '+82 10-****',
    body: '[CJ대한통운] 주소 불일치로 배송 보류. 확인: bit.ly/xxxx',
    isPhish: true, explain: '단축URL + 개인번호 발신',
  },
  {
    id: 's02', kind: 'sms', sender: '1588-1255',
    body: '[CJ대한통운] 고객님의 상품이 오늘 배송될 예정입니다. 운송장 6***-****-2210, 상세 조회는 CJ대한통운 앱에서 가능합니다.',
    isPhish: false, explain: '공식 대표번호 + 링크 없는 안내',
  },
  {
    id: 's03', kind: 'sms', sender: '010-****-4821',
    body: '[부고] 故 OOO님께서 별세하셨기에 삼가 알려드립니다. 빈소 및 발인 안내: han.gl/aB3xQ',
    isPhish: true, explain: '부고 사칭 + 모르는 번호의 링크',
  },
  {
    id: 's04', kind: 'sms', sender: '1588-9999',
    body: '[KB국민] 체크카드 승인 홍*동 12,500원 일시불 09/23 12:31 스타벅스 누적 45,200원',
    isPhish: false, explain: '링크·전화 요구 없는 승인 알림',
  },
  {
    id: 's05', kind: 'sms', sender: '010-****-7730',
    body: '저희 드디어 결혼합니다♥ 바쁘시더라도 꼭 와주세요! 모바일 청첩장 보기: wedding-card.kr/inv.apk',
    isPhish: true, explain: '청첩장 사칭 + apk 설치 유도',
  },
  {
    id: 's06', kind: 'sms', sender: '1577-1000',
    body: '[국민건강보험] 올해 일반건강검진 대상자입니다. 검진기관 조회는 The건강보험 앱 또는 www.nhis.or.kr에서 가능합니다.',
    isPhish: false, explain: '공식 번호 + 공식 도메인 안내',
  },
  {
    id: 's07', kind: 'sms', sender: '010-****-1234',
    body: '엄마야 폰 액정 깨져서 임시폰으로 문자해. 급하게 결제할 게 있는데 문화상품권 10만원만 사서 핀번호 보내줄래?',
    isPhish: true, explain: '가족 사칭 + 상품권 핀번호 요구',
  },
  {
    id: 's08', kind: 'sms', sender: '성공회대학교',
    body: '[성공회대] 2학기 등록금 납부 기간은 8/20~8/26입니다. 고지서는 학교 홈페이지(www.skhu.ac.kr)에서 확인하세요!',
    isPhish: false, explain: '학교 공식 도메인 + 정보 요구 없음',
  },
  {
    id: 's09', kind: 'sms', sender: '[국제발신] +1 646-***-0192',
    body: '[해외결제] 598,000원 승인완료(AMAZON US). 본인 결제가 아닐 시 즉시 소비자보호센터 02-***-7715로 신고 바랍니다.',
    isPhish: true, explain: '해외결제 미끼 + 모르는 번호 전화 유도',
  },
  {
    id: 's10', kind: 'sms', sender: '1588-1300',
    body: '[우체국] 등기우편이 오늘 14~16시에 배달될 예정입니다. 배달 조회: www.epost.go.kr',
    isPhish: false, explain: '공식 번호 + 공식 도메인 epost.go.kr',
  },
  {
    id: 's11', kind: 'sms', sender: '010-****-5503',
    body: '[경찰청] 교통법규 위반 과태료 미납 고지. 오늘까지 미납 시 가산금 부과. 위반 사진 확인: police-fine.kr/v',
    isPhish: true, explain: '과태료 사칭 + 공식 아닌 도메인',
  },
  {
    id: 's12', kind: 'sms', sender: '1544-7000',
    body: '[신한카드] 본인 명의 신규 카드가 발급되었습니다. 신청하지 않았다면 신한SOL페이 앱 또는 카드 뒷면 번호로 문의하세요.',
    isPhish: false, explain: '공식 앱·카드 뒷면 번호로만 안내',
  },
  {
    id: 's13', kind: 'sms', sender: '1577-1000',
    body: '[국민건강보험] 건강검진 결과 통보서가 발송되었습니다. 결과 확인: nhis-kr.com/r',
    isPhish: true, explain: '번호가 같아도 링크 도메인이 가짜',
  },
  {
    id: 's14', kind: 'sms', sender: '126',
    body: '[국세청] 5월은 종합소득세 신고·납부 기간입니다. 홈택스(www.hometax.go.kr) 또는 손택스 앱에서 신고하세요.',
    isPhish: false, explain: '국세청 번호 + 공식 도메인 안내',
  },
  {
    id: 's15', kind: 'sms', sender: '010-****-3319',
    body: '[네이버] 해외 IP 로그인 시도가 감지되어 계정이 잠겼습니다. 보호조치 해제: naver.com-secure.help',
    isPhish: true, explain: '실제 도메인은 com-secure.help',
  },
  {
    id: 's16', kind: 'sms', sender: '114',
    body: '[SKT] 이번 달 데이터 사용량이 80%를 넘었습니다. 잔여량은 T world 앱에서 확인하실 수 있습니다.',
    isPhish: false, explain: '링크 없이 공식 앱 확인 안내',
  },
  {
    id: 's17', kind: 'sms', sender: '010-****-8804',
    body: '[VIP리딩방] 코인 무료 리딩! 3일 만에 수익률 300% 달성. 선착순 20명 원금 보장, 오픈채팅 참여: open.kakao.com/o/xxxx',
    isPhish: true, explain: '원금 보장·고수익은 투자 사기',
  },
  {
    id: 's18', kind: 'sms', sender: '1599-3333',
    body: '[카카오뱅크] 새로운 기기에서 로그인되었습니다. 본인이 아니라면 앱의 기기 관리 메뉴에서 확인해 주세요.',
    isPhish: false, explain: '링크 없이 앱에서 확인 안내',
  },
  {
    id: 's19', kind: 'sms', sender: '010-****-2290',
    body: '당근 보고 연락드려요~ 안전결제로 먼저 입금했어요. 아래 링크에서 계좌 인증하면 바로 정산됩니다 karrot-pay.site/k2',
    isPhish: true, explain: '거래는 당근 앱 안에서만, 외부 링크 X',
  },
  {
    id: 's20', kind: 'sms', sender: '010-****-5521',
    body: '당근에서 에어팟 거래하기로 한 사람이에요. 내일 저녁 7시에 성공회대 정문 앞에서 직거래 괜찮으세요?',
    isPhish: false, explain: '링크·돈 요구 없는 일반 거래 문자',
  },
  {
    id: 's21', kind: 'sms', sender: '1588-1300',
    body: '[우체국] 등기 반송 예정 안내. 주소 불명확으로 반송됩니다. 주소 재확인: epost-go.kr/rt',
    isPhish: true, explain: '공식은 epost.go.kr, 번호도 위장 가능',
  },
  {
    id: 's22', kind: 'sms', sender: '010-****-6017',
    body: 'OOO 교수입니다. 회의 중이라 통화가 어려워요. 급한 일이라 편의점에서 구글 기프트카드 5만원권 4장 사서 핀번호 보내줄 수 있나요?',
    isPhish: true, explain: '지인 사칭 + 기프트카드 핀 요구',
  },
  {
    id: 's23', kind: 'sms', sender: '+82 10-****-4410',
    body: '[SKT] 요금 미납으로 오늘 18시 발신이 정지됩니다. 즉시 납부: skt-pay.co/m',
    isPhish: true, explain: 'SKT 도메인 아님 + 긴급 압박',
  },
  {
    id: 's24', kind: 'sms', sender: '+82 10-****-9051',
    body: '[정부24] 청년 생활지원금 50만원 지급 대상자입니다. 신청 마감 임박, 본인인증: gov24-kr.com/apply',
    isPhish: true, explain: '정부24는 gov.kr 도메인만 사용',
  },

  // ───────────────────────── EMAIL (23장: 정상 9 / 피싱 14) ─────────────────────────
  {
    id: 'e01', kind: 'email', sender: 'notice@skhu-ac.kr',
    title: '[학사] 수강신청 계정 재인증 필요',
    body: '24시간 내 미인증 시 계정 정지',
    isPhish: true, explain: '학교 도메인 사칭 + 긴급성 압박',
  },
  {
    id: 'e02', kind: 'email', sender: 'notice@skhu.ac.kr',
    title: '[학사] 2학기 수강신청 일정 안내',
    body: '2학기 수강신청 일정과 유의사항은 학교 홈페이지(www.skhu.ac.kr) 학사공지에서 확인하세요.',
    isPhish: false, explain: '진짜 학교 도메인 skhu.ac.kr',
  },
  {
    id: 'e03', kind: 'email', sender: 'NAVER <security@naver-helpdesk.com>',
    title: '[NAVER] 비정상 로그인 차단 안내',
    body: '회원님의 계정이 보호조치되었습니다. 아래 버튼을 눌러 비밀번호를 입력하고 본인 확인을 완료하세요. [보호조치 해제]',
    isPhish: true, explain: '표시 이름만 NAVER, 주소는 가짜',
  },
  {
    id: 'e04', kind: 'email', sender: 'GitHub <noreply@github.com>',
    title: '[GitHub] A new SSH key was added to your account',
    body: 'A new SSH public key was added to your account. If this was not you, review your keys on github.com.',
    isPhish: false, explain: 'github.com 공식 발신 + 입력 요구 없음',
  },
  {
    id: 'e05', kind: 'email', sender: 'helpdesk@skhu-mail.com',
    title: '[전산팀] 메일 계정 비밀번호 만료 안내',
    body: '비밀번호가 오늘 만료됩니다. 기존 비밀번호로 로그인하면 자동 연장됩니다: http://skhu-mail.com/renew',
    isPhish: true, explain: 'http + 기존 비번 입력 요구',
  },
  {
    id: 'e06', kind: 'email', sender: 'Google <no-reply@accounts.google.com>',
    title: '보안 알림: 새 기기에서 로그인',
    body: 'Windows 기기에서 Google 계정에 로그인했습니다. 본인이 맞다면 조치할 필요가 없습니다. 아니라면 myaccount.google.com에서 확인하세요.',
    isPhish: false, explain: '구글 공식 발신 + 비번 요구 없음',
  },
  {
    id: 'e07', kind: 'email', sender: 'owl.team****@gmail.com',
    title: '조별과제 발표자료 최종본',
    body: '발표자료 최종본 첨부해요~ 열어서 확인하고 수정할 부분 알려주세요! 첨부: 발표자료_최종.pdf.exe',
    isPhish: true, explain: 'pdf로 위장한 실행파일(.exe)',
  },
  {
    id: 'e08', kind: 'email', sender: '카카오계정 <noreply@kakaocorp.com>',
    title: '[카카오계정] 비밀번호 변경 안내',
    body: '회원님의 카카오계정 비밀번호가 변경되었습니다. 본인이 변경하지 않았다면 카카오톡 설정 > 카카오계정에서 확인하세요.',
    isPhish: false, explain: '공식 도메인 + 비번 입력 요구 없음',
  },
  {
    id: 'e09', kind: 'email', sender: 'customs@cjlogistics-kr.com',
    title: '[CJ대한통운] 해외직구 통관 보류 안내',
    body: '통관이 보류된 상품이 있습니다. 첨부된 통관서류(invoice.zip)를 열고 개인통관고유부호와 카드번호를 입력하세요.',
    isPhish: true, explain: 'zip 첨부 + 개인정보 입력 요구',
  },
  {
    id: 'e10', kind: 'email', sender: 'hometax@nts.go.kr',
    title: '[국세청] 연말정산 간소화 서비스 안내',
    body: '연말정산 간소화 자료는 1월 15일부터 홈택스(www.hometax.go.kr)에서 조회할 수 있습니다.',
    isPhish: false, explain: '국세청 공식 도메인 nts.go.kr',
  },
  {
    id: 'e11', kind: 'email', sender: 'event@starbucks-korea.win',
    title: '축하합니다! 아이패드 경품 당첨 안내',
    body: '추첨 이벤트에 당첨되셨습니다. 경품 수령을 위해 배송비 3,000원 결제 후 카드 정보를 회신해 주세요.',
    isPhish: true, explain: '경품 당첨 미끼 + 카드정보 요구',
  },
  {
    id: 'e12', kind: 'email', sender: 'noreply@coupang.com',
    title: '[쿠팡] 주문하신 상품이 도착했어요!',
    body: '주문하신 상품이 문 앞에 배송 완료되었습니다. 상세 내역은 쿠팡 앱 > 마이쿠팡에서 확인하세요.',
    isPhish: false, explain: '공식 도메인 + 앱에서 확인 안내',
  },
  {
    id: 'e13', kind: 'email', sender: 'drive-shares@google.docs-share.net',
    title: '"기말고사 족보.pdf" 파일이 공유되었습니다',
    body: '파일을 보려면 구글 계정으로 다시 로그인하세요. [문서 열기] https://docs-google.share-files.com',
    isPhish: true, explain: '구글 아닌 도메인에서 로그인 요구',
  },
  {
    id: 'e14', kind: 'email', sender: 'security@mail.instagram.com',
    title: 'Instagram 새 로그인 알림',
    body: '새로운 기기에서 로그인이 감지되었습니다. 본인이라면 무시하셔도 됩니다. 아니라면 앱 설정 > 보안에서 확인하세요.',
    isPhish: false, explain: '인스타 공식 도메인 + 앱 확인 안내',
  },
  {
    id: 'e15', kind: 'email', sender: 'copyright@instagram-help.com',
    title: '[Instagram] 저작권 침해 신고 접수',
    body: '게시물이 저작권 침해로 신고되었습니다. 48시간 내 이의신청하지 않으면 계정이 영구 삭제됩니다: instagram-appeal.help',
    isPhish: true, explain: '인스타 도메인 아님 + 삭제 협박',
  },
  {
    id: 'e16', kind: 'email', sender: 'library@skhu.ac.kr',
    title: '[도서관] 대출 도서 반납 예정일 안내',
    body: '대출하신 도서의 반납 예정일이 3일 남았습니다. 대출 연장은 도서관 홈페이지에서 가능합니다.',
    isPhish: false, explain: '학교 공식 도메인 + 정보 요구 없음',
  },
  {
    id: 'e17', kind: 'email', sender: '국세청 <refund@hometax-nts.com>',
    title: '[국세청] 미수령 환급금 327,400원 안내',
    body: '환급 신청이 오늘 마감됩니다. 아래 링크에서 카드번호와 비밀번호를 입력하면 즉시 환급됩니다.',
    isPhish: true, explain: '국세청은 카드 비밀번호 요구 안 함',
  },
  {
    id: 'e18', kind: 'email', sender: 'account-security-noreply@accountprotection.microsoft.com',
    title: 'Microsoft 계정 보안 코드',
    body: '보안 코드: 482913. 이 코드를 요청하지 않았다면 이 메일을 무시하세요. 코드는 누구에게도 알려주지 마세요.',
    isPhish: false, explain: 'MS 공식 발신 주소 + 링크 없음',
  },
  {
    id: 'e19', kind: 'email', sender: 'notice@spo-go.kr',
    title: '[서울중앙지검] 명의도용 사건 출석 요구서',
    body: '귀하의 명의가 금융범죄에 연루되었습니다. 첨부된 사건조회.apk를 설치하고 담당 수사관에게 즉시 연락하세요.',
    isPhish: true, explain: '수사기관은 앱 설치 요구 안 함',
  },
  {
    id: 'e20', kind: 'email', sender: '쿠팡 <order@coupang-pay.co>',
    title: '[쿠팡] 결제 실패로 주문이 취소됩니다',
    body: '결제 수단 오류가 발생했습니다. 1시간 안에 카드번호와 CVC를 다시 입력하지 않으면 주문이 자동 취소됩니다.',
    isPhish: true, explain: '쿠팡 도메인 아님 + 카드정보 요구',
  },
  {
    id: 'e21', kind: 'email', sender: 'admin@microsoft-365-support.com',
    title: '메일함 용량 초과 - 수신 중지 예정',
    body: '메일함 용량이 99% 찼습니다. 계속 메일을 받으려면 아래 [용량 늘리기]를 눌러 계정 정보를 확인하세요.',
    isPhish: true, explain: '가짜 MS 도메인 + 계정 확인 유도',
  },
  {
    id: 'e22', kind: 'email', sender: 'security@github-support.io',
    title: '[GitHub] Unusual sign-in - verify now',
    body: 'We blocked a sign-in attempt. Verify in 24h or your account will be suspended: github.com.verify-login.dev',
    isPhish: true, explain: '진짜 도메인은 verify-login.dev',
  },
  {
    id: 'e23', kind: 'email', sender: 'vip@upbit-event.net',
    title: '[업비트] 신규 상장 코인 사전 배정 이벤트',
    body: '지금 참여하면 원금 보장 + 월 30% 수익! 지갑 연결 후 복구 문구 12단어를 입력하세요.',
    isPhish: true, explain: '복구 문구 요구 = 100% 사기',
  },
];
