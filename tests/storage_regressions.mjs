// tests/storage_regressions.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const htmlPath = path.resolve(process.cwd(), "index.html");
const html = fs.readFileSync(htmlPath, "utf8");
const startMarker = "/* JPJG_STORE_START */";
const endMarker = "/* JPJG_STORE_END */";
const startIdx = html.indexOf(startMarker);
const endIdx = html.indexOf(endMarker);

assert.ok(startIdx !== -1 && endIdx !== -1 && endIdx > startIdx, "JPJG_STORE 마커 구간이 index.html에 존재해야 합니다.");
const moduleCode = html.slice(startIdx, endIdx + endMarker.length);

function createMockEnv() {
  const store = new Map();
  let throwOnSet = false;

  const localStorage = {
    getItem(k) {
      return store.has(k) ? store.get(k) : null;
    },
    setItem(k, v) {
      if (throwOnSet) {
        const err = new Error("QuotaExceededError");
        err.name = "QuotaExceededError";
        throw err;
      }
      store.set(String(k), String(v));
    },
    removeItem(k) {
      store.delete(String(k));
    },
    clear() {
      store.clear();
    }
  };

  function makeEl(id) {
    const listeners = {};
    return {
      id,
      checked: false,
      disabled: false,
      value: "",
      textContent: "",
      style: {},
      addEventListener(type, fn) {
        listeners[type] = listeners[type] || [];
        listeners[type].push(fn);
      },
      dispatch(type) {
        (listeners[type] || []).forEach((fn) => fn());
      }
    };
  }

  const elements = new Map();
  for (const id of [
    "jpjgConsentSave",
    "jpjgConsentBirth",
    "jpjgClearSaju",
    "jpjgClearTci",
    "jpjgClearMbti",
    "jpjgClearAll",
    "jpjgStatus",
    "jpjgRestoredSaju",
    "jpjgRestoredMbti",
    "v2BirthDate",
    "v2BirthTime",
    "v2NoTime",
    "v2Gender"
  ]) {
    elements.set(id, makeEl(id));
  }
  elements.get("jpjgConsentBirth").disabled = true;

  const radios = new Map();
  const document = {
    readyState: "complete",
    addEventListener() {},
    getElementById(id) {
      return elements.get(id) || null;
    },
    querySelector(sel) {
      const checkedMatch = sel.match(/^input\[name="(tciq\d+)"\]:checked$/);
      if (checkedMatch) {
        const val = radios.get(checkedMatch[1]);
        return val !== undefined ? { value: String(val), checked: true } : null;
      }
      const valMatch = sel.match(/^input\[name="(tciq\d+)"\]\[value="(\d+)"\]$/);
      if (valMatch) {
        const name = valMatch[1];
        const val = Number(valMatch[2]);
        return {
          set checked(v) {
            if (v) radios.set(name, val);
          }
        };
      }
      return null;
    }
  };

  const v2State = { saju: null, tci: null, mbti: null, daewun: null, birthY: null };
  const ctx = vm.createContext({
    localStorage,
    document,
    v2State,
    console,
    calcSajuFromInputs: () => {},
    submitTci: () => {}
  });
  vm.runInContext(moduleCode, ctx);

  return {
    ctx,
    store,
    elements,
    radios,
    setThrowOnSet(flag) {
      throwOnSet = flag;
    }
  };
}

function makeSampleState() {
  return {
    saju: { dayMaster: "갑목", strength: "신강" },
    daewun: { startAge: 5, list: ["을해", "병자"] },
    birthY: 1995,
    tci: { 자극추구: { score: 14, label: "높음" } },
    mbti: {
      mbtiType: "INTJ",
      rawType: "INTJ",
      isLack: false,
      scores: { E: 12, I: 38 },
      axisEI: {
        leftKey: "E",
        rightKey: "I",
        leftScore: 12,
        rightScore: 38,
        leftRatio: 24,
        rightRatio: 76,
        dominant: "I",
        isLack: false,
        confidence: "높음",
        validQuotes: [{ sentence: "합성테스트문장ABC", hits: ["혼자"], weight: 2 }],
        bestQuote: { sentence: "합성테스트문장ABC", hits: ["합성테스트문장ABC"], weight: 5 }
      },
      axisSN: { leftKey: "S", rightKey: "N", leftRatio: 30, rightRatio: 70, dominant: "N", isLack: false, confidence: "높음", bestQuote: { sentence: "합성테스트문장ABC", hits: [], weight: 1 } },
      axisTF: { leftKey: "T", rightKey: "F", leftRatio: 65, rightRatio: 35, dominant: "T", isLack: false, confidence: "보통", bestQuote: { sentence: "합성테스트문장ABC", hits: [], weight: 1 } },
      axisJP: { leftKey: "J", rightKey: "P", leftRatio: 60, rightRatio: 40, dominant: "J", isLack: false, confidence: "보통", bestQuote: { sentence: "합성테스트문장ABC", hits: [], weight: 1 } }
    }
  };
}

