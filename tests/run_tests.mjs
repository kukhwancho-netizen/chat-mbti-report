import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert';

// 1. index.html에서 스크립트 추출 및 순수 로직 샌드박스 평가
const html = fs.readFileSync('index.html', 'utf-8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) {
  throw new Error('index.html 내에서 <script> 태그를 찾을 수 없습니다.');
}

const createMockElement = () => ({
  addEventListener: () => {},
  appendChild: () => {},
  removeChild: () => {},
  style: {},
  classList: { add: () => {}, remove: () => {} },
  value: '',
  textContent: '',
  innerHTML: '',
  scrollIntoView: () => {}
});

const sandbox = {
  console,
  document: {
    getElementById: () => createMockElement(),
    createElement: () => createMockElement(),
    body: createMockElement()
  },
  alert: () => {}
};

vm.createContext(sandbox);
vm.runInContext(scriptMatch[1], sandbox);

const { maskPII, parseChatText, calculateMetrics, scoreMBTI } = sandbox;

assert(typeof maskPII === 'function', 'maskPII 함수가 로드되지 않았습니다.');
assert(typeof parseChatText === 'function', 'parseChatText 함수가 로드되지 않았습니다.');
assert(typeof calculateMetrics === 'function', 'calculateMetrics 함수가 로드되지 않았습니다.');
assert(typeof scoreMBTI === 'function', 'scoreMBTI 함수가 로드되지 않았습니다.');

console.log('--- Test Suite 1: P1-3 PII 마스킹 확장 및 오탐 방지 검증 ---');

// 하이픈 없는 8~14자리 계좌
assert.strictEqual(maskPII('계좌: 1234567890'), '계좌: [계좌번호 마스킹]');
assert.strictEqual(maskPII('입금 1234567890'), '입금 [계좌번호 마스킹]');
assert.strictEqual(maskPII('신한 1234567890'), '신한 [계좌번호 마스킹]');
assert.strictEqual(maskPII('1234567890로 입금해주세요'), '[계좌번호 마스킹]로 입금해주세요');
assert.strictEqual(maskPII('1234567890'), '[계좌번호 마스킹]');

// 점/슬래시/공백 구분 계좌
assert.strictEqual(maskPII('우리은행 1234.56.7890123'), '우리은행 [계좌번호 마스킹]');
assert.strictEqual(maskPII('1234.56.7890123'), '[계좌번호 마스킹]');
assert.strictEqual(maskPII('국민은행 123-45-678901'), '국민은행 [계좌번호 마스킹]');
assert.strictEqual(maskPII('카카오뱅크 3333-01-2345678'), '카카오뱅크 [계좌번호 마스킹]');
assert.strictEqual(maskPII('123/45/678901'), '[계좌번호 마스킹]');

// 국제전화(+82, 070 포함 변형)
assert.strictEqual(maskPII('+82 10 1234 5678'), '[전화번호 마스킹]');
assert.strictEqual(maskPII('+82-10-1234-5678'), '[전화번호 마스킹]');
assert.strictEqual(maskPII('+821012345678'), '[전화번호 마스킹]');
assert.strictEqual(maskPII('0082-10-1234-5678'), '[전화번호 마스킹]');
assert.strictEqual(maskPII('070-1234-5678'), '[전화번호 마스킹]');
assert.strictEqual(maskPII('07012345678'), '[전화번호 마스킹]');

// 하이픈 없는 11자리 휴대번호
assert.strictEqual(maskPII('01012345678'), '[전화번호 마스킹]');
assert.strictEqual(maskPII('010-9876-5432'), '[전화번호 마스킹]');

// 이메일 마스킹
assert.strictEqual(maskPII('minsu.park@example.com'), '[이메일 마스킹]');

// 오탐(일반 숫자·날짜·금액·시간) 방지
assert.strictEqual(maskPII('정확히 48,500원이었어요.'), '정확히 48,500원이었어요.');
assert.strictEqual(maskPII('회비 50,000원'), '회비 50,000원');
assert.strictEqual(maskPII('간식비 1만원'), '간식비 1만원');
assert.strictEqual(maskPII('2026년 11월 14일 토요일'), '2026년 11월 14일 토요일');
assert.strictEqual(maskPII('일정 2026-11-14 입니다'), '일정 2026-11-14 입니다');
assert.strictEqual(maskPII('날짜 2026.11.14 확인'), '날짜 2026.11.14 확인');
assert.strictEqual(maskPII('오늘 오후 6시까지 확정'), '오늘 오후 6시까지 확정');
assert.strictEqual(maskPII('10시 기획회의 시작'), '10시 기획회의 시작');
console.log('PASS: P1-3 마스킹 및 오탐 방지 검증 통과');

console.log('--- Test Suite 2: P1-1 & P1-2 원문 비보존 및 실명 은닉 검증 ---');
const sampleChat = `--------------- 2026년 11월 14일 토요일 ---------------
[오전 10:15] 김철수 : 안녕하세요 여러분!
[오전 10:18] 이영희 : 철수님 안녕하세요~
[오전 10:20] 박민수 : 제 계좌번호는 1234567890 입니다.`;

