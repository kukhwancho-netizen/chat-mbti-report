import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert';

// 1. index.html에서 스크립트 추출 및 순수 로직 샌드박스 평가
const html = fs.readFileSync('index.html', 'utf-8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) {
  throw new Error('index.html 내에서 <script> 태그를 찾을 수 없습니다.');
}

const mockStorage = new Map();
const mockLocalStorage = {
  getItem: (key) => mockStorage.has(key) ? mockStorage.get(key) : null,
  setItem: (key, val) => mockStorage.set(key, String(val)),
  removeItem: (key) => mockStorage.delete(key),
  clear: () => mockStorage.clear()
};

const domElements = new Map();
const createMockElement = (id = '') => {
  const el = {
    id,
    addEventListener: () => {},
    appendChild: () => {},
    removeChild: () => {},
    style: {},
    classList: { add: () => {}, remove: () => {} },
    value: '',
    textContent: '',
    innerHTML: '',
    scrollIntoView: () => {}
  };
  return el;
};

const sandbox = {
  console,
  document: {
    getElementById: (id) => {
      if (!domElements.has(id)) {
        domElements.set(id, createMockElement(id));
      }
      return domElements.get(id);
    },
    createElement: (tag) => createMockElement(tag),
    body: createMockElement('body')
  },
  localStorage: mockLocalStorage,
  alert: () => {}
};

vm.createContext(sandbox);
vm.runInContext(scriptMatch[1], sandbox);

const {
  maskPII,
  isDatePattern,
  splitHeaderAndContent,
  parseChatText,
  calculateMetrics,
  scoreMBTI,
  handleChatFileUpload,
  savePaywallToken,
  getPaywallToken,
  checkPaywallUnlocked,
  renderDeepMbtiAnalysis,
  resetAnalysisState,
  onChatTextChange,
  STORAGE_PAYWALL_TOKEN_KEY
} = sandbox;

assert(typeof maskPII === 'function', 'maskPII 함수가 로드되지 않았습니다.');
assert(typeof isDatePattern === 'function', 'isDatePattern 함수가 로드되지 않았습니다.');
assert(typeof splitHeaderAndContent === 'function', 'splitHeaderAndContent 함수가 로드되지 않았습니다.');
assert(typeof parseChatText === 'function', 'parseChatText 함수가 로드되지 않았습니다.');
assert(typeof calculateMetrics === 'function', 'calculateMetrics 함수가 로드되지 않았습니다.');
assert(typeof scoreMBTI === 'function', 'scoreMBTI 함수가 로드되지 않았습니다.');

console.log('--- Test Suite 1: P1-3 & P2 날짜 패턴 오탐 방지 및 PII 마스킹 확장 검증 ---');

// 날짜 패턴 (문맥 키워드 뒤에 있어도 계좌로 마스킹하지 않음)
assert.strictEqual(maskPII('입금 2026-11-14'), '입금 2026-11-14', 'YYYY-MM-DD 날짜는 입금 키워드 뒤에도 보존되어야 합니다.');
assert.strictEqual(maskPII('입금 2026.11.14'), '입금 2026.11.14', 'YYYY.MM.DD 날짜는 입금 키워드 뒤에도 보존되어야 합니다.');
assert.strictEqual(maskPII('입금 2026/11/14'), '입금 2026/11/14', 'YYYY/MM/DD 날짜는 입금 키워드 뒤에도 보존되어야 합니다.');
assert.strictEqual(maskPII('입금 2026년 11월 14일'), '입금 2026년 11월 14일', 'YYYY년 M월 D일 날짜는 입금 키워드 뒤에도 보존되어야 합니다.');
assert.strictEqual(maskPII('입금: 2026. 11. 14'), '입금: 2026. 11. 14', '공백 구분 날짜도 보존되어야 합니다.');
assert.strictEqual(maskPII('2026-11-14로 입금해주세요'), '2026-11-14로 입금해주세요', '날짜 뒤 입금 키워드가 와도 보존되어야 합니다.');

// 실제 계좌번호는 정상 마스킹
assert.strictEqual(maskPII('계좌: 1234567890'), '계좌: [계좌번호 마스킹]');
assert.strictEqual(maskPII('입금 1234567890'), '입금 [계좌번호 마스킹]');
assert.strictEqual(maskPII('국민은행 123-45-678901'), '국민은행 [계좌번호 마스킹]');
assert.strictEqual(maskPII('우리은행 1234.56.7890123'), '우리은행 [계좌번호 마스킹]');
assert.strictEqual(maskPII('카카오뱅크 3333-01-2345678'), '카카오뱅크 [계좌번호 마스킹]');

// 전화번호 및 이메일 마스킹
assert.strictEqual(maskPII('01012345678'), '[전화번호 마스킹]');
assert.strictEqual(maskPII('+82 10 1234 5678'), '[전화번호 마스킹]');
assert.strictEqual(maskPII('070-1234-5678'), '[전화번호 마스킹]');
assert.strictEqual(maskPII('test@example.com'), '[이메일 마스킹]');

// 일반 금액·시간 오탐 방지
assert.strictEqual(maskPII('회비 50,000원'), '회비 50,000원');
assert.strictEqual(maskPII('오후 6시까지 확정'), '오후 6시까지 확정');
console.log('PASS: P1-3 & P2 날짜 패턴 오탐 방지 통과');

console.log('--- Test Suite 2: P1-1 & P1-2 원문 비보존 및 실명 은닉 검증 ---');
const sampleChat = `--------------- 2026년 11월 14일 토요일 ---------------
[오전 10:15] 김철수 : 안녕하세요 여러분!
[오전 10:18] 이영희 : 철수님 안녕하세요~
[오전 10:20] 박민수 : 제 계좌번호는 1234567890 입니다.`;

