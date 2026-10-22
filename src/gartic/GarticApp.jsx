import React, { useEffect, useRef, useState } from 'react';
import { loadName } from '../session.js';
import { backend } from '../storage.js';
import { backgroundInterval } from '../ticker.js';
import { MODES, TIME_CHOICES, MIN_SECONDS, MAX_SECONDS, cleanName, cleanSeconds, previousAuthor, roomSettings, myTurnToAdvance } from './game.js';
import * as network from './storage.js';
import Task from './Task.jsx';
import Reveal from './Reveal.jsx';
import Icon from './Icon.jsx';
import { PublicCheckbox, PublicSwitch } from '../lobby/PublicRoom.jsx';
import ChangeGame from '../lobby/ChangeGame.jsx';
import { useAutoCreate, useAutoJoin, useMoveWatch } from '../ui/mudanza.js';
import './gartic.css';
import { AVATARS, getProfile, setProfile, useRegisterRoom } from '../ui/store.js';
import { gameById, gameUrl } from '../ui/games.js';
import { useRoomInfo } from '../ui/rooms.js';
import { isFull } from '../ui/roomSummary.js';
const urlCode=()=>new URLSearchParams(location.search).get('sala')?.toUpperCase().replace(/[^A-Z]/g,'').slice(0,4)||'';
function savedSession(){try{return JSON.parse(sessionStorage.getItem('gartic:session'));}catch{return null;}}
function remember(code,uid){
  const url=new URL(location.href);url.searchParams.set('juego','gartic');
  if(code){url.searchParams.set('sala',code);sessionStorage.setItem('gartic:session',JSON.stringify({code,uid}));}
  else{url.searchParams.delete('sala');sessionStorage.removeItem('gartic:session');}
  history.replaceState(null,'',url);
}
const Logo=({small})=><div className={'gp-logo'+(small?' is-small':'')} aria-label="Trazo Loco"><span className="gp-logo-top">Trazo</span><span className="gp-logo-main">LOCO</span><span className="gp-logo-base" aria-hidden="true"/></div>;
function Frame({onBack,backLabel='Volver',children,wide}){
  return <div className="gp-root"><div className={'gp-frame'+(wide?' is-wide':'')}>
    <header className="gp-head"><button type="button" className="gp-btn-ghost" onClick={onBack}><Icon name="back" size={20}/>{backLabel}</button><Logo small={wide}/><span className="gp-head-spacer"/></header>
    {children}
  </div></div>;
}
// Con el link de una sala: «te estás uniendo a la sala de…», el código y cuántos hay.
function Invite({code,info}){
  const other=info&&info.game!=='gartic'?gameById(info.game):null;
  const title=info===undefined?'Buscando la sala…':!info?'No encontramos esa sala':info.host?<>Te estás uniendo a la sala de <b>{info.hostAvatar} {info.host}</b></>:'Te estás uniendo a una sala';
  return <div className="gp-panel gp-invite" data-invite={code}>
    <p className="gp-invite-title">{title}</p>
    <div className="gp-invite-code"><span>Código</span><strong>{code}</strong></div>
    {info&&!other&&<p className="gp-invite-status">{info.players===1?'1 jugador en la sala':info.players+' jugadores en la sala'}{info.max?' · entran '+info.max:''}{info.phase!=='lobby'&&' · la partida ya empezó'}</p>}
    {info===null&&<p className="gp-invite-status is-bad">Puede que se haya cerrado o que el link esté mal. Pedile el código de nuevo a quien te lo pasó.</p>}
    {other&&<p className="gp-invite-status is-bad">Esta sala es de {other.emoji} {other.title}. <a href={gameUrl(info.game,code)}>Ir a esa sala</a></p>}
    {isFull(info)&&<p className="gp-invite-status is-bad">La sala está llena.</p>}
  </div>;
}
// Tiempo por ronda: los de siempre o uno escrito a mano.
function TimeField({label,value,disabled,onChange}){
  const preset=TIME_CHOICES.includes(value);
  const [custom,setCustom]=useState(!preset),[text,setText]=useState(String(value));
  useEffect(()=>{setText(String(value));if(!TIME_CHOICES.includes(value))setCustom(true);},[value]);
  const commit=()=>{const n=cleanSeconds(text,value);setText(String(n));if(n!==value)onChange(n);};
  const label2=(n)=>n<60?n+' s':n%60?Math.floor(n/60)+' min '+n%60+' s':n/60+' min';
  return <div className="gp-field"><span className="gp-field-label">{label}</span><div className="gp-field-row">
    <select disabled={disabled} value={custom?'custom':value} onChange={(e)=>{if(e.target.value==='custom'){setCustom(true);return;}setCustom(false);onChange(Number(e.target.value));}}>
      {TIME_CHOICES.map((n)=><option key={n} value={n}>{label2(n)}</option>)}<option value="custom">Personalizado…</option>
    </select>
    {custom && <label className="gp-custom-time"><input type="number" min={MIN_SECONDS} max={MAX_SECONDS} disabled={disabled} value={text} onChange={(e)=>setText(e.target.value)} onBlur={commit} onKeyDown={(e)=>{if(e.key==='Enter')commit();}} aria-label={label+' en segundos'}/><span>seg</span></label>}
  </div></div>;
}
export default function GarticApp({onBackToMenu}){
  const [uid,setUid]=useState(null),[name,setName]=useState(loadName),[avatar,setAvatar]=useState(()=>getProfile().avatar);
  const [joinCode,setJoinCode]=useState(urlCode),[code,setCode]=useState(''),[room,setRoom]=useState(null);
  const [connected,setConnected]=useState({}),[ready,setReady]=useState({}),[readyKey,setReadyKey]=useState(''),[own,setOwn]=useState(null),[previous,setPrevious]=useState(null);
  const [ownLoaded,setOwnLoaded]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[copied,setCopied]=useState('');
  const [online,setOnline]=useState(false),[offset,setOffset]=useState(0),[tick,setTick]=useState(Date.now());
  const [tab,setTab]=useState('modes');
  const [invite,setInvite]=useState(()=>urlCode().length===4);
  const inviteInfo=useRoomInfo(invite?joinCode:'');
  const canJoinInvite=Boolean(inviteInfo)&&inviteInfo.game==='gartic'&&!isFull(inviteInfo);
  const stopPresence=useRef(null),advancing=useRef(false);
  useEffect(()=>{
    let active=true;
    network.identity().then((user)=>{
      if(!active)return;setUid(user.uid);
      const saved=savedSession();
      if(saved?.uid===user.uid && /^[A-Z]{4}$/.test(saved.code) && (!urlCode()||urlCode()===saved.code))setCode(saved.code);
    }).catch(()=>{if(active)setError('No pudimos preparar tu jugador. Recargá la página.');});
    const off=network.watch('.info/connected',setOnline);
    const offOffset=backend.subscribeServerOffset(setOffset);
    const stopTick=backgroundInterval(()=>setTick(Date.now()),250); // sigue con la pestaña de fondo (ticker.js)
    return()=>{active=false;off();offOffset();stopTick();};
  },[]);
  useEffect(()=>{
    if(!code || !uid)return;
    let active=true;
    setRoom(null);setConnected({});
    const off=network.watchRoom(code,(data)=>{
      if(!active)return;
      if(!data?.players?.[uid]){setCode('');remember('',uid);setError(data?.kicked?.[uid]?'El anfitrión te sacó de la sala.':'Ya no estás en esa sala. Podés volver a entrar.');return;}
      setRoom(data);
    },()=>setError('No se pudo abrir la sala. Revisá la conexión.'));
    const offPresence=network.watchPresence(code,(data)=>setConnected(data||{}));
    network.presence(code,uid).then((stop)=>{if(active)stopPresence.current=stop;else stop().catch(()=>{});});
    return()=>{active=false;off();offPresence();const stop=stopPresence.current;stopPresence.current=null;stop?.().catch(()=>{});};
  },[code,uid]);
  const state=room?.state, phase=state?.phase, taskKey=state?state.match+':'+state.round:'';
  const now=tick+offset;
  useEffect(()=>{
    if(phase!=='playing' || !state.positions?.[uid]) {
      // La posición cero también es un participante.
      if(phase!=='playing' || state.positions?.[uid]===undefined)return;
    }
    setReady({});setOwn(null);setOwnLoaded('');setPrevious(null);
    const offReady=network.watchReady(code,state,(data)=>{setReadyKey(taskKey);setReady(data||{});},()=>setError('No se pudo consultar quién está listo.'));
    let first=true;
    const offOwn=network.watchOwnStep(code,state,uid,(data)=>{if(first){setOwn(data);setOwnLoaded(taskKey);first=false;}},()=>setError('No se pudo recuperar tu tarea.'));
    const offPrev=state.round>0?network.watchPrevious(code,state,previousAuthor(state,uid),setPrevious,()=>{}):()=>{};
    return()=>{offReady();offOwn();offPrev();};
  },[code,taskKey,phase,uid]);
  const currentReady=readyKey===taskKey?ready:{};
  const readyCount=Object.keys(currentReady).length;
  // Desde cuándo esta pantalla ve que la ronda ya tiene que avanzar (ver myTurnToAdvance).
  const dueSince=useRef({key:'',at:0});
  useEffect(()=>{
    if(!online || phase!=='playing' || state.positions?.[uid]===undefined || advancing.current || readyKey!==taskKey)return;
    if(readyCount<state.count && now<state.startedAt+state.duration+5000)return;
    if(dueSince.current.key!==taskKey)dueSince.current={key:taskKey,at:Date.now()};
    if(!myTurnToAdvance(Object.keys(state.positions),connected,uid,Date.now()-dueSince.current.at))return;
    advancing.current=true;
    network.advance(code,state,readyCount,now).catch(()=>setError('No se pudo avanzar la ronda. Reintentando…')).finally(()=>{advancing.current=false;});
  },[tick,phase,readyCount,taskKey,online,readyKey,connected]);
  useEffect(()=>{
    if(!room || connected[room.hostId] || !connected[uid])return;
    const timer=setTimeout(()=>network.transferHost(code,room,connected).catch(()=>{}),5000);
    return()=>clearTimeout(timer);
  },[room?.hostId,code,connected,uid]);
  async function run(action){
    setBusy(true);setError('');
    try{await action();}catch(e){setError(e.message||'No se pudo completar la acción.');}
    finally{setBusy(false);}
  }
  async function enter(create){
    const clean=cleanName(name);
    if(!clean){setError('Escribí tu nombre primero.');return;}
    const target=joinCode.trim().toUpperCase();
    if(!create && !/^[A-Z]{4}$/.test(target)){setError('El código tiene 4 letras.');return;}
    await run(async()=>{
      const next=create?await network.createRoom(uid,clean,avatar):target;
      if(!create)await network.joinRoom(next,uid,clean,avatar);
      localStorage.setItem('codigo-secreto:nombre',clean);
      remember(next,uid);setCode(next);
    });
  }
  async function leave(){
    await run(async()=>{
      await stopPresence.current?.();stopPresence.current=null;
      if(phase==='lobby')await network.leaveRoom(code,uid,true);
      remember('',uid);setCode('');setRoom(null);setJoinCode('');
    });
  }
  useRegisterRoom('gartic', room ? code : '', () => { leave(); });
  // Cambiar de juego con todos (ver src/ui/mudanza.js): el anfitrión crea la sala sola, los demás entran solos
  // y, desde la sala de espera, siguen al anfitrión si se pasa a otro juego.
  useAutoCreate(()=>enter(true),Boolean(uid)&&Boolean(cleanName(name)));
  useAutoJoin(Boolean(uid)&&Boolean(cleanName(name))&&canJoinInvite&&!code,()=>enter(false));
  useMoveWatch(phase==='lobby'?code:'');
  async function copy(link){
    const url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('juego','gartic');url.searchParams.set('sala',code);
    const value=link?url.toString():code;
    try{await navigator.clipboard.writeText(value);setCopied(link?'link':'code');setTimeout(()=>setCopied(''),2000);}catch{window.prompt('Copiá la invitación:',value);}
  }
  const banners=<>{!online && code && <div className="gp-notice" role="status">Reconectando… Tu tarea sigue guardada.</div>}{error && <div className="gp-error" role="alert">{error}</div>}</>;
  const profile=<section className="gp-col">
    <h2 className="gp-title">Elegí tu personaje</h2>
    <div className="gp-panel gp-profile">
      <span className="gp-avatar gp-avatar-xl">{avatar}</span>
      <div className="gp-avatar-picker">{AVATARS.map((a)=><button type="button" aria-label={'Avatar '+a} aria-pressed={avatar===a} className={avatar===a?'is-on':''} key={a} onClick={()=>{setAvatar(a);setProfile({avatar:a});}}>{a}</button>)}</div>
      <input className="gp-name" value={name} maxLength={24} autoComplete="nickname" placeholder="Tu nombre" aria-label="Tu nombre" onChange={(e)=>setName(e.target.value)}/>
    </div>
  </section>;
  if(!code&&invite)return <Frame onBack={onBackToMenu} backLabel="Juegos">
    {banners}
    <div className="gp-home">
      {profile}
      <section className="gp-col"><h2 className="gp-title">Te invitaron</h2><Invite code={joinCode} info={inviteInfo}/></section>
    </div>
    <div className="gp-actions">
      <button type="button" className="gp-btn gp-btn-go gp-btn-big" disabled={busy || !uid || !cleanName(name) || !canJoinInvite} onClick={()=>enter(false)}><Icon name="play"/>Unirme a la sala</button>
    </div>
    <button type="button" className="gp-invite-other" onClick={()=>{setInvite(false);setJoinCode('');remember('');}}>Prefiero crear mi propia sala</button>
  </Frame>;
  if(!code)return <Frame onBack={onBackToMenu} backLabel="Juegos">
    {banners}
    <div className="gp-home">
      {profile}
      <section className="gp-col">
        <h2 className="gp-title">Cómo se juega</h2>
        <div className="gp-panel gp-howto">
          <ol>
            <li><span>✍️</span>Cada uno escribe una frase loca.</li>
            <li><span>🎨</span>Le llega la frase de otro y la tiene que dibujar.</li>
            <li><span>🤔</span>Otro ve solo el dibujo y escribe qué es.</li>
            <li><span>🔁</span>Así hasta que cada cadena pasa por todos.</li>
            <li><span>📒</span>Al final se ven los álbumes, todos juntos.</li>
          </ol>
        </div>
      </section>
    </div>
    <div className="gp-actions">
      <form className="gp-join" onSubmit={(e)=>{e.preventDefault();enter(false);}}>
        <input aria-label="Código de sala" placeholder="CÓDIGO" maxLength={4} autoCapitalize="characters" value={joinCode} onChange={(e)=>setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z]/g,''))}/>
        <button className="gp-btn" disabled={busy || !uid || joinCode.length!==4}>Unirme</button>
      </form>
      <button type="button" className="gp-btn gp-btn-go gp-btn-big" disabled={busy || !uid} onClick={()=>enter(true)}><Icon name="play"/>Crear sala</button>
    </div>
    <PublicCheckbox/>
  </Frame>;
  if(!room)return <Frame onBack={leave} backLabel="Cancelar">{banners}<p className="gp-loading">Entrando a la sala…</p></Frame>;
  const host=room.hostId===uid;
  const settings=roomSettings(room.settings);
  // Cada ajuste por separado: dos cambios seguidos no se pisan.
  const saveSettings=(patch)=>run(()=>Promise.all(Object.entries(patch).map(([key,value])=>network.configure(code,'settings/'+key,value))));
  const playerCount=Object.keys(room.players).length;
  if(phase==='lobby'){
    const minMax=Math.max(3,...Object.values(room.players).map((p)=>p.index+1));
    const slots=Array.from({length:settings.maxPlayers},(_,i)=>room.slots?.[i]);
    return <Frame onBack={leave} backLabel="Salir">
      {banners}
      <div className="gp-lobby">
        <aside className="gp-col">
          <h2 className="gp-title">Jugadores {playerCount}/{settings.maxPlayers}</h2>
          <select className="gp-select-big" aria-label="Máximo de jugadores" disabled={!host || busy} value={settings.maxPlayers} onChange={(e)=>saveSettings({maxPlayers:Number(e.target.value)})}>
            {[3,4,5,6,8,10,12,14,16,20].filter((n)=>n>=minMax).map((n)=><option key={n} value={n}>{n} jugadores</option>)}
          </select>
          <div className="gp-panel gp-list" data-players>
            {slots.map((id,i)=>{
              const p=id&&room.players[id];
              if(!p)return <div className="gp-slot is-empty" key={'e'+i}><span className="gp-avatar">🙂</span><strong>Vacío</strong></div>;
              return <div className={'gp-slot'+(id===uid?' is-me':'')} key={id}>
                <span className="gp-avatar">{p.avatar}{!connected[id] && <i className="gp-offline" title="Reconectando…"/>}</span>
                <strong>{p.name}{id===uid?' (vos)':''}</strong>
                {id===room.hostId && <i className="gp-crown" title="Anfitrión"><Icon name="crown" size={16}/></i>}
                {host && id!==uid && <button type="button" className="gp-kick" title={'Sacar a '+p.name} aria-label={'Sacar a '+p.name} data-kick={id} onClick={()=>{if(window.confirm('¿Sacar a '+p.name+' de la sala? No va a poder volver a entrar desde esa pantalla.'))run(()=>network.kickPlayer(code,id));}}>✕</button>}
              </div>;
            })}
          </div>
        </aside>
        <section className="gp-col gp-col-wide">
          <div className="gp-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab==='modes'} className={tab==='modes'?'is-on':''} onClick={()=>setTab('modes')}>Modos</button>
            <button type="button" role="tab" aria-selected={tab==='settings'} className={tab==='settings'?'is-on':''} onClick={()=>setTab('settings')}>Ajustes</button>
          </div>
          <div className="gp-panel gp-tab-panel">
            {tab==='modes'?<div className="gp-modes">{MODES.map((mode)=><button type="button" key={mode.id} data-opt={'mode-'+mode.id} disabled={!host || !mode.available || busy} className={'gp-mode'+(room.mode===mode.id?' is-on':'')+(mode.available?'':' is-locked')} aria-pressed={room.mode===mode.id} title={mode.description} onClick={()=>run(()=>network.configure(code,'mode',mode.id))}>
              <span className="gp-mode-icon">{mode.available?mode.icon:'🔒'}</span><strong>{mode.name}</strong><small>{mode.available?mode.description:'Próximamente'}</small>
            </button>)}</div>
            :<div className="gp-settings">
              <TimeField label="Tiempo para escribir" value={settings.writeSeconds} disabled={!host || busy || room.mode==='imitation'} onChange={(n)=>saveSettings({writeSeconds:n})}/>
              <TimeField label={room.mode==='imitation'?'Tiempo para dibujar (baja 10 s por ronda)':'Tiempo para dibujar'} value={settings.seconds} disabled={!host || busy || room.mode==='story'} onChange={(n)=>saveSettings({seconds:n})}/>
              <div className="gp-field"><span className="gp-field-label">Al final de la partida</span>
                <div className="gp-switch" role="group" aria-label="Cómo se muestran los álbumes">
                  <button type="button" data-opt="autoShow-on" disabled={!host || busy} className={settings.autoShow?'is-on':''} aria-pressed={settings.autoShow} onClick={()=>saveSettings({autoShow:true})}>Mostrar automático</button>
                  <button type="button" data-opt="autoShow-off" disabled={!host || busy} className={!settings.autoShow?'is-on':''} aria-pressed={!settings.autoShow} onClick={()=>saveSettings({autoShow:false})}>El anfitrión pasa</button>
                </div>
                <small>{settings.autoShow?'Los álbumes se van mostrando solos, a todos a la vez y en el mismo orden. El anfitrión puede pausar.':'Todos ven lo mismo, pero cada paso aparece cuando el anfitrión toca «Siguiente».'}</small>
              </div>
              {!host && <p className="gp-note">Solo el anfitrión cambia los ajustes.</p>}
            </div>}
          </div>
        </section>
      </div>
      <div className="gp-actions">
        <button type="button" className="gp-btn" onClick={()=>copy(true)}><Icon name="link"/>{copied==='link'?'¡Copiado!':'Invitar'}</button>
        <button type="button" className="gp-btn gp-btn-code" onClick={()=>copy(false)} title="Copiar código">{copied==='code'?'¡Copiado!':code}</button>
        {host?<button type="button" className="gp-btn gp-btn-go" disabled={busy || !online || Object.keys(connected).length<3} onClick={()=>run(()=>network.start(code,room,connected))}><Icon name="play"/>Empezar</button>
          :<p className="gp-note">Esperando que el anfitrión empiece…</p>}
      </div>
      {host && Object.keys(connected).length<3 && <p className="gp-note gp-center">Hacen falta al menos 3 jugadores conectados.</p>}
      <PublicSwitch code={code} host={host} players={playerCount} className="gp-public"/>
      <ChangeGame code={code} host={host} players={playerCount} className="gp-change-game"/>
    </Frame>;
  }
  return <Frame onBack={leave} backLabel="Salir" wide>
    {banners}
    {phase==='reveal'?<Reveal code={code} room={room} host={host} run={run} now={now}/>
      :state.positions?.[uid]===undefined?<p className="gp-loading">La partida ya empezó. Esperá a la próxima.</p>
      :ownLoaded===taskKey?<Task key={taskKey} code={code} state={state} uid={uid} initial={own} previous={previous} ready={!!currentReady[uid]} readyMap={currentReady} players={room.players} now={now} onError={setError}/>
      :<p className="gp-loading">Preparando tu tarea…</p>}
  </Frame>;
}
