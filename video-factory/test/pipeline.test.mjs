import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSnapshot, fallbackScript, normalizeForComparison, similarity, validateScript } from '../src/pipeline.ts';

const project={id:'1cc543ff648e',name:'Phone Loops',nameZh:'手机挂绳品牌',revenue:'$1.5M/Year',summary:'用手机挂绳解决单手握持问题。',businessModel:'独立站销售自有品牌产品。',insight:'高频微小需求可以形成品牌。',businessLoop:'内容引流到独立站成交，再通过新品促进复购。',chinaOpportunity:'先针对特定场景做小批量付费验证。',url:'https://example.com/source',image:'https://example.com/a.jpg'};
const article={keyFacts:[{label:'覆盖国家',value:'100+'}],media:[1,2,3,4,5].map((n)=>({type:'image',url:`https://example.com/${n}.jpg`,caption:`素材${n}`})),source:{name:'Source',url:'https://example.com/source'}};

test('buildSnapshot keeps evidence and media',()=>{const snapshot=buildSnapshot(project,article,'2026-07-31T00:00:00Z');assert.equal(snapshot.caseId,project.id);assert.ok(snapshot.facts.length>=5);assert.equal(snapshot.media.length,5)});
test('fallback script passes grounding validation',()=>{const snapshot=buildSnapshot(project,article);const script=fallbackScript(snapshot);const result=validateScript(script,snapshot);assert.equal(result.ok,true,result.errors.join('\n'));assert.equal(script.beats.length,8)});
test('similarity tolerates punctuation',()=>{assert.equal(normalizeForComparison('你好，世界。'),'你好世界');assert.ok(similarity('这是一个真实案例。','这是一个真实案例')>.99)});
test('youtube embeds become real project thumbnails',()=>{const snapshot=buildSnapshot(project,{...article,media:[{type:'video',url:'https://www.youtube.com/embed/dt24DresEbE',caption:'产品演示'}]});assert.equal(snapshot.media[0].type,'image');assert.equal(snapshot.media[0].url,'https://i.ytimg.com/vi/dt24DresEbE/maxresdefault.jpg');assert.equal(snapshot.media[0].sourceUrl,'https://www.youtube.com/embed/dt24DresEbE')});