const parsed = parseChatText(sampleChat, '김철수');
assert(parsed, '파싱 결과가 존재해야 합니다.');
assert.strictEqual(parsed.targetSpeaker, '나(화자A)');
assert.strictEqual(parsed.messages.length, 3);

parsed.messages.forEach((msg, idx) => {
  assert.strictEqual(msg.rawSpeaker, undefined, `message[${idx}]에 rawSpeaker가 보존되지 않아야 합니다.`);
  assert.strictEqual(msg.rawContent, undefined, `message[${idx}]에 rawContent가 보존되지 않아야 합니다.`);
  assert(msg.maskedSpeaker, `message[${idx}]에 maskedSpeaker가 존재해야 합니다.`);
  assert(msg.maskedContent, `message[${idx}]에 maskedContent가 존재해야 합니다.`);
});

assert.strictEqual(parsed.messages[0].maskedSpeaker, '나(화자A)');
assert.strictEqual(parsed.messages[1].maskedSpeaker, '화자B');
assert.strictEqual(parsed.messages[2].maskedSpeaker, '화자C');
assert(parsed.messages[2].maskedContent.includes('[계좌번호 마스킹]'), '마스킹된 내용이어야 합니다.');
console.log('PASS: P1-1 & P1-2 원문 비보존 및 실명 은닉 통과');

console.log('--- Test Suite 3: P2-4 날짜 구분선 확장 및 시간 역행 방어 ---');
const variedDatesChat = `--- 2026. 11. 14. 토요일 ---
[오전 10:15] 화자1 : 안녕하세요
--- 2026-11-15 ---
[오후 11:50] 화자1 : 밤 인사
[오전 00:10] 화자2 : 새벽 인사
[오전 00:15] 화자1 : 바로 회신`;

const parsedVaried = parseChatText(variedDatesChat, '화자1');
assert(parsedVaried.messages[0].date.includes('2026. 11. 14'));
assert(parsedVaried.messages[1].date.includes('2026-11-15'));
assert.notStrictEqual(parsedVaried.messages[1].date, parsedVaried.messages[2].date, '시간 역행 시 같은 날짜로 오염되지 않아야 합니다.');

const metricsVaried = calculateMetrics(parsedVaried.messages);
assert(metricsVaried.avgLatency === null || metricsVaried.avgLatency >= 0, '응답 지연이 음수가 아니어야 합니다.');
console.log('PASS: P2-4 날짜선 인식 및 시간 역행 방어 통과');

console.log('--- Test Suite 4: P2 수정 메시지 헤더 분리 (첫 공백-콜론-공백 우선, 본문 URL·콜론 오분리 방지) ---');
// 본문 URL(https://…) 포함 메시지
const urlLine = '[오전 10:15] 김철수 : 링크는 https://example.com/item:456 입니다.';
const urlHeader = splitHeaderAndContent(urlLine);
assert.strictEqual(urlHeader.rawSpeaker, '김철수', '본문 URL 속 콜론에 의해 화자명이 오분리되지 않아야 합니다.');
assert.strictEqual(urlHeader.content, '링크는 https://example.com/item:456 입니다.', '본문 내용이 보존되어야 합니다.');

// 본문 내 콜론 문장
const colonContentLine = '[오전 10:15] 김철수 : 공지사항 : 오늘 10시 회의 시작합니다.';
const colonContentHeader = splitHeaderAndContent(colonContentLine);
assert.strictEqual(colonContentHeader.rawSpeaker, '김철수', '첫 공백-콜론-공백 기준 분리로 화자가 정확히 추출되어야 합니다.');
assert.strictEqual(colonContentHeader.content, '공지사항 : 오늘 10시 회의 시작합니다.');

// 화자명에 콜론 포함 케이스
const colonSpeakerLine = '[오전 10:15] 팀장:김철수 : 안녕하세요 여러분!';
const colonSpeakerHeader = splitHeaderAndContent(colonSpeakerLine);
assert.strictEqual(colonSpeakerHeader.rawSpeaker, '팀장:김철수', '화자명에 콜론이 있어도 공백-콜론-공백에 의해 정확히 분리되어야 합니다.');
assert.strictEqual(colonSpeakerHeader.content, '안녕하세요 여러분!');

// 공백-콜론-공백이 없는 경우 마지막 콜론 폴백
const fallbackLine = '[오전 10:15] 김철수: 폴백 내용';
const fallbackHeader = splitHeaderAndContent(fallbackLine);
assert.strictEqual(fallbackHeader.rawSpeaker, '김철수');
assert.strictEqual(fallbackHeader.content, '폴백 내용');

// 전체 파싱 테스트에서 URL 오분리 없음 단언
const urlChat = `--------------- 2026년 11월 14일 토요일 ---------------
[오전 10:15] 김철수 : 확인 사이트 https://github.com:443 입니다.
[오전 10:16] 이영희 : 네 확인했습니다!`;
const parsedUrl = parseChatText(urlChat, '김철수');
assert.strictEqual(parsedUrl.messages[0].maskedSpeaker, '나(화자A)');
assert(parsedUrl.messages[0].maskedContent.includes('https://github.com:443'));
console.log('PASS: P2 메시지 헤더 분리 통과');

