// Enrutador: qué juego se muestra, dentro del marco común (header + menú).
import React, { useCallback, useState } from 'react';
import AppShell from './ui/AppShell.jsx';
import Home from './ui/Home.jsx';
import { gameUrl } from './ui/games.js';
import { syncProfileName } from './ui/store.js';
import { loadSession } from './session.js';
import CodigoSecretoApp from './codigo-secreto/CodigoSecretoApp.jsx';
import CafeOTeApp from './cafeote/CafeOTeApp.jsx';
import FutbolApp from './futbol/FutbolApp.jsx';
import GarticApp from './gartic/GarticApp.jsx';
import MechaApp from './mecha/MechaApp.jsx';
import MemeApp from './meme/MemeApp.jsx';
import TirosApp from './tiros/TirosApp.jsx';
import MvlApp from './mvl/MvlApp.jsx';
import NaveApp from './nave/NaveApp.jsx';
import CohetesApp from './cohetes/CohetesApp.jsx';
import PixelApp from './pixel/PixelApp.jsx';
import MonopolyApp from './monopoly/MonopolyApp.jsx';
import TegApp from './teg/TegApp.jsx';

const SCREENS = {
  teg: TegApp,
  monopoly: MonopolyApp,
  pixel: PixelApp,
  cohetes: CohetesApp,
  nave: NaveApp,
  meme: MemeApp,
  tiros: TirosApp,
  mvl: MvlApp,
  'la-mecha': MechaApp,
  'codigo-secreto': CodigoSecretoApp,
  'cafe-o-te': CafeOTeApp,
  futbol: FutbolApp,
  gartic: GarticApp,
};

function gameFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const juego = params.get('juego') || '';
  if (SCREENS[juego]) return juego;
  // Los links de Código Secreto son solo ?sala=ABCD (como siempre fueron).
  const code = (params.get('sala') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  return code || loadSession(code, 'codigo-secreto') ? 'codigo-secreto' : 'menu';
}

export default function App() {
  const [screen, setScreen] = useState(gameFromUrl);
  const [visit, setVisit] = useState(0); // cambia en cada navegación: el juego arranca de cero

  const navigate = useCallback((id, code = '') => {
    const url = id === 'menu' ? `${window.location.origin}/` : gameUrl(id, code);
    window.history.replaceState(null, '', url);
    syncProfileName();
    setScreen(SCREENS[id] ? id : 'menu');
    setVisit((v) => v + 1);
    window.scrollTo({ top: 0 });
  }, []);

  const Screen = SCREENS[screen];
  return (
    <AppShell activeGame={screen === 'menu' ? null : screen} onNavigate={navigate}>
      {Screen
        ? <Screen key={visit} onBackToMenu={() => navigate('menu')} />
        : <Home key={visit} onNavigate={navigate} />}
    </AppShell>
  );
}
