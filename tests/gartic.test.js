import test from 'node:test';
import assert from 'node:assert/strict';
import { makeState, nextState, stepType, chainOwner, previousAuthor, buildAlbums, roundDuration } from '../src/gartic/game.js';
import { floodFill } from '../src/gartic/drawing.js';
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