console.log('--- Test Suite 5: P2 수정 타 화자 메시지가 뒤따르는 유효 교대(회신 쌍) 0건 시 근거 부족 및 "나→상대" 일방향 회귀 ---');
// 1인 독백 대화
const soloChat = `--------------- 2026년 11월 14일 토요일 ---------------
[오전 10:15] 나홀로 : 혼자 생각 정리하기
[오전 10:30] 나홀로 : 계획을 세워보자 시간표 작성`;
const parsedSolo = parseChatText(soloChat, '나홀로');
const metricsSolo = calculateMetrics(parsedSolo.messages);
assert.strictEqual(metricsSolo.hasInitiateRate, false, '1인 대화에서는 개시율이 유효하지 않아야 합니다.');
assert.strictEqual(metricsSolo.initiateRateDisplay, '근거 부족');
assert.strictEqual(metricsSolo.hasAvgLatency, false, '1인 대화에서는 응답지연이 유효하지 않아야 합니다.');
assert.strictEqual(metricsSolo.avgLatencyDisplay, '근거 부족');

// '나→상대' 일방향 대화 (상대의 회신 쌍이 0건)
const oneWayChat = `--------------- 2026년 11월 14일 토요일 ---------------
[오전 09:00] 이영희 : 팀 공지사항 확인바랍니다.
[오전 10:15] 김철수 : 이영희님 안녕하세요! 오늘 일정 계획표입니다.
[오전 10:30] 김철수 : 프로젝트 체크리스트 칼같이 정리 완료했습니다.`;
const parsedOneWay = parseChatText(oneWayChat, '김철수');
const metricsOneWay = calculateMetrics(parsedOneWay.messages);

assert.strictEqual(metricsOneWay.partnerFollowCount, 0, '김철수 발화 후 이영희의 유효 회신이 0건이어야 합니다.');
assert.strictEqual(metricsOneWay.hasInitiateRate, false, '타 화자 유효 회신이 0건이면 개시율은 근거 부족이어야 합니다.');
assert.strictEqual(metricsOneWay.initiateRateDisplay, '근거 부족');
assert.strictEqual(metricsOneWay.hasAvgLatency, false, '유효 회신 쌍이 0건이면 응답지연은 근거 부족이어야 합니다.');
assert.strictEqual(metricsOneWay.avgLatencyDisplay, '근거 부족');

// E/J 스코어 가중치 배제 단언
const targetOneWayMsgs = parsedOneWay.messages.filter(m => m.isTarget);
const mbtiOneWay = scoreMBTI(targetOneWayMsgs, metricsOneWay);
const mbtiHypotheticalPartner = scoreMBTI(targetOneWayMsgs, {
  ...metricsOneWay,
  hasInitiateRate: true,
  initiateRate: 100,
  hasAvgLatency: true,
  avgLatency: 1
});
assert.strictEqual(mbtiHypotheticalPartner.scores.E - mbtiOneWay.scores.E, 2, '일방향 대화에서는 개시율 E 가중치(+2)가 배제되어야 합니다.');
assert.strictEqual(mbtiHypotheticalPartner.scores.J - mbtiOneWay.scores.J, 1, '일방향 대화에서는 응답지연 J 가중치(+1)가 배제되어야 합니다.');
console.log('PASS: P2 타 화자 회신 쌍 0건 및 "나→상대" 일방향 회귀 통과');

console.log('--- Test Suite 6: P2-7 신뢰도 산식 개선 검증 ---');
const dominantMsgs = [
  { maskedContent: '일정 계획 시간표 체크리스트 순서 마감 준비', isTarget: true },
  { maskedContent: '규칙 시스템 체계 확정 타임테이블', isTarget: true },
  { maskedContent: '계획대로 기한 내에 체계적 정리 완료', isTarget: true }
];
const mockMetrics = {
  count: 3,
  hasInitiateRate: true,
  initiateRate: 60,
  hasAvgLatency: true,
  avgLatency: 2,
  laughDensity: 0,
  emojiDensity: 0
};
const scoredDominant = scoreMBTI(dominantMsgs, mockMetrics);
assert(scoredDominant.axisJP.dominant === 'J');
assert(scoredDominant.axisJP.confidence >= 75);

const balancedMsgs = [
  { maskedContent: '계획 일정', isTarget: true },
  { maskedContent: '즉흥 유연 자유', isTarget: true }
];
const scoredBalanced = scoreMBTI(balancedMsgs, { ...mockMetrics, hasAvgLatency: false });
assert(scoredBalanced.axisJP.confidence < scoredDominant.axisJP.confidence);
console.log('PASS: P2-7 신뢰도 산식 개선 검증 통과');

console.log('--- Test Suite 7: P1 수정 textarea 변경 시 UI 상태 즉시 초기화 & 실명 잔류 0건 검증 ---');
// 모의 DOM 요소 준비
const rawChatInputEl = sandbox.document.getElementById('rawChatInput');
const speakerSelectEl = sandbox.document.getElementById('speakerSelect');
const reportSectionEl = sandbox.document.getElementById('reportSection');
const maskedPreviewEl = sandbox.document.getElementById('maskedChatPreview');
const paywallLockedEl = sandbox.document.getElementById('paywallLockedView');
const paywallUnlockedEl = sandbox.document.getElementById('paywallUnlockedView');
const deepBoxEl = sandbox.document.getElementById('deepMbtiAnalysisBox');

// 대화 입력 후 초기화 트리거
rawChatInputEl.value = sampleChat;
onChatTextChange();
assert.strictEqual(sandbox.selectedSpeaker, '', '입력 변경 시 selectedSpeaker는 즉시 빈 문자열로 초기화되어야 합니다.');

// 임의 데이터 주입 후 다시 textarea 변경 시 소멸 여부 확인
deepBoxEl.innerHTML = '<div>김철수 실명과 이전 결과 데이터</div>';
reportSectionEl.style.display = 'block';
maskedPreviewEl.textContent = '김철수 : 이전 대화';
paywallLockedEl.style.display = 'none';
paywallUnlockedEl.style.display = 'block';

// textarea 변경 이벤트 시뮬레이션
rawChatInputEl.value = '새로운 대화 내용';
onChatTextChange();

