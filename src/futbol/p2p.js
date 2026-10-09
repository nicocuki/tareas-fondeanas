// Conexión directa entre navegadores (WebRTC) para las fotos del fútbol.
//
// Por Firebase cada foto pasa por un servidor de Google: desde acá tardaba de 200 a 1.200 ms y
// llegaba en ráfagas. Por un canal directo entre las dos pantallas tarda lo que tarda la red entre
// ellas (unos pocos ms en la misma red, 20 a 80 por internet) y no hay servidor en el medio.
//
// Firebase se sigue usando para presentar a las pantallas (la «señalización»: oferta, respuesta y
// candidatos) y como respaldo: si con alguien no se puede armar el canal directo (hay redes que lo
// bloquean), las fotos para esa persona siguen yendo por Firebase como antes.
//
// Cada par de pantallas arma un solo canal: lo inicia la de id menor, así nunca se cruzan dos
// ofertas. Cada montaje tiene una sesión (`sid`) nueva; los mensajes llevan la sesión de origen y
// de destino, y uno dirigido a una sesión vieja (alguien que recargó) se ignora.

// Servidores públicos para que cada navegador descubra su dirección vista desde internet.
const ICE_SERVERS = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];
const CONNECT_TIMEOUT_MS = 8000; // si el canal no abre en este tiempo, se reintenta
const MAX_ATTEMPTS = 4;          // después se deja a esa persona por Firebase

const randomId = () => Math.random().toString(36).slice(2, 10);

export function p2pSupported() {
  return typeof RTCPeerConnection !== 'undefined';
}

// `signaling` viene de storage-firebase.js. `onMessage(id, dato)` recibe lo que manda cada uno.
export function createMesh({ signaling, myId, onMessage }) {
  if (!signaling || !myId || !p2pSupported()) return null;
  const sid = randomId();
  const peers = new Map(); // id → { sid, cid, pc, dc, open, attempts, timer, queued }
  let closed = false;

  const isInitiator = (id) => String(myId) < String(id);

  function drop(id) {
    const peer = peers.get(id);
    if (!peer) return;
    clearTimeout(peer.timer);
    peer.dc?.close();
    peer.pc.close();
    peers.delete(id);
  }

  function signal(id, peer, type, data) {
    signaling.send(id, { f: myId, fs: sid, ts: peer.sid, c: peer.cid, t: type, d: JSON.stringify(data) }).catch(() => {});
  }

  function setupChannel(id, peer, dc) {
    peer.dc = dc;
    dc.onopen = () => {
      peer.open = true;
      peer.attempts = 0;
      clearTimeout(peer.timer);
    };
    dc.onclose = () => { peer.open = false; };
    dc.onmessage = (e) => {
      let data;
      try {
        data = JSON.parse(e.data);
      } catch {
        return;
      }
      onMessage(id, data);
    };
  }

  function newPeer(id, remoteSid, cid, attempts) {
    drop(id);
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const peer = { sid: remoteSid, cid, pc, dc: null, open: false, attempts, timer: 0, queued: [] };
    peers.set(id, peer);
    pc.onicecandidate = (e) => {
      if (e.candidate) signal(id, peer, 'c', e.candidate.toJSON());
    };
    pc.onconnectionstatechange = () => {
      if (peers.get(id) !== peer) return;
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        peer.open = false;
        if (isInitiator(id)) retry(id, peer);
      }
    };
    return peer;
  }

  // Solo el que inicia reintenta; el otro espera la oferta nueva.
  function retry(id, peer) {
    if (closed || peers.get(id) !== peer) return;
    if (peer.attempts + 1 >= MAX_ATTEMPTS) {
      clearTimeout(peer.timer);
      return; // se queda por Firebase
    }
    connect(id, peer.sid, peer.attempts + 1);
  }

  async function connect(id, remoteSid, attempts = 0) {
    const peer = newPeer(id, remoteSid, randomId(), attempts);
    // Sin orden ni reenvíos: una foto perdida ya no sirve, y esperarla atrasaría a las siguientes.
    setupChannel(id, peer, peer.pc.createDataChannel('futbol', { ordered: false, maxRetransmits: 0 }));
    peer.timer = setTimeout(() => { if (!peer.open) retry(id, peer); }, CONNECT_TIMEOUT_MS);
    try {
      await peer.pc.setLocalDescription(await peer.pc.createOffer());
      signal(id, peer, 'o', peer.pc.localDescription.toJSON());
    } catch {
      retry(id, peer);
    }
  }

  async function flushCandidates(peer) {
    for (const candidate of peer.queued.splice(0)) {
      await peer.pc.addIceCandidate(candidate).catch(() => {});
    }
  }

  async function onSignal(msg) {
    if (closed || !msg || msg.ts !== sid || msg.f === myId) return;
    const id = msg.f;
    let data;
    try {
      data = JSON.parse(msg.d);
    } catch {
      return;
    }
    if (msg.t === 'o') {
      if (isInitiator(id)) return; // la oferta la tiene que hacer el de id menor
      const peer = newPeer(id, msg.fs, msg.c, 0);
      peer.pc.ondatachannel = (e) => setupChannel(id, peer, e.channel);
      try {
        await peer.pc.setRemoteDescription(data);
        await flushCandidates(peer);
        await peer.pc.setLocalDescription(await peer.pc.createAnswer());
        signal(id, peer, 'a', peer.pc.localDescription.toJSON());
      } catch {
        drop(id);
      }
      return;
    }
    const peer = peers.get(id);
    if (!peer || peer.cid !== msg.c || peer.sid !== msg.fs) return; // de un intento viejo
    if (msg.t === 'a') {
      try {
        await peer.pc.setRemoteDescription(data);
        await flushCandidates(peer);
      } catch {
        retry(id, peer);
      }
    } else if (msg.t === 'c') {
      if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(data).catch(() => {});
      else peer.queued.push(data);
    }
  }

  function onPeers(list) {
    if (closed) return;
    const known = { ...list }; // id → sid anunciados en Firebase
    delete known[myId];
    for (const id of [...peers.keys()]) {
      if (!(id in known)) drop(id);
    }
    for (const [id, remoteSid] of Object.entries(known)) {
      const peer = peers.get(id);
      if (peer && peer.sid === remoteSid) continue;
      if (isInitiator(id)) connect(id, remoteSid);
      else if (peer) drop(id); // recargó: va a llegar una oferta nueva
    }
  }

  const offListen = signaling.listen(myId, (msg) => { onSignal(msg); });
  let offPeers = () => {};
  signaling.announce(myId, sid).then(() => {
    if (!closed) offPeers = signaling.onPeers(onPeers);
  }).catch(() => {});

  return {
    // Manda a todos los que tienen el canal abierto.
    broadcast(data) {
      const text = JSON.stringify(data);
      for (const peer of peers.values()) {
        if (!peer.open || peer.dc?.readyState !== 'open') continue;
        try {
          peer.dc.send(text);
        } catch {
          // un canal que se está cerrando: esa foto va por Firebase
        }
      }
    },
    // ¿Estos jugadores reciben por conexión directa? Se pregunta por los de la sala y no por los
    // anunciados: alguien cuyo navegador no puede usar WebRTC nunca se anuncia, y a ese hay que
    // seguir mandándole todo por Firebase.
    isOpen(id) {
      return Boolean(peers.get(id)?.open);
    },
    close() {
      closed = true;
      offListen();
      offPeers();
      for (const id of [...peers.keys()]) drop(id);
      signaling.leave(myId).catch(() => {});
    },
  };
}