const parsed = parseChatText(sampleChat, '김철수');
assert(parsed, '파싱 결과가 존재해야 합니다.');
assert.strictEqual(parsed.targetSpeaker, '나(화자A)');
assert.strictEqual(parsed.messages.length, 3);

// 원문 content 및 rawSpeaker 미보존 단언
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
// 시간 역행(23:50 -> 00:10) 시 가상 일자 증가로 날짜 구분
assert.notStrictEqual(parsedVaried.messages[1].date, parsedVaried.messages[2].date, '시간 역행 시 같은 날짜로 오염되지 않아야 합니다.');

const metricsVaried = calculateMetrics(parsedVaried.messages);
// 23:50에서 00:10으로 역행했을 때 응답지연 계산에 음수나 1400분이 들어가지 않아야 함
assert(metricsVaried.avgLatency === null || metricsVaried.avgLatency >= 0, '응답 지연이 음수가 아니어야 합니다.');
console.log('PASS: P2-4 날짜선 인식 및 시간 역행 방어 통과');

console.log('--- Test Suite 4: P2-5 화자명에 콜론 포함 파싱 ---');
const colonSpeakerChat = `--------------- 2026년 11월 14일 토요일 ---------------
[오전 10:15] 팀장:김철수 : 안녕하세요 여러분!
[오전 10:18] Dr:Kim : 반갑습니다. 회의 안건 공유합니다.`;

const parsedColon = parseChatText(colonSpeakerChat, '팀장:김철수');
assert.strictEqual(parsedColon.messages[0].maskedSpeaker, '나(화자A)');
assert.strictEqual(parsedColon.messages[0].maskedContent, '안녕하세요 여러분!');
assert.strictEqual(parsedColon.messages[1].maskedSpeaker, '화자B');
assert.strictEqual(parsedColon.messages[1].maskedContent, '반갑습니다. 회의 안건 공유합니다.');
console.log('PASS: P2-5 화자명 콜론 포함 파싱 통과');

console.log('--- Test Suite 5: P2-6 대화 상대/회신 쌍 부재 시 근거 부족 처리 ---');
const soloChat = `--------------- 2026년 11월 14일 토요일 ---------------
[오전 10:15] 나홀로 : 혼자 생각 정리하기
[오전 10:30] 나홀로 : 계획을 세워보자 시간표 작성`;

const parsedSolo = parseChatText(soloChat, '나홀로');
const metricsSolo = calculateMetrics(parsedSolo.messages);

assert.strictEqual(metricsSolo.hasInitiateRate, false, '1인 대화에서는 개시율이 유효하지 않아야 합니다.');
assert.strictEqual(metricsSolo.initiateRateDisplay, '근거 부족');
assert.strictEqual(metricsSolo.hasAvgLatency, false, '회신 쌍이 없으면 응답지연이 유효하지 않아야 합니다.');
assert.strictEqual(metricsSolo.avgLatencyDisplay, '근거 부족');

const targetSoloMsgs = parsedSolo.messages.filter(m => m.isTarget);
const mbtiWithoutPartner = scoreMBTI(targetSoloMsgs, metricsSolo);
const mbtiWithPartner = scoreMBTI(targetSoloMsgs, { ...metricsSolo, hasInitiateRate: true, initiateRate: 100, hasAvgLatency: true, avgLatency: 1 });

// 개시율 및 응답지연이 E/J 가중치로 가산되지 않았는지 비교 검증
assert.strictEqual(mbtiWithPartner.scores.E - mbtiWithoutPartner.scores.E, 2, '유효 파트너가 있을 때만 개시율 보정이 반영되어야 합니다.');
assert.strictEqual(mbtiWithPartner.scores.J - mbtiWithoutPartner.scores.J, 1, '유효 회신 쌍이 있을 때만 응답지연 보정이 반영되어야 합니다.');
console.log('PASS: P2-6 대화 상대 및 회신 쌍 부재 시 근거 부족 통과');

console.log('--- Test Suite 6: P2-7 신뢰도 산식 개선 검증 ---');
// 격차가 큰 경우 vs 격차가 작은 경우 신뢰도 비교
const targetSampleMsgs = [
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

const scoredDominant = scoreMBTI(targetSampleMsgs, mockMetrics);
// J 성향이 압도적(100:0)으로 높은 경우
assert(scoredDominant.axisJP.dominant === 'J');
assert(scoredDominant.axisJP.confidence >= 75, `우세한 격차일 때 높은 신뢰도를 가져야 합니다: ${scoredDominant.axisJP.confidence}`);

// 팽팽한 동점 또는 적은 근거의 경우 신뢰도 낮음 검증
const balancedMsgs = [
  { maskedContent: '계획 일정', isTarget: true },
  { maskedContent: '즉흥 유연 자유', isTarget: true }
];
const scoredBalanced = scoreMBTI(balancedMsgs, { ...mockMetrics, hasAvgLatency: false });
assert(scoredBalanced.axisJP.confidence < scoredDominant.axisJP.confidence, '격차가 작거나 근거가 적을 때 신뢰도가 더 낮아야 합니다.');

console.log('PASS: P2-7 신뢰도 산식 개선 검증 통과');
console.log('\n모든 노드 내장 테스트 통과 완료 (ALL TESTS PASSED)');