assert.strictEqual(sandbox.parsedData, null, 'parsedData는 null로 초기화되어야 합니다.');
assert.strictEqual(sandbox.selectedSpeaker, '', 'selectedSpeaker는 초기화되어야 합니다.');
assert.strictEqual(reportSectionEl.style.display, 'none', 'reportSection은 숨김 처리되어야 합니다.');
assert.strictEqual(maskedPreviewEl.textContent, '', '마스킹 프리뷰는 비워져야 합니다.');
assert.strictEqual(paywallLockedEl.style.display, 'block', '페이월 잠금 화면이 다시 활성화되어야 합니다.');
assert.strictEqual(paywallUnlockedEl.style.display, 'none', '페이월 잠금 해제 화면은 닫혀야 합니다.');
assert.strictEqual(deepBoxEl.innerHTML, '', '심층 분석 박스에 이전 실명이나 결과가 남아있지 않아야 합니다.');
console.log('PASS: P1 textarea 변경 시 즉시 초기화 및 실명 잔류 0건 통과');

console.log('--- Test Suite 8: 신기능 1 파일 업로드 (accept=".txt", 1MB 가드) 검증 ---');
// 1MB = 1024 * 1024 = 1,048,576 bytes
const largeFile = { size: 1024 * 1024 + 10, name: 'large_chat.txt', type: 'text/plain' };
const validFile = { size: 1024 * 50, name: 'normal_chat.txt', type: 'text/plain' };

const largeResult = handleChatFileUpload(largeFile);
assert.strictEqual(largeResult, false, '1MB 초과 파일은 거부되어야 합니다.');

const validResult = handleChatFileUpload(validFile);
assert.strictEqual(validResult, true, '1MB 이하 정상 텍스트 파일은 허용되어야 합니다.');
console.log('PASS: 신기능 1 파일 업로드 1MB 가드 통과');

console.log('--- Test Suite 9: 신기능 2 페이월 상태 전환 (잠금 → 데모 unlock → 24시간 토큰 → 만료) & 실명 은닉 검증 ---');
// 1. 초기 상태: 토큰 없음 -> 잠금 상태
mockLocalStorage.clear();
assert.strictEqual(checkPaywallUnlocked(), false, '초기 상태는 잠금이어야 합니다.');

// 2. 데모 unlock: 토큰 생성 및 저장
const savedToken = savePaywallToken();
assert(savedToken, '토큰이 생성되어야 합니다.');
assert.strictEqual(savedToken.unlocked, true);
assert.strictEqual(checkPaywallUnlocked(), true, '데모 unlock 후에는 잠금 해제 상태여야 합니다.');

// 3. 재방문 복원: localStorage에서 토큰 복원 확인
const loadedToken = getPaywallToken();
assert.strictEqual(loadedToken.unlocked, true);
assert(loadedToken.expiresAt > Date.now(), '만료 시간은 미래 시점이어야 합니다.');

// 4. 유료 종합 결과 콘텐츠 렌더링 시 실명 마스킹 원칙 준수 확인
const testDeepBox = createMockElement('deepBox');
renderDeepMbtiAnalysis(testDeepBox, scoredDominant);
assert(testDeepBox.innerHTML.includes('나(화자A)'), '유료 콘텐츠에도 "나(화자A)" 마스킹 원칙이 준수되어야 합니다.');
assert(!testDeepBox.innerHTML.includes('김철수'), '원문 실명이 유료 콘텐츠에 노출되지 않아야 합니다.');

// 5. 토큰 만료 시뮬레이션: 만료 시간을 1시간 전으로 조작
mockLocalStorage.setItem(STORAGE_PAYWALL_TOKEN_KEY, JSON.stringify({
  unlocked: true,
  amount: 500,
  expiresAt: Date.now() - 3600000
}));
assert.strictEqual(checkPaywallUnlocked(), false, '만료된 토큰은 잠금 해제로 인정되지 않고 자동 제거되어야 합니다.');
assert.strictEqual(mockLocalStorage.getItem(STORAGE_PAYWALL_TOKEN_KEY), null, '만료된 토큰은 localStorage에서 삭제되어야 합니다.');
console.log('PASS: 신기능 2 페이월 상태 전환 및 유료 실명 은닉 통과');

console.log('--- Test Suite 10: Luna R3 findings 회귀 (콜론 폴백·파일 검증·토큰 위조·리셋 잔류) 검증 ---');

// 10-1. 공백 없는 헤더의 콜론 폴백: 본문 URL·문장 콜론이 화자명으로 오분리되지 않음
const colonHeader = splitHeaderAndContent('[오후 3:12] 김철수: 보고서 https://x.com:8080/a 확인 부탁해: 오늘까지');
assert.strictEqual(colonHeader.rawSpeaker, '김철수', '공백 없는 헤더에서도 첫 유효 콜론 앞까지가 화자여야 합니다.');
assert(colonHeader.content.includes('https://x.com:8080/a'), '본문 URL은 화자 분리에 잘리지 않고 보존되어야 합니다.');
const urlFirstHeader = splitHeaderAndContent('[오후 3:12] 링크 https://example.com/path:80 보내요');
assert.strictEqual(urlFirstHeader, null, 'URL이 먼저 오는 줄은 화자 경계를 신뢰할 수 없으므로 헤더로 인정하지 않습니다.');
const normalSpacedHeader = splitHeaderAndContent('[오전 10:15] 김철수 : https://example.com 을 봐줘');
assert.strictEqual(normalSpacedHeader.rawSpeaker, '김철수', '공백-콜론-공백 우선 분리는 유지되어야 합니다.');
assert(normalSpacedHeader.content.startsWith('https://'), '공백-콜론-공백 분리 후 URL이 온전해야 합니다.');

