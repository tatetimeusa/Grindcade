import { snake } from './snake';
import { drive } from './drive';
import { stack } from './stack';
import { bricks } from './bricks';
import type { GameDef } from './types';

// the cabinet's games, in picker order
export const GAMES: GameDef[] = [snake, drive, stack, bricks];

export const findGame = (id: string): GameDef => GAMES.find((g) => g.id === id) ?? GAMES[0];
