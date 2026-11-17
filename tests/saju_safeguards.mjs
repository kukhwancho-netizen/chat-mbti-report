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


const call = src => vm.runInContext(src, sandbox);
assert.throws(() => call('calcPillars(2024,2,30,12,false)'), /양력/);
assert.throws(() => call('calcPillars(2024,2,1,24,false)'), /시각/);
const t=call('findTermKST(2024,2)');
assert.throws(() => call(`calcPillars(2024,2,${t.day},null,true)`), /입절일/);
assert.throws(() => call(`calcPillars(2024,2,${t.day},${t.hour},false,${t.minute})`), /10분/);
const before=call(`calcPillars(2024,2,${t.day},${t.hour-1},false,${t.minute})`);
const after=call(`calcPillars(2024,2,${t.day},${t.hour+1},false,${t.minute})`);
assert.notEqual(before.year.gz,after.year.gz);
assert.notEqual(before.month.gz,after.month.gz);
const unknown=call('calcPillars(1990,1,1,null,true)');assert.equal(unknown.hour,null);
assert.equal(call('calcDaewun(calcPillars(1990,1,1,null,true),1990,1,1,"M",null,0)'),null);
assert.equal(call('sajuSummary(calcPillars(1990,1,1,12,false)).tenGods[2]'),'일간(기준)');
assert.equal(call('Object.values(sajuSummary(calcPillars(1990,1,1,12,false)).groupCount).reduce((a,b)=>a+b,0)'),3);
assert.match(call('elementCountReading({elCount:{木:2,火:2,土:2,金:1,水:1}})'),/木·火·土.*공동 최다/);
assert.doesNotMatch(call('JSON.stringify(buildJegalReport(sajuSummary(calcPillars(1990,1,1,12,false)),null,null))'),/몸 관리|서로를 뒷받침|가장 발달한/);
assert.match(html,/AI 프롬프트가 아닌/);
console.log('PASS: saju validation, term uncertainty, unknown time, reference stem, ties, non-diagnostic interpretation (13 checks)');
call('v2State.saju=sajuSummary(calcPillars(1990,1,1,12,false)); jegalState.sections=[{title:"old"}]; document.getElementById("sajuResult").innerHTML="old"; invalidateBirthResults()');
assert.equal(call('v2State.saju'),null);
assert.equal(call('jegalState.sections'),null);
assert.equal(domElements.get('sajuResult').innerHTML,'');
assert.equal(domElements.get('reportSection').style.display,'none');
console.log('PASS: changed birth input invalidates stale chart/report (4 checks)');