// 10-2. validateChatFile: 확장자·MIME·빈 파일 가드
const { validateChatFile } = sandbox;
assert(validateChatFile(null).ok === false, '파일이 없으면 거부합니다.');
assert(validateChatFile({ size: 100, name: 'report.pdf', type: 'application/pdf' }).ok === false, 'PDF는 거부되어야 합니다.');
assert(validateChatFile({ size: 100, name: 'chat.exe', type: 'application/octet-stream' }).ok === false, '바이너리는 거부되어야 합니다.');
assert(validateChatFile({ size: 0, name: 'empty.txt', type: 'text/plain' }).ok === false, '빈 파일은 거부되어야 합니다.');
assert(validateChatFile({ size: 100, name: 'chat.txt', type: 'application/pdf' }).ok === false, '확장자가 txt여도 MIME이 텍스트가 아니면 거부합니다.');
assert(validateChatFile({ size: 100, name: 'chat.TXT', type: 'text/plain' }).ok === true, '대문자 .txt 확장자는 허용됩니다.');

// 10-3. 위조 토큰(금액 불일치) 거부 및 자동 제거
mockLocalStorage.clear();
mockLocalStorage.setItem(STORAGE_PAYWALL_TOKEN_KEY, JSON.stringify({
  unlocked: true,
  amount: 1, // 500원이 아닌 위조 금액
  unlockedAt: Date.now(),
  expiresAt: Date.now() + 3600000
}));
assert.strictEqual(getPaywallToken(), null, '금액이 조작된 토큰은 무효화되어야 합니다.');
assert.strictEqual(mockLocalStorage.getItem(STORAGE_PAYWALL_TOKEN_KEY), null, '위조 토큰은 localStorage에서 제거되어야 합니다.');
assert.strictEqual(checkPaywallUnlocked(), false, '위조 토큰으로는 잠금이 해제되지 않아야 합니다.');

// 10-4. 컨텐츠 톤 가이드: 페르소나·한 줄 요약이 16유형 전부 채워져 있어야 함 (신박하고 재미있게)
const { PERSONA_MAP, PERSONA_ONE_LINER } = sandbox;
const ALL_TYPES = ["INTJ", "INTP", "ENTJ", "ENTP", "INFJ", "INFP", "ENFJ", "ENFP",
  "ISTJ", "ISFJ", "ESTJ", "ESFJ", "ISTP", "ISFP", "ESTP", "ESFP"];
ALL_TYPES.forEach(t => {
  assert(PERSONA_MAP[t] && PERSONA_MAP[t].length >= 2, `페르소나 이름 누락: ${t}`);
  assert(PERSONA_ONE_LINER[t] && PERSONA_ONE_LINER[t].length >= 10, `한 줄 요약 누락: ${t}`);
});
const uniquePersonas = new Set(ALL_TYPES.map(t => PERSONA_MAP[t]));
assert.strictEqual(uniquePersonas.size, 16, '페르소나 이름은 16유형 모두 서로 달라야 합니다.');
console.log('PASS: 컨텐츠 톤 가이드 (16유형 페르소나·한 줄 요약 전부 존재) 통과');

// 10-5. 입력 변경 리셋 시 근거 카드·리포트 필드·축 바·canvas까지 실제로 비워짐 (DOM·픽셀 잔류 제거)
const prevQuoteGrid = domElements.get('quoteCardsGrid');
prevQuoteGrid.innerHTML = '<div class="quote-card">이전 분석 근거</div>';
const prevCanvas = domElements.get('shareCanvas');
prevCanvas.width = 800;
prevCanvas.height = 960;
let clearedRect = null;
prevCanvas.getContext = () => ({ clearRect: (x, y, w, h) => { clearedRect = { x, y, w, h }; } });
const prevTarget = domElements.get('mbtiTargetDisplay');
prevTarget.textContent = '분석 대상: 나(화자A) | 총 5개 발화 분석';
const prevEvidence = domElements.get('evidenceT');
prevEvidence.textContent = '판단 및 의사결정 (T 성향 우세)';
const prevBarE = domElements.get('barE');
prevBarE.style.width = '67%';
const prevBarF = domElements.get('barF');
prevBarF.style.width = '8%';
resetAnalysisState();
assert.strictEqual(prevQuoteGrid.innerHTML, '', '입력 변경 시 근거 카드 그리드가 실제로 비워져야 합니다.');
assert.strictEqual(prevTarget.textContent, '', '리포트 대상 필드가 비워져야 합니다.');
assert.strictEqual(prevEvidence.textContent, '', '축별 근거 문구가 비워져야 합니다.');
assert.strictEqual(prevBarE.style.width, '', '축 바(barE) width가 초기화되어야 합니다.');
assert.strictEqual(prevBarF.style.width, '', '축 바(barF) width가 초기화되어야 합니다.');
assert(clearedRect && clearedRect.w === 800 && clearedRect.h === 960, 'canvas 픽셀이 클리어되어야 합니다.');
console.log('PASS: Luna R3 findings 회귀 (콜론 폴백·파일 검증·토큰 위조·리셋 잔류) 통과');

console.log('--- Test Suite 11: 입력 소스 일반화 (지피티 등 일반 대화 텍스트) 검증 ---');

