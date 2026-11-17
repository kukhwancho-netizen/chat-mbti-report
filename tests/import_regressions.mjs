import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html = fs.readFileSync('index.html','utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const elements = new Map(), alerts = [], listeners = new Map();
function element(id='') { if(!elements.has(id)) elements.set(id,{id,value:'',style:{},classList:{add(){},remove(){}},addEventListener(n,f){listeners.set(id+':'+n,f)},children:[],appendChild(c){this.children.push(c)},removeChild(){},scrollIntoView(){},innerHTML:'',textContent:''});return elements.get(id); }
const s = {console,document:{getElementById:element,createElement:tag=>element(tag+Math.random()),body:element('body')},localStorage:{getItem(){return null},setItem(){},removeItem(){}},alert:m=>alerts.push(m), FileReader:class {readAsText(file){this.onload({target:{result:file.content}})}}};
vm.createContext(s);vm.runInContext(script,s);
for (const input of [
 '\uFEFF화자,내용\r\n민준,"안녕, 잘 지내?"\r\n지혜,"응 ""좋아"""\r\n',
 'speaker,message\n민준,"첫 줄\n둘째 줄"\n지혜,답장',
 'Date,User,Message\n2026-11-17,민준,안녕\n2026-11-17,지혜,반가워',
 '민준,안녕\n지혜,반가워']) {
 const converted=s.csvToChatText(input);assert.ok(converted);const p=s.parseChatText(converted,'민준');assert.equal(p.messages.length,2);assert.equal(p.messages[0].maskedSpeaker,'나(화자A)');
}
assert.ok(s.csvToChatText('이름,내용\n민준,"안녕, 친구"\n지혜,"응 ""좋아"""').includes('안녕, 친구'));
assert.ok(s.csvToChatText('이름,내용\n민준,"안녕, 친구"\n지혜,"응 ""좋아"""').includes('응 "좋아"'));
for(const bad of ['화자,내용\n민준,"끝나지 않음','speaker,message\n민준,안녕,extra\n지혜,반가워','이름,나이\n민준,20\n지혜,30']) assert.equal(s.csvToChatText(bad),null);
const cases=[['dialogue.csv','text/csv','speaker,message\n민준,이번 주 계획을 정리하자\n지혜,좋아 만나서 이야기하자'],['chat.txt','text/plain','사용자: 다음 계획을 함께 정리해 줘\nChatGPT: 어떤 부분부터 정리할까요?']];
for(const [name,type,content] of cases){
 const file={name,type,size:content.length,content};assert.equal(s.validateChatFile(file).ok,true);
 listeners.get('chatFileInput:change')({target:{files:[file]}});
 const value=element('rawChatInput').value;assert.ok(value.length);const p=s.parseChatText(value,name.endsWith('csv')?'민준':'사용자');assert.equal(p.messages.length,2);assert.ok(element('speakerSelect').children.some(c=>c.value===(name.endsWith('csv')?'민준':'사용자')));
}
assert.equal(alerts.length,0);assert.equal(s.validateChatFile({name:'x.html',type:'text/html',size:5}).ok,false);
assert.equal(s.validateChatFile({name:'x.csv',type:'text/csv',size:0}).ok,false);
assert.equal(s.validateChatFile({name:'x.csv',type:'text/csv',size:1048577}).ok,false);
assert.match(html,/<input type="file" id="chatFileInput"[^>]*aria-label=/);
assert.doesNotMatch(html.match(/<input type="file" id="chatFileInput"[^>]*>/)[0],/display:\s*none/);
console.log('PASS: import parser + actual change/FileReader/textarea/speaker pipeline (synthetic TXT and CSV)');
