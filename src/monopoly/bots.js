// Bots del Monopoly. Lógica pura: dada la sala, `botMove` dice qué jugada le toca hacer a algún bot (o null si ninguno
// tiene que hacer nada). La juega la pantalla del anfitrión (ver `Game` en MonopolyApp.jsx) mandando la acción con el
// id del bot, así que el reducer los trata como a cualquier jugador y valida todo igual.
// Juegan simple: compran con colchón de plata, construyen parejo, hipotecan solo cuando deben y aceptan tratos solo si salen ganando (no los proponen).
import { JAIL_BAIL, SQUARES, groupSquares, houseCost, unmortgageCost } from './board.js';
import {
  buildProblem, debtTotal, debtsOf, findPlayer, liquidation, mortgageProblem, ownedBy, ownerOf, sellBuildingProblem,
  tradeProblem, unmortgageProblem,
} from './game.js';

export const BOT_NAMES = ['Bot Messi', 'Bot Lola', 'Bot Tito', 'Bot Cleo', 'Bot Rufo', 'Bot Mía', 'Bot Nacho', 'Bot Vera'];

const RESERVE = 200; // plata que un bot prefiere conservar al comprar
const BUILD_RESERVE = 250; // y al construir

// ¿Con esta propiedad completaría `id` el grupo de colores? (o tendría 2 compañías / 3 estaciones)
function completes(room, id, pos) {
  const sq = SQUARES[pos];
  if (!sq.g) return false;
  return groupSquares(sq.g).every((p) => p === pos || ownerOf(room, p) === id);
}

// ¿Se la bloquearía a un rival que ya tiene el resto del grupo?
function blocks(room, id, pos) {
  const sq = SQUARES[pos];
  if (!sq.g) return false;
  const others = groupSquares(sq.g).filter((p) => p !== pos).map((p) => ownerOf(room, p));
  return others.length > 0 && others.every((o) => o && o !== id && o === others[0]);
}

// Cuánto vale para `id` lo que trae un lado de un trato: plata, propiedades (el doble si le completan un color) y cartas.
function sideValue(room, id, side) {
  return side.cash + side.cards * 50 + side.props.reduce((n, pos) => n + SQUARES[pos].price * (completes(room, id, pos) ? 2 : 1), 0);
}

// Un bot acepta un trato si recibe bastante más de lo que da (contando lo que le regalaría a quien propone).
function tradeMove(room, bot) {
  const t = room.trade;
  const gets = sideValue(room, bot.id, t.give);
  const gives = sideValue(room, bot.id, t.take) + sideValue(room, t.from, t.take) * 0.5;
  return !tradeProblem(room, t, true) && gets >= gives * 1.15 ? { type: 'tradeAccept' } : { type: 'tradeDecline' };
}

// Hasta cuánto paga un bot por `pos` en una subasta.
function auctionLimit(room, id, pos, cash) {
  const price = SQUARES[pos].price;
  const worth = completes(room, id, pos) ? 1.6 : blocks(room, id, pos) ? 1.3 : 0.85;
  return Math.min(Math.floor(price * worth), cash - 100);
}

function debtMove(room, bot) {
  const d = debtsOf(room, bot.id)[0];
  if (bot.cash >= d.n) return { type: 'payDebt' };
  const mine = ownedBy(room, bot.id);
  const sell = mine.find((pos) => !sellBuildingProblem(room, bot.id, pos));
  if (sell !== undefined) return { type: 'sellBuilding', pos: sell };
  const mortgage = mine.find((pos) => !mortgageProblem(room, bot.id, pos));
  if (mortgage !== undefined && liquidation(room, bot.id) >= debtTotal(room, bot.id)) return { type: 'mortgage', pos: mortgage };
  return { type: 'bankrupt' };
}

function auctionMove(room, bot) {
  const a = room.auction;
  const next = a.bid + 10;
  return next <= auctionLimit(room, bot.id, a.pos, bot.cash) ? { type: 'bid', amount: next } : { type: 'passBid' };
}

function turnMove(room, bot) {
  if (room.step === 'roll') {
    if (bot.jail > 0) {
      if (bot.jf.length) return { type: 'useCard' };
      if (bot.cash >= JAIL_BAIL + 600) return { type: 'payBail' };
    }
    return { type: 'roll', seen: room.rollN };
  }
  if (room.step === 'buy') {
    const price = SQUARES[room.offer].price;
    const keep = completes(room, bot.id, room.offer) ? 0 : RESERVE;
    return bot.cash - price >= keep ? { type: 'buy' } : { type: 'declineBuy' };
  }
  if (room.step === 'act') {
    for (const pos of ownedBy(room, bot.id)) {
      if (room.props[pos].m && !unmortgageProblem(room, bot.id, pos) && bot.cash - unmortgageCost(pos) >= 400) return { type: 'unmortgage', pos };
    }
    const builds = ownedBy(room, bot.id)
      .filter((pos) => !buildProblem(room, bot.id, pos) && bot.cash - houseCost(pos) >= BUILD_RESERVE)
      .sort((x, y) => room.props[x].h - room.props[y].h || houseCost(x) - houseCost(y));
    if (builds.length) return { type: 'build', pos: builds[0] };
    return { type: 'endTurn', turn: room.turnNo };
  }
  return null;
}

// { botId, action } con la próxima jugada de un bot, o null si ahora no le toca a ninguno.
export function botMove(room) {
  if (!room || room.phase !== 'playing') return null;
  const isBot = (id) => Boolean(findPlayer(room, id)?.bot);
  // Las deudas frenan todo: si debe un bot, él se ocupa; si debe una persona, hay que esperarla.
  if (room.debts.length) {
    const debtor = room.debts.map((d) => findPlayer(room, d.from)).find((p) => p && !p.out);
    return debtor?.bot ? { botId: debtor.id, action: debtMove(room, debtor) } : null;
  }
  if (room.trade && isBot(room.trade.to)) return { botId: room.trade.to, action: tradeMove(room, findPlayer(room, room.trade.to)) };
  if (room.auction) {
    return isBot(room.auction.turn) ? { botId: room.auction.turn, action: auctionMove(room, findPlayer(room, room.auction.turn)) } : null;
  }
  const cur = findPlayer(room, room.current);
  if (!cur?.bot || cur.out) return null;
  const action = turnMove(room, cur);
  return action && { botId: cur.id, action };
}