// 11-1. 일반 대화 형식(화자: 내용, 타임스탬프 없음) 파싱
const genericChat = [
  '사용자: 요즘 내 대화 스타일 어때 보이면 말해줘 ㅋㅋ',
  'ChatGPT: 메시지가 짧고 템포가 빠른 편이네요!',
  '사용자: 그냥 갈겨쓰는 편이라 그래',
  'ChatGPT: 결정을 빨리 내리는 스타일로 보입니다.'
].join('\n');
const genericParsed = parseChatText(genericChat, '사용자');
assert(genericParsed && genericParsed.messages.length === 4, '일반 대화 4줄이 4개 메시지로 파싱되어야 합니다.');
assert.strictEqual(genericParsed.messages[0].rawSpeakerMasked || genericParsed.messages[0].maskedSpeaker, '나(화자A)', '지정 화자는 나(화자A)로 마스킹되어야 합니다.');
assert.strictEqual(genericParsed.messages[1].maskedSpeaker, '화자B', '나머지 화자는 화자B로 치환되어야 합니다.');
assert(genericParsed.messages[0].maskedContent.includes('ㅋㅋ'), '본문은 보존되어야 합니다.');
assert.strictEqual(genericParsed.messages.every(m => m.hour === null), true, '타임스탬프가 없는 메시지는 hour가 null이어야 합니다.');

// 11-2. 타임스탬프 부재 시 시간 기반 지표는 근거 부족 처리
const genericMessages = genericParsed.messages;
const genericMetrics = calculateMetrics(genericMessages);
assert.strictEqual(genericMetrics.hasInitiateRate, false, '타임스탬프가 없으면 개시율은 근거 부족이어야 합니다.');
assert.strictEqual(genericMetrics.initiateRateDisplay, '근거 부족', '개시율 표기는 근거 부족이어야 합니다.');
assert.strictEqual(genericMetrics.hasAvgLatency, false, '타임스탬프가 없으면 응답 지연은 근거 부족이어야 합니다.');
assert(genericMetrics.laughDensity !== undefined, '웃음 밀도 등 텍스트 기반 지표는 여전히 계산되어야 합니다.');

// 11-3. 라인 시작 레이블만 화자로 인정 — 본문 중간 콜론 문장은 흡수되고, 한 번만 등장한 화자도 누락되지 않는다
const colonHeavyChat = [
  '사용자: 자기소개 부탁해',
  'ChatGPT: 좋아요. 참고 사항: 저는 대화 패턴만 봅니다.',
  '사용자: 오케이 그럼 시작해줘: 첫 번째 질문'
].join('\n');
const colonParsed = parseChatText(colonHeavyChat, '사용자');
assert(colonParsed && colonParsed.messages.length === 3, '라인 시작 레이블 3개가 3개 메시지가 되어야 합니다.');
assert(colonParsed.messages[1].maskedSpeaker === '화자B', '한 번만 등장한 화자도 누락 없이 마스킹 매핑되어야 합니다.');
assert(colonParsed.messages[1].maskedContent.includes('참고 사항'), '본문 중간 콜론 문장은 화자 분리되지 않고 본문에 남아야 합니다.');

console.log('PASS: 입력 소스 일반화 (지피티 등 일반 대화 텍스트) 통과');

console.log('--- Test Suite 12: Luna R6 회귀 (URL 레이블·빈 본문·드롭다운 감지) 검증 ---');

// 12-1. URL 라인은 화자 'https'로 오인식되지 않고 본문에 온전히 흡수된다
const r6UrlChat = '사용자: 링크 하나만 볼래?\nhttps://example.com/path:80 보내요\n사용자: 봤어 좋네';
const r6UrlParsed = parseChatText(r6UrlChat, '사용자');
assert(r6UrlParsed, 'URL이 포함된 일반 대화도 파싱되어야 합니다.');
assert(!r6UrlParsed.messages.some(m => m.maskedSpeaker === 'https' || m.maskedSpeaker === 'http'), 'URL 스킴 이름이 화자가 되어서는 안 됩니다.');
assert(r6UrlParsed.messages.some(m => m.maskedContent.includes('https://example.com')), 'URL은 본문에 온전히 남아야 합니다.');
const speakersInUrl = new Set(r6UrlParsed.messages.map(m => m.maskedSpeaker));
assert(!speakersInUrl.has('https'), '드롭다운에 https가 화자로 추가되어서는 안 됩니다.');

// 12-2. 빈 본문 레이블('홍길동:')도 메시지로 파싱되어 원문이 마스킹 결과에 잔류하지 않는다
const r6EmptyChat = '사용자: 자기소개 해줘\n홍길동:\nChatGPT: 홍길동이라니, 반가워요!';
const r6EmptyParsed = parseChatText(r6EmptyChat, '사용자');
assert(r6EmptyParsed && r6EmptyParsed.messages.length === 3, '빈 본문 레이블 줄도 메시지 경계로 인정되어야 합니다.');
assert(r6EmptyParsed.messages.every(m => m.maskedSpeaker !== '홍길동'), '원문 레이블 화자명이 그대로 잔류하지 않아야 합니다.');
assert(r6EmptyParsed.messages.some(m => m.maskedContent.includes('반가워요')), '본문은 보존되어야 합니다.');

// 12-3. onChatTextChange가 일반 대화 화자를 드롭다운에 감지한다
domElements.get('rawChatInput').value = '사용자: 안녕\nChatGPT: 안녕하세요!';
onChatTextChange();
const selectEl = domElements.get('speakerSelect');
assert(!selectEl.innerHTML.includes('화자를 감지할 수 없습니다'), '일반 대화에서도 화자가 감지되어야 합니다.');
assert.strictEqual(selectEl.innerHTML, '', '화자 옵션이 추가된 경우 감지 실패 문구가 남지 않아야 합니다.');

console.log('PASS: Luna R6 회귀 (URL 레이블·빈 본문·드롭다운 감지) 통과');

console.log('--- Test Suite 13: Claude 최종 검토 반영 (본문 호칭 마스킹·웃음 밀도) 검증 ---');

