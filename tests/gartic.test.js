import test from 'node:test';
import assert from 'node:assert/strict';
import { makeState, nextState, stepType, chainOwner, previousAuthor, buildAlbums, roundDuration, roomSettings, cleanSeconds, showDurations, showPosition, SHOW_TEXT_MS, SHOW_DRAWING_MS, SHOW_ALBUM_PAUSE_MS, ADVANCE_BACKUP_MS, myTurnToAdvance } from '../src/gartic/game.js';
import { floodFill, makeReplayer, opUnits, parseStrokes } from '../src/gartic/drawing.js';
const players={a:{name:'Ana'},b:{name:'Beto'},c:{name:'Cami'},d:{name:'Dani'}};
test('cada cadena pasa por todos sin volver a su creador',()=>{
 const s=makeState(players,'normal',90,'partida',1000);
 for(let c=0;c<4;c++){
  const owners=Array.from({length:4},(_,r)=>chainOwner(s,c,r));
  assert.equal(new Set(owners).size,4);
  for(let r=1;r<4;r++)assert.equal(previousAuthor(s,owners[r]),owners[r-1]);
 }
});
test('los cuatro modos tienen secuencias diferentes y los modos bloqueados se rechazan',()=>{
 assert.deepEqual(Array.from({length:4},(_,r)=>stepType('normal',r,4)),['text','drawing','text','drawing']);
 assert.deepEqual(Array.from({length:4},(_,r)=>stepType('story',r,4)),['text','text','text','text']);
 assert.deepEqual(Array.from({length:4},(_,r)=>stepType('imitation',r,4)),['drawing','drawing','drawing','drawing']);
 assert.deepEqual(Array.from({length:4},(_,r)=>stepType('sandwich',r,4)),['text','drawing','drawing','text']);
 assert.throws(()=>makeState(players,'solo',90,'partida',1000));
 assert.throws(()=>makeState({a:players.a,b:players.b},'normal',90,'partida',1000));
});
test('nadie avanza individualmente y el tiempo guarda un margen de envío',()=>{
 const s=makeState(players,'normal',90,'partida',1000);
 assert.equal(nextState(s,3,90000),null);
 assert.equal(nextState(s,0,95999),null);
 assert.equal(nextState(s,0,96000).round,1);
 assert.equal(nextState(s,4,2000).round,1);
 let next=s;
 for(let r=0;r<4;r++)next=nextState(next,4,2000+r);
 assert.equal(next.phase,'reveal');assert.equal(next.round,4);assert.equal(nextState(next,4,900000),null);
});
test('imitación reduce el tiempo y conserva un piso de quince segundos',()=>{
 assert.equal(roundDuration('imitation',0,90),90000);
 assert.equal(roundDuration('imitation',3,90),60000);
 assert.equal(roundDuration('imitation',19,90),15000);
 assert.equal(roundDuration('normal',3,90),90000);
});
test('los álbumes reconstruyen el texto y los dibujos reales en orden',()=>{
 const s=makeState(players,'normal',90,'partida',1000);
 const albums=buildAlbums(s,{0:{a:{content:'Pingüino'}},1:{b:{content:'imagen'}},2:{c:{content:'Pájaro'}},3:{d:{content:'otra imagen'}}},players);
 assert.deepEqual(albums[0].steps.map((x)=>x.content),['Pingüino','imagen','Pájaro','otra imagen']);
 assert.deepEqual(albums[0].steps.map((x)=>x.authorId),['a','b','c','d']);
 assert.equal(albums[1].steps[0].content,'');
});
test('el balde rellena solo el área conectada y conserva la frontera',()=>{
 const image={width:3,height:3,data:new Uint8ClampedArray(36)};
 for(let i=0;i<9;i++)image.data.set([255,255,255,255],i*4);
 for(let y=0;y<3;y++)image.data.set([0,0,0,255],(y*3+1)*4);
 assert.equal(floodFill(image,0,0,[255,0,0,255]),true);
 assert.deepEqual([...image.data.slice(0,4)],[255,0,0,255]);
 assert.deepEqual([...image.data.slice(4,8)],[0,0,0,255]);
 assert.deepEqual([...image.data.slice(8,12)],[255,255,255,255]);
 assert.equal(floodFill(image,-1,0,[255,0,0,255]),false);
 assert.equal(floodFill(image,0,0,[250,1,0,255]),false);
});

