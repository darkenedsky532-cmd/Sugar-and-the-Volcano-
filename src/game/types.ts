export type GamePhase =
  | 'title'
  | 'parachuting'
  | 'playing'
  | 'paused'
  | 'victory'
  | 'gameover';

export type MonsterKind = 'imp' | 'golem' | 'stalker';

export interface HudSnapshot {
  phase: GamePhase;
  hp: number;
  maxHp: number;
  stairsBuilt: number;
  totalStairs: number;
  kills: number;
  knifeReady: boolean;
  knifeChargeProgress: number; // 0..1
  crosshairLocked: boolean;
  altitude: number;
  elapsedSeconds: number;
  damageFlash: number; // 0..1
  stairBannerText: string | null;
  portalUnlocked: boolean;
  activeMonsters: number;
  muted: boolean;
  webglError: string | null;
}

export interface StairBlueprint {
  index: number;
  position: [number, number, number];
  rotationY: number;
  width: number;
  depth: number;
  thickness: number;
}