// 13-1. 본문 속 화자 이름·호칭 변형(철수님·영희씨·유진아)이 마스킹된다
const kakaoStyleChat = [
  '--------------- 2026년 11월 14일 토요일 ---------------',
  '[오전 10:15] 김철수 : 안녕하세요 여러분! 철수님은 일정 공유할게요.',
  '[오전 10:18] 이영희 : 넵 영희씨도 준비할게요. 유진아 같이 해요!',
  '[오전 10:20] 최유진 : 좋아요 유진은 콘셉트 담당할게요 ㅋㅋ'
].join('\n');
const honorParsed = parseChatText(kakaoStyleChat, '김철수');
const allMaskedContent = honorParsed.messages.map(m => m.maskedContent).join(' | ');
assert(!/철수님|영희씨/.test(allMaskedContent), '호칭이 붙은 화자 이름이 본문에 잔류하면 안 됩니다.');
assert(allMaskedContent.includes('나(화자A)은') || allMaskedContent.includes('나(화자A)는') || !allMaskedContent.includes('철수'), '본인 이름도 마스킹되어야 합니다.');
assert(!allMaskedContent.includes('영희') || allMaskedContent.includes('화자B'), '상대 이름은 화자 라벨로 치환되어야 합니다.');
assert(allMaskedContent.includes('콘셉트'), '일반 단어는 보존되어야 합니다.');

// 13-2. 웃음 밀도: 일반 음절 '하'(안녕하세요)는 웃음으로 세지 않는다
const plainOnly = calculateMetrics([{ maskedContent: '안녕하세요 반갑습니다', isTarget: true, date: 'd', hour: 10, minute: 0 }]);
assert.strictEqual(Number(plainOnly.laughDensity), 0, '안녕하세요의 하·호는 웃음으로 세지 않아야 합니다.');
const laughOnly = calculateMetrics([{ maskedContent: 'ㅋㅋㅋ 하하 진짜 웃겨', isTarget: true, date: 'd', hour: 10, minute: 0 }]);
assert(Number(laughOnly.laughDensity) > 0, 'ㅋㅋ·하하는 웃음으로 세어야 합니다.');

console.log('PASS: Claude 최종 검토 반영 (본문 호칭 마스킹·웃음 밀도) 통과');

console.log('--- Test Suite 14: Codex 자문 반영 (반복 문장·부정문·부분문자열·근거 부족 단정 금지) 검증 ---');

const mkMsg = (content, i) => ({
  maskedContent: content,
  isTarget: true,
  date: '2026-11-14',
  hour: 10,
  minute: 10 + i
});

// 14-1. 반복 문장: 같은 문장 3회는 근거 1회분만 누적된다
const once = scoreMBTI([mkMsg('혼자 조용히 쉬자', 0)], calculateMetrics([mkMsg('혼자 조용히 쉬자', 0)]));
const thriceMsgs = [mkMsg('혼자 조용히 쉬자', 0), mkMsg('혼자 조용히 쉬자', 1), mkMsg('혼자 조용히 쉬자', 2)];
const thrice = scoreMBTI(thriceMsgs, calculateMetrics(thriceMsgs));
assert.strictEqual(thrice.scores.I, once.scores.I, '동일 문장 반복은 I 근거를 증가시키지 않아야 합니다.');
assert(thrice.scores.I > 0, '정상 문장은 1회 채택되어야 합니다.');

// 14-2. 부정문: '계획은 싫어'류 문장은 J 근거로 채택되지 않는다
const negMsgs = [mkMsg('계획은 싫어. 미리 정리하는 것도 싫어.', 0), mkMsg('계획은 싫어. 미리 정리하는 것도 싫어.', 1), mkMsg('계획은 싫어. 미리 정리하는 것도 싫어.', 2)];
const neg = scoreMBTI(negMsgs, calculateMetrics(negMsgs));
assert.strictEqual(neg.scores.J, 0, '부정문의 계획·정리 키워드가 J 근거로 채택되어서는 안 됩니다.');

// 14-3. 부분문자열: '편집' 안의 '집'은 내향 근거가 아니다
const editMsgs = [mkMsg('편집 완료', 0), mkMsg('편집 완료', 1), mkMsg('편집 완료', 2)];
const editScore = scoreMBTI(editMsgs, calculateMetrics(editMsgs));
assert.strictEqual(editScore.scores.I, 0, "'편집'의 '집'이 내향 근거로 인식되어서는 안 됩니다.");

// 14-4. 근거 부족 시 유료 심층 해석이 방향을 단정하지 않는다
const tinyMsgs = [mkMsg('ㅋ', 0)];
const lackMbti = scoreMBTI(tinyMsgs.filter(m => m.isTarget), calculateMetrics(tinyMsgs));
const deepBox = createMockElement('deepBoxR6');
renderDeepMbtiAnalysis(deepBox, lackMbti);
if (lackMbti.isLack) {
  assert(deepBox.innerHTML.includes('판단 보류'), '근거 부족 축은 판단 보류로 표시되어야 합니다.');
  assert(!deepBox.innerHTML.includes('우세,'), '근거 부족 축에 우세 방향을 단정하지 않아야 합니다.');
}

console.log('PASS: Codex 자문 반영 (반복 문장·부정문·부분문자열·근거 부족 단정 금지) 통과');

console.log('\n모든 노드 내장 테스트 통과 완료 (ALL TESTS PASSED)');

console.log('--- Test Suite 15: v2 명식 계산·TCI·3소스 융합 (KASI 검증) 검증 ---');

const { calcPillars, tenGod, tciScore, TCI_QUESTIONS } = sandbox;
assert(typeof calcPillars === 'function', 'calcPillars가 로드되지 않았습니다.');

