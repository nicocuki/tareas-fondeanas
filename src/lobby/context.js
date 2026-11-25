// Avisa a las piezas de la sala de espera (opciones, botón de empezar) que están adentro de `LobbyLayout`, aunque estén
// metidas en otro componente, para que se acomoden en la pantalla única en vez de en una lista larga.
import { createContext } from 'react';

export const InLobby = createContext(false);