// 1. 기본 꺼짐이면 저장 안 됨
{
  const env = createMockEnv();
  Object.assign(env.ctx.v2State, makeSampleState());
  const saved = env.ctx.jpjgSave();
  assert.equal(saved, false);
  assert.equal(env.store.get("jpjg_v1_state"), undefined);
}

// 2. 동의 후 직렬화에 합성 문장 "합성테스트문장ABC", bestQuote, scores(MBTI) 없음
{
  const env = createMockEnv();
  const sample = makeSampleState();
  Object.assign(env.ctx.v2State, sample);
  for (let i = 0; i < 12; i++) env.radios.set("tciq" + i, 3);

  const pureOut = env.ctx.jpjgSerialize(sample, { save: true, birthInput: false }, { tciAnswers: Array(12).fill(3) });
  assert.equal(env.store.size, 0, "jpjgSerialize는 부수효과가 없어야 함");
  assert.equal(pureOut.mbti.scores, undefined);
  assert.equal(pureOut.mbti.axes.EI.bestQuote, undefined);
  assert.ok(!JSON.stringify(pureOut).includes("합성테스트문장ABC"));

  env.elements.get("jpjgConsentSave").checked = true;
  assert.equal(env.ctx.jpjgSave(), true);

  const raw = env.store.get("jpjg_v1_state");
  assert.ok(raw, "동의 후 저장되어야 함");
  assert.ok(!raw.includes("합성테스트문장ABC"), "대화 원문 합성 문장이 저장되면 안 됨");
  assert.ok(!raw.includes("bestQuote"), "bestQuote 키가 저장되면 안 됨");
  assert.ok(!raw.includes("validQuotes"), "validQuotes 키가 저장되면 안 됨");
  const parsed = JSON.parse(raw);
  assert.equal(parsed.mbti.scores, undefined);
  assert.equal(parsed.mbti.mbtiType, "INTJ");
  assert.equal(parsed.mbti.axes.EI.dominant, "I");
  assert.equal(parsed.saju.input, undefined, "출생 정보 저장 미동의 시 input 미포함");
}

// 3. 엔진별 삭제
{
  const env = createMockEnv();
  Object.assign(env.ctx.v2State, makeSampleState());
  env.elements.get("jpjgConsentSave").checked = true;
  env.ctx.jpjgSave();

  env.ctx.jpjgClearEngine("saju");
  let parsed = JSON.parse(env.store.get("jpjg_v1_state"));
  assert.equal(parsed.saju, null);
  assert.notEqual(parsed.tci, null);
  assert.notEqual(parsed.mbti, null);

  env.ctx.jpjgClearEngine("tci");
  parsed = JSON.parse(env.store.get("jpjg_v1_state"));
  assert.equal(parsed.tci, null);
  assert.notEqual(parsed.mbti, null);

  env.ctx.jpjgClearEngine("mbti");
  parsed = JSON.parse(env.store.get("jpjg_v1_state"));
  assert.equal(parsed.mbti, null);
}

// 4. 전체 삭제 후 결제 키 jegal_premium_token 유지
{
  const env = createMockEnv();
  env.store.set("jegal_premium_token", "premium_valid_token_999");
  Object.assign(env.ctx.v2State, makeSampleState());
  env.elements.get("jpjgConsentSave").checked = true;
  env.ctx.jpjgSave();

  env.ctx.jpjgClearAll();
  assert.equal(env.store.get("jpjg_v1_state"), undefined);
  assert.equal(env.store.get("jegal_premium_token"), "premium_valid_token_999");
}

// 5. setItem 예외에도 jpjgSave가 던지지 않음
{
  const env = createMockEnv();
  Object.assign(env.ctx.v2State, makeSampleState());
  env.elements.get("jpjgConsentSave").checked = true;
  env.setThrowOnSet(true);

  let ok = true;
  assert.doesNotThrow(() => {
    ok = env.ctx.jpjgSave();
  });
  assert.equal(ok, false);
  assert.equal(
    env.elements.get("jpjgStatus").textContent,
    "저장하지 못했습니다. 이번 분석은 계속 사용할 수 있습니다."
  );
}