// 15-1. KASI 검증 앵커: 2026-11-25 = 丙午年 己亥月 癸卯日 (한국천문연구원 월별 음양력)
const p1 = calcPillars(2026, 11, 25, 12, false);
assert.strictEqual(p1.year.gan + p1.year.ji, '丙午', '년주는 丙午여야 합니다(KASI 2026년 병오년).');
assert.strictEqual(p1.month.gan + p1.month.ji, '己亥', '11월 월주는 己亥여야 합니다(KASI 2026-11).');
assert.strictEqual(p1.day.gan + p1.day.ji, '癸卯', '2026-11-25 일주는 癸卯여야 합니다(KASI).');
assert.strictEqual(p1.ruleVersion, 'v2-approx', 'ruleVersion이 기록되어야 합니다.');

// 15-2. 입춘 연도 경계: 2026-01-20은 입춘 전 → 년주는 이전 해 乙巳
const p2 = calcPillars(2026, 1, 20, 12, false);
assert.strictEqual(p2.year.gan + p2.year.ji, '乙巳', '입춘 전 출생은 이전 해의 년주를 써야 합니다.');

// 15-3. 시간 모름 → 시주 null
const p3 = calcPillars(2026, 11, 25, null, true);
assert.strictEqual(p3.hour, null, '시간 모름이면 시주는 제외( null )되어야 합니다.');

// 15-4. 십성: 甲 기준 검증
assert.strictEqual(tenGod(0, 1), '겁재', '甲-乙은 겁재여야 합니다.');
assert.strictEqual(tenGod(0, 2), '식신', '甲-丙은 식신이어야 합니다.');
assert.strictEqual(tenGod(0, 4), '편재', '甲-戊은 편재여야 합니다.');
assert.strictEqual(tenGod(0, 6), '편관', '甲-庚은 편관이어야 합니다.');
assert.strictEqual(tenGod(0, 8), '편인', '甲-壬은 편인이어야 합니다.');
assert.strictEqual(tenGod(0, 9), '정인', '甲-癸은 정인이어야 합니다.');

// 15-5. TCI 채점: 영역별 평균·라벨
const tciOut = tciScore([5, 4, 1, 1, 3, 3, 4, 4, 3, 3, 3, 3]);
assert(tciOut['새로움 추구'].score > 3, '새로움 추구는 높게 나와야 합니다.');
assert.strictEqual(tciOut['위험 회피'].label, '낮음', '위험 회피 1점 응답은 낮음이어야 합니다.');
assert.strictEqual(Object.keys(tciOut).length, 6, 'TCI는 6영역이어야 합니다.');

// 15-6. 문항 수: 12문항·6영역×2
assert.strictEqual(TCI_QUESTIONS.length, 12, 'TCI 문항은 12개여야 합니다.');

console.log('PASS: v2 명식 계산·TCI·3소스 융합 (KASI 검증) 통과');

console.log('\n모든 노드 내장 테스트 통과 완료 (ALL TESTS PASSED)');

console.log('--- Test Suite 16: 멘탈제갈량 리포트 (페르소나·용어 해설·단계 구성) 검증 ---');

const { buildJegalReport, JEGAL_GLOSSARY } = sandbox;
assert(typeof buildJegalReport === 'function', 'buildJegalReport가 로드되지 않았습니다.');

const pSaju = sandbox.calcPillars(1990, 5, 15, 14, false);
const summary = { pillars: pSaju, elCount: { "木": 2, "火": 1, "土": 2, "金": 1, "水": 2 }, tenGods: ["비견", "편관", "편인", "편재"], groupCount: { "비겁": 1, "관성": 1, "인성": 1, "재성": 1 } };
const sections = buildJegalReport(summary, null, null);
assert(sections.length >= 6, `제갈량 리포트는 6단계 이상이어야 합니다(현재 ${sections.length}).`);

// 용어 해설: '쉽게 말해서' 문구가 리포트 전체에 1회 이상 존재
const allHtml = sections.map(x => x.html).join("");
assert(allHtml.includes("쉽게 말해서"), "명리 용어에 '쉽게 말해서' 해설이 포함되어야 합니다.");
assert(Object.keys(JEGAL_GLOSSARY).length >= 8, "용어 해설 사전이 8개 이상이어야 합니다.");

// 한계 고지: 운세 확정·진단 아님 고지 포함
assert(allHtml.includes("한계 고지"), "한계 고지가 포함되어야 합니다.");
assert(allHtml.includes("운세 확정이 아니며") || allHtml.includes("운세 확정이 아니"), "운세 확정 부정 고지가 있어야 합니다.");

// 슬롯 방지: 확정형 금지어('반드시 ~한다' 운명 단정) 미사용
assert(!/운명이 정해져/.test(allHtml), "운명 단정 표현을 쓰지 않아야 합니다.");

// 대화 분석 포함 시 4단계 대조절 추가
const withMbti = buildJegalReport(summary, { axisEI: { isLack: false, dominant: "E", validQuotes: 3 }, axisSN: { isLack: false, dominant: "S", validQuotes: 2 }, axisTF: { isLack: false, dominant: "T", validQuotes: 4 }, axisJP: { isLack: false, dominant: "J", validQuotes: 2 } }, null);
const hasContrast = withMbti.some(x => x.title.includes("대조"));
assert(hasContrast, "대화 분석이 있으면 대조 절이 추가되어야 합니다.");
assert(withMbti.length === sections.length + 1, "대조 절 추가로 단계 수가 늘어나야 합니다.");

console.log('PASS: 멘탈제갈량 리포트 (페르소나·용어 해설·단계 구성) 통과');

console.log('\n모든 노드 내장 테스트 통과 완료 (ALL TESTS PASSED)');