test('el tiempo para escribir y el de dibujar se eligen por separado',()=>{
 const s=makeState(players,'normal',{draw:120,write:20},'partida',1000);
 assert.equal(s.duration,20000);
 assert.equal(nextState(s,4,2000).duration,120000);
 assert.equal(nextState(nextState(s,4,2000),4,3000).duration,20000);
 assert.equal(roundDuration('sandwich',3,{draw:100,write:10},4),10000);
 assert.equal(cleanSeconds('7',90),7);assert.equal(cleanSeconds('2',90),5);assert.equal(cleanSeconds('9999',90),600);assert.equal(cleanSeconds('hola',90),90);
 // Una sala vieja con un solo tiempo lo usa para todo.
 assert.deepEqual(roomSettings({maxPlayers:8,seconds:60}),{maxPlayers:8,seconds:60,writeSeconds:60,autoShow:true});
});
test('al terminar arranca la presentación, sola o esperando al anfitrión',()=>{
 let s=makeState(players,'normal',90,'partida',1000,false);
 for(let r=0;r<4;r++)s=nextState(s,4,2000+r,5000);
 assert.deepEqual(s.show,{index:0,playing:false,at:5000});
 let a=makeState(players,'normal',90,'partida',1000);
 for(let r=0;r<4;r++)a=nextState(a,4,2000+r,5000);
 assert.equal(a.show.playing,true);
});
test('la presentación avanza igual en todas las pantallas',()=>{
 const s=makeState(players,'normal',90,'partida',1000);
 const d=showDurations(s);
 assert.equal(d.length,16);
 assert.deepEqual(d.slice(0,4),[SHOW_TEXT_MS,SHOW_DRAWING_MS,SHOW_TEXT_MS,SHOW_DRAWING_MS+SHOW_ALBUM_PAUSE_MS]);
 const show={index:0,playing:true,at:10000};
 assert.deepEqual(showPosition(show,10000,d),{index:0,since:0});
 assert.deepEqual(showPosition(show,10000+SHOW_TEXT_MS+100,d),{index:1,since:100});
 assert.equal(showPosition(show,10000+SHOW_TEXT_MS*2+SHOW_DRAWING_MS*2+SHOW_ALBUM_PAUSE_MS,d).index,4);
 assert.equal(showPosition(show,1e12,d).index,15);
 // Pausada o manual, se queda donde la dejó el anfitrión.
 assert.deepEqual(showPosition({index:6,playing:false,at:0},1e12,d),{index:6,since:Infinity});
 assert.equal(showPosition(undefined,0,d).index,0);
});
test('los trazos grabados se reproducen de a poco hasta el final',()=>{
 const ops=parseStrokes(JSON.stringify([['p','#000000',6,10,10,20,20,30,30],['R','#ff0013',6,0,0,5,5],['c','#ffffff',0]]));
 assert.equal(parseStrokes('no es json'),null);
 assert.equal(opUnits(ops[0]),3);
 const calls=[];
 const ctx=new Proxy({},{get:(_,k)=>k==='getImageData'?()=>({}):(...args)=>calls.push(k),set:()=>true});
 const replay=makeReplayer(ctx,ops,960,600);
 assert.equal(replay.total,5);
 const before=calls.length;
 replay.advance(2);
 const strokes=calls.slice(before).filter((k)=>k==='stroke').length;
 assert.equal(strokes,1); // el punto inicial y un tramo
 replay.advance(5);
 assert.ok(calls.includes('fillRect'));
});
test('si el que avanza la ronda tiene la conexión trabada, avanza el siguiente',()=>{
  const ids=['c','a','b'],on={a:true,b:true,c:true};
  assert.equal(myTurnToAdvance(ids,on,'a',0),true,'el primero, enseguida');
  assert.equal(myTurnToAdvance(ids,on,'b',0),false);
  assert.equal(myTurnToAdvance(ids,on,'b',ADVANCE_BACKUP_MS),true,'el segundo, si el primero no pudo');
  assert.equal(myTurnToAdvance(ids,on,'c',ADVANCE_BACKUP_MS),false);
  assert.equal(myTurnToAdvance(ids,on,'c',2*ADVANCE_BACKUP_MS),true);
  assert.equal(myTurnToAdvance(ids,{b:true,c:true},'b',0),true,'uno desconectado no cuenta');
  assert.equal(myTurnToAdvance(ids,on,'z',99999),false,'uno que no juega, nunca');
});
