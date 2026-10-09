import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
const rulesResponse=await fetch('http://127.0.0.1:9000/.settings/rules.json?ns=secreto-aed7e-default-rtdb',{method:'PUT',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:await readFile('database.rules.json','utf8')});
assert.equal(rulesResponse.status,200);
const browser=await chromium.launch({channel:'msedge',headless:true});
const contexts=[],pages=[],errors=[];
let roomCode='';
const base='http://127.0.0.1:5187/?juego=gartic';
async function player(i){
 const context=await browser.newContext(i===2?{viewport:{width:390,height:844},hasTouch:true,isMobile:true}:{viewport:{width:1280,height:900}});
 const page=await context.newPage();
 page.on('pageerror',(e)=>errors.push(e.message));
 page.setDefaultTimeout(15000);
 contexts.push(context);pages.push(page);
 await page.goto(base);
 await page.getByLabel('Tu nombre').fill('Jugador '+i);
 return page;
}
async function writing(text){
 await Promise.all(pages.map(async(p,i)=>{await p.locator('textarea:enabled').waitFor();await p.locator('textarea').fill(text+' '+i);await p.getByRole('button',{name:'¡Listo!',exact:true}).click();}));
}
async function drawing(){
 await Promise.all(pages.map(async(p,i)=>{
  const c=p.locator('canvas:not(.disabled)');await c.waitFor();
  const b=await c.boundingBox();
  const original=await c.evaluate((n)=>n.toDataURL());
  if(i===2){
   await p.touchscreen.tap(b.x+50,b.y+50);
  }else{
   await p.mouse.move(b.x+50,b.y+50);await p.mouse.down();await p.mouse.move(b.x+150,b.y+100,{steps:8});await p.mouse.up();
  }
  const painted=await c.evaluate((n)=>n.toDataURL());
  assert.notEqual(painted,original);
  await p.getByRole('button',{name:/Deshacer/}).click();
  assert.equal(await c.evaluate((n)=>n.toDataURL()),original);
  await p.getByRole('button',{name:/Rehacer/}).click();
  assert.equal(await c.evaluate((n)=>n.toDataURL()),painted);
  await p.getByRole('button',{name:'¡Listo!',exact:true}).click();
 }));
}
async function reveal(){await Promise.all(pages.map((p)=>p.getByRole('heading',{name:'¡Mirá cómo terminó!'}).waitFor()));for(const p of pages)assert.deepEqual(await p.locator('.gp-error').allTextContents(),[]);}
async function rematch(mode){
 await pages[0].getByRole('button',{name:'Otra partida · Volver al lobby'}).click();
 await pages[0].getByRole('button',{name:new RegExp(mode)}).first().click();
 await pages[0].getByRole('button',{name:'Iniciar partida →'}).click();
}
try{
 const host=await player(0);await host.getByRole('button',{name:'Crear sala',exact:true}).click();
 await host.getByRole('heading',{name:'Modos de juego'}).waitFor();
 const code=(await host.getByText(/^[A-Z]{4}$/).innerText()).trim();roomCode=code;
 for(let i=1;i<3;i++){const p=await player(i);await p.getByLabel('Código de sala').fill(code);await p.getByRole('button',{name:'Unirme',exact:true}).click();await p.getByRole('heading',{name:'Modos de juego'}).waitFor();}
 await mkdir('docs/gartic',{recursive:true});
 await host.screenshot({path:'docs/gartic/lobby.png',fullPage:true});
 await host.getByRole('button',{name:'Iniciar partida →'}).click();
 await pages[0].locator('textarea').fill('Borrador recuperado');
 await pages[0].reload();await pages[0].locator('textarea').waitFor();
 assert.equal(await pages[0].locator('textarea').inputValue(),'Borrador recuperado');
 await pages[0].locator('textarea').fill('Original 0');await pages[0].getByRole('button',{name:'¡Listo!',exact:true}).click();
 await pages[0].getByRole('heading',{name:'Esperando a los demás…'}).waitFor();
 assert.equal(await pages[1].locator('textarea').count(),1);
 for(let i=1;i<3;i++){await pages[i].locator('textarea').fill('Original '+i);await pages[i].getByRole('button',{name:'¡Listo!',exact:true}).click();}
 await Promise.all(pages.map((p)=>p.locator('canvas').waitFor()));
 const received=await Promise.all(pages.map((p)=>p.locator('.gp-reference blockquote').innerText()));
 assert.deepEqual([...received].sort(),['Original 0','Original 1','Original 2']);
 received.forEach((v,i)=>assert.notEqual(v,'Original '+i));
 await pages[2].screenshot({path:'docs/gartic/movil.png',fullPage:true});
 await drawing();await writing('Interpretación');await reveal();
 await host.getByRole('button',{name:'Ver todos los álbumes'}).click();
 await host.locator('details').first().locator('summary').click();
 assert.ok(await host.locator('details[open] img').count()===1);
 await host.screenshot({path:'docs/gartic/resultados.png',fullPage:true});
 console.log('Normal: cadenas reales, espera colectiva, recarga, mouse, touch y álbumes verificados.');
 await rematch('Historia');await writing('Inicio');
 assert.equal(await host.locator('canvas').count(),0);
 await writing('Continuación');await writing('Final');await reveal();
 console.log('Historia: tres etapas de escritura verificadas.');
 await rematch('Imitación');await drawing();
 await Promise.all(pages.map((p)=>p.getByText('🧠 La referencia desapareció. ¡Ahora usá tu memoria!').waitFor()));
 assert.equal(await host.locator('.gp-reference img').count(),0);
 await drawing();await drawing();await reveal();
 console.log('Imitación: solo dibujo y referencia oculta después de memorizar.');
 await host.getByRole('button',{name:'Otra partida · Volver al lobby'}).click();
 const fourth=await player(3);await fourth.getByLabel('Código de sala').fill(code);await fourth.getByRole('button',{name:'Unirme',exact:true}).click();await fourth.getByRole('heading',{name:'Modos de juego'}).waitFor();
 await host.getByRole('button',{name:/Sandwich/}).first().click();await host.getByRole('button',{name:'Iniciar partida →'}).click();
 await writing('Frase sandwich');await drawing();await drawing();await writing('Descripción final');await reveal();
 console.log('Sandwich: escritura, dos rondas de dibujo y descripción final verificadas.');
 await host.getByRole('button',{name:'Salir',exact:true}).click();
 await new Promise((r)=>setTimeout(r,6500));
 assert.equal(await Promise.all(pages.slice(1).map((p)=>p.getByRole('button',{name:'Otra partida · Volver al lobby'}).count())).then((counts)=>counts.reduce((a,b)=>a+b,0)),1);
 assert.deepEqual(errors,[]);
 console.log('Transferencia de host verificada. Sin errores de React.');
}finally{await browser.close();if(roomCode)for(const path of ['garticRooms','garticSteps','garticReady','garticPresence'])await fetch('http://127.0.0.1:9000/'+path+'/'+roomCode+'.json?ns=secreto-aed7e-default-rtdb',{method:'DELETE',headers:{Authorization:'Bearer owner'}});}