// 6. 스키마·엔진버전 불일치 폐기 및 MBTI 복원 시 v2State.mbti 미주입 확인
{
  const env = createMockEnv();
  env.store.set("jpjg_v1_state", JSON.stringify({
    schemaVersion: 999,
    engineVersion: "v2.1-termlong",
    consent: { save: true, birthInput: false }
  }));
  const resSchema = env.ctx.jpjgLoad();
  assert.equal(resSchema.ok, false);
  assert.ok(resSchema.message.length > 0);
  assert.equal(env.store.get("jpjg_v1_state"), undefined);

  env.store.set("jpjg_v1_state", JSON.stringify({
    schemaVersion: 1,
    engineVersion: "v1.0-legacy",
    consent: { save: true, birthInput: false }
  }));
  const resEngine = env.ctx.jpjgLoad();
  assert.equal(resEngine.ok, false);
  assert.ok(resEngine.message.length > 0);
  assert.equal(env.store.get("jpjg_v1_state"), undefined);

  env.store.set("jpjg_v1_state", JSON.stringify({
    schemaVersion: 1,
    engineVersion: "v2.1-termlong",
    savedAt: "2026-11-19T00:00:00.000Z",
    consent: { save: true, birthInput: false },
    saju: null,
    tci: null,
    mbti: {
      mbtiType: "INTJ",
      isLack: false,
      axes: {
        EI: { dominant: "I", leftRatio: 24, rightRatio: 76, confidence: "높음", isLack: false },
        SN: { dominant: "N", leftRatio: 30, rightRatio: 70, confidence: "높음", isLack: false },
        TF: { dominant: "T", leftRatio: 65, rightRatio: 35, confidence: "보통", isLack: false },
        JP: { dominant: "J", leftRatio: 60, rightRatio: 40, confidence: "보통", isLack: false }
      }
    }
  }));
  assert.equal(env.ctx.jpjgRestore(), true);
  assert.equal(env.ctx.v2State.mbti, null, "복원 시 v2State.mbti에 넣지 않아야 함");
  assert.ok(env.elements.get("jpjgRestoredMbti").textContent.includes("INTJ"));
}

// 7. 엔진별 삭제·전체 삭제 후 다른 엔진 저장 시 부활 방지 및 새 결과 시 재저장
{
  const env = createMockEnv();
  Object.assign(env.ctx.v2State, makeSampleState());
  for (let i = 0; i < 12; i++) env.radios.set("tciq" + i, 4);
  env.elements.get("jpjgConsentSave").checked = true;
  assert.equal(env.ctx.jpjgSave(), true);

  env.ctx.jpjgClearEngine("saju");
  env.ctx.jpjgSave("invalidEngine");
  env.ctx.jpjgSave("mbti");
  let parsed = JSON.parse(env.store.get("jpjg_v1_state"));
  assert.equal(parsed.saju, null);
  assert.notEqual(parsed.mbti, null);
  assert.notEqual(parsed.tci, null);

  env.ctx.jpjgSave("saju");
  parsed = JSON.parse(env.store.get("jpjg_v1_state"));
  assert.notEqual(parsed.saju, null);

  env.ctx.jpjgClearAll();
  assert.equal(env.store.get("jpjg_v1_state"), undefined);
  env.ctx.jpjgSave("mbti");
  parsed = JSON.parse(env.store.get("jpjg_v1_state"));
  assert.equal(parsed.saju, null);
  assert.equal(parsed.tci, null);
  assert.notEqual(parsed.mbti, null);
}

// 8. 동의 철회 후 재동의 시 저장 가능, silent 삭제 미억제, 복원 시 suppress 초기화
{
  const env = createMockEnv();
  Object.assign(env.ctx.v2State, makeSampleState());
  for (let i = 0; i < 12; i++) env.radios.set("tciq" + i, 3);
  const saveEl = env.elements.get("jpjgConsentSave");

  saveEl.checked = true;
  saveEl.dispatch("change");
  assert.ok(env.store.get("jpjg_v1_state"));

  saveEl.checked = false;
  saveEl.dispatch("change");
  assert.equal(env.store.get("jpjg_v1_state"), undefined);

  saveEl.checked = true;
  saveEl.dispatch("change");
  let parsed = JSON.parse(env.store.get("jpjg_v1_state"));
  assert.notEqual(parsed.saju, null);
  assert.notEqual(parsed.tci, null);
  assert.notEqual(parsed.mbti, null);

  env.ctx.jpjgClearEngine("saju", true);
  env.ctx.jpjgSave("mbti");
  parsed = JSON.parse(env.store.get("jpjg_v1_state"));
  assert.notEqual(parsed.saju, null);

  env.ctx.jpjgClearEngine("tci");
  assert.equal(env.ctx.jpjgRestore(), true);
  env.ctx.jpjgSave();
  parsed = JSON.parse(env.store.get("jpjg_v1_state"));
  assert.notEqual(parsed.tci, null);
}

console.log("ALL STORAGE REGRESSION TESTS PASSED");
