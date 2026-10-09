import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { ref, set, get, update, remove, serverTimestamp } from 'firebase/database';
import { makeState } from '../src/gartic/game.js';
const projectId='demo-secreto';
const env=await initializeTestEnvironment({projectId,database:{host:'127.0.0.1',port:9000,rules:await readFile('database.rules.json','utf8')}});
const db=(uid)=>env.authenticatedContext(uid).database();
const room='garticRooms/TEST';
const players={a:{name:'Ana',avatar:'🐸',index:0},b:{name:'Beto',avatar:'🐼',index:1},c:{name:'Cami',avatar:'🐧',index:2}};
async function fixture(mode='normal'){
 await env.clearDatabase();
 await assertSucceeds(set(ref(db('a'),room),{hostId:'a',players:{a:players.a},slots:{0:'a'},mode,settings:{maxPlayers:12,seconds:90},state:{phase:'lobby',match:'none',round:0}}));
 for(const uid of ['b','c'])await assertSucceeds(update(ref(db(uid),room),{['players/'+uid]:players[uid],['slots/'+players[uid].index]:uid}));
 for(const uid of ['a','b','c'])await assertSucceeds(set(ref(db(uid),'garticPresence/TEST/'+uid+'/tab'),true));
 const state=makeState(players,mode,90,'match',serverTimestamp());
 await assertSucceeds(set(ref(db('a'),room+'/state'),state));
 return (await get(ref(db('a'),room+'/state'))).val();
}
async function step(uid,round,type='text',content='Frase de '+uid){
 await assertSucceeds(set(ref(db(uid),'garticSteps/TEST/match/'+round+'/'+uid),{authorId:uid,order:round,type,content}));
}
async function ready(uid,round){
 await assertSucceeds(set(ref(db(uid),'garticReady/TEST/match/'+round+'/'+uid),true));
}
async function advance(state){
 const round=state.round+1;
 const next={...state,round,phase:round===state.count?'reveal':'playing',startedAt:serverTimestamp(),duration:round===state.count?0:state.duration};
 await assertSucceeds(set(ref(db('b'),room+'/state'),next));
 return (await get(ref(db('b'),room+'/state'))).val();
}
test('las reglas aíslan frases, dibujos y colecciones completas hasta la revelación',async()=>{
 let s=await fixture();
 for(const uid of ['a','b','c']){await step(uid,0);await ready(uid,0);}
 await assertSucceeds(get(ref(db('a'),'garticSteps/TEST/match/0/a')));
 await assertFails(get(ref(db('b'),'garticSteps/TEST/match/0/a')));
 await assertFails(get(ref(db('a'),'garticSteps/TEST/match')));
 await assertFails(get(ref(env.unauthenticatedContext().database(),room)));
 s=await advance(s);
 await assertSucceeds(get(ref(db('b'),'garticSteps/TEST/match/0/a')));
 await assertFails(get(ref(db('c'),'garticSteps/TEST/match/0/a')));
 await assertFails(get(ref(db('a'),'garticSteps/TEST/match/0/b')));
 for(const uid of ['a','b','c']){await step(uid,1,'drawing','data:image/png;base64,AAAA');await ready(uid,1);}
 s=await advance(s);
 await assertFails(get(ref(db('b'),'garticSteps/TEST/match/0/a')));
 for(const uid of ['a','b','c']){await step(uid,2);await ready(uid,2);}
 s=await advance(s);
 const snap=await assertSucceeds(get(ref(db('c'),'garticSteps/TEST/match')));
 assert.equal(s.phase,'reveal');assert.equal(Object.keys(snap.val()).length,3);
});
test('las reglas rechazan saltos de ronda, tareas ajenas y falsos listos',async()=>{
 const s=await fixture();
 await assertFails(set(ref(db('a'),room+'/state'),{...s,round:3,phase:'reveal',startedAt:serverTimestamp(),duration:0}));
 await assertFails(set(ref(db('a'),room+'/state'),{...s,round:1,startedAt:serverTimestamp()}));
 await assertFails(set(ref(db('a'),'garticReady/TEST/match/0/b'),true));
 await assertFails(set(ref(db('a'),'garticReady/TEST/match/0/a'),true));
 await assertFails(set(ref(db('b'),'garticSteps/TEST/match/0/a'),{authorId:'a',order:0,type:'text',content:'Trampa'}));
 await assertFails(set(ref(db('b'),room+'/mode'),'story'));
 await assertFails(set(ref(db('a'),room+'/players/c'),null));
 await step('a',0);await ready('a',0);
 await assertFails(set(ref(db('a'),'garticSteps/TEST/match/0/a'),{authorId:'a',order:0,type:'text',content:'Cambió'}));
});
test('las reglas validan los tipos de tarea, la capacidad y la transferencia de host',async()=>{
 await fixture('imitation');
 await assertFails(set(ref(db('a'),'garticSteps/TEST/match/0/a'),{authorId:'a',order:0,type:'text',content:'No corresponde'}));
 await assertFails(set(ref(db('b'),room+'/hostId'),'b'));
 await assertSucceeds(remove(ref(db('a'),'garticPresence/TEST/a/tab')));
 await assertSucceeds(set(ref(db('b'),room+'/hostId'),'b'));
 await assertFails(set(ref(db('x'),room+'/hostId'),'x'));
});
test('el servidor permite avanzar por tiempo conservando el último borrador',async()=>{
 let s=await fixture();
 await step('a',0,'text','Borrador que queda');
 await env.withSecurityRulesDisabled(async(c)=>{
  s={...s,startedAt:Date.now()-96000};
  await set(ref(c.database(),room+'/state'),s);
 });
 s=await advance(s);
 const snap=await assertSucceeds(get(ref(db('b'),'garticSteps/TEST/match/0/a')));
 assert.equal(snap.val().content,'Borrador que queda');
});
test('los lugares del lobby impiden superar el máximo y ocupar el lugar de otro',async()=>{
 await env.clearDatabase();
 await assertSucceeds(set(ref(db('a'),room),{hostId:'a',players:{a:players.a},slots:{0:'a'},mode:'normal',settings:{maxPlayers:3,seconds:90},state:{phase:'lobby',match:'none',round:0}}));
 for(const uid of ['b','c'])await assertSucceeds(update(ref(db(uid),room),{['players/'+uid]:players[uid],['slots/'+players[uid].index]:uid}));
 const fourth={name:'Dani',avatar:'🐱',index:3};
 await assertFails(update(ref(db('d'),room),{'players/d':fourth,'slots/3':'d'}));
 await assertSucceeds(set(ref(db('a'),room+'/settings'),{maxPlayers:4,seconds:90}));
 await assertSucceeds(update(ref(db('d'),room),{'players/d':fourth,'slots/3':'d'}));
 await assertFails(update(ref(db('e'),room),{'players/e':{...fourth,name:'Ema'},'slots/3':'e'}));
 await assertFails(set(ref(db('a'),room+'/settings'),{maxPlayers:3,seconds:90}));
});

test.after(async()=>{await env.cleanup();});
