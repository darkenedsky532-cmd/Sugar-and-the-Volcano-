/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import { GameHUD } from './components/GameHUD';
import { VolcanoEngine } from './game/VolcanoEngine';
import type { HudSnapshot } from './game/types';

const INITIAL_HUD: HudSnapshot = {
  phase: 'title',
  hp: 100,
  maxHp: 100,
  stairsBuilt: 0,
  totalStairs: 12,
  kills: 0,
  knifeReady: true,
  knifeChargeProgress: 1,
  crosshairLocked: false,
  altitude: 34,
  elapsedSeconds: 0,
  damageFlash: 0,
  stairBannerText: null,
  portalUnlocked: false,
  activeMonsters: 0,
  muted: false,
  webglError: null,
};

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<VolcanoEngine | null>(null);
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const engine = new VolcanoEngine(mount, (snapshot) => {
      setHud(snapshot);
    });
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#110c0b]">
      {/* Isolated WebGL canvas mount — React HUD renders outside this node */}
      <div
        ref={mountRef}
        className="absolute inset-0 h-full w-full cursor-crosshair"
      />
      <GameHUD
        hud={hud}
        onStart={() => engineRef.current?.startNewRun()}
        onTogglePause={() => engineRef.current?.togglePause()}
        onToggleMute={() => engineRef.current?.toggleMute()}
        onJoystickMove={(x, y) => engineRef.current?.setVirtualJoystick(x, y)}
        onJumpChange={(pressed) => engineRef.current?.setVirtualJump(pressed)}
        onFireChange={(pressed) => engineRef.current?.setVirtualFire(pressed)}
        onCameraLook={(dx, dy) => engineRef.current?.rotateCameraBy(dx, dy)}
      />
    </main>
  );
}
