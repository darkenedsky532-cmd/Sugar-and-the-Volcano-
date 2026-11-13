import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { HudSnapshot } from '../game/types';

interface GameHUDProps {
  hud: HudSnapshot;
  onStart: () => void;
  onTogglePause: () => void;
  onToggleMute: () => void;
  onJoystickMove: (x: number, y: number) => void;
  onJumpChange: (pressed: boolean) => void;
  onThrowKnife: () => void;
  onCameraTurn: (dir: number) => void;
}

function formatTime(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function GameHUD({
  hud,
  onStart,
  onTogglePause,
  onToggleMute,
  onJoystickMove,
  onJumpChange,
  onThrowKnife,
  onCameraTurn,
}: GameHUDProps) {
  const [portraitFailed, setPortraitFailed] = useState(false);
  const [controlsCollapsed, setControlsCollapsed] = useState(true);

  // Virtual Joystick state (Free Fire style)
  const joyRef = useRef<HTMLDivElement | null>(null);
  const joyPointerId = useRef<number | null>(null);
  const [knobOffset, setKnobOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [joyActive, setJoyActive] = useState(false);

  const hpPct = Math.max(0, Math.min(100, (hud.hp / hud.maxHp) * 100));
  const stairPct = (hud.stairsBuilt / hud.totalStairs) * 100;

  const updateJoystickFromEvent = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = joyRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxR = rect.width * 0.36;

    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxR && dist > 0) {
      dx = (dx / dist) * maxR;
      dy = (dy / dist) * maxR;
    }

    setKnobOffset({ x: dx, y: dy });
    // +x right, +y forward (upward on screen = negative screen dy)
    onJoystickMove(dx / maxR, -dy / maxR);
  };

  const handleJoyPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    joyPointerId.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    setJoyActive(true);
    updateJoystickFromEvent(e);
  };

  const handleJoyPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (joyPointerId.current !== e.pointerId) return;
    e.stopPropagation();
    updateJoystickFromEvent(e);
  };

  const handleJoyPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (joyPointerId.current !== e.pointerId) return;
    e.stopPropagation();
    joyPointerId.current = null;
    setJoyActive(false);
    setKnobOffset({ x: 0, y: 0 });
    onJoystickMove(0, 0);
  };

  if (hud.webglError) {
    return (
      <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center bg-[#140e0d] p-6">
        <div className="max-w-md rounded-xl border border-stone-800 bg-[#1c1412] p-6 text-center">
          <h1 className="font-display text-2xl font-bold text-stone-100">
            3D Viewport Unavailable
          </h1>
          <p className="mt-2 text-sm text-stone-400">{hud.webglError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between">
      {/* Subtle red hit vignette */}
      {hud.damageFlash > 0 && (
        <div
          className="pointer-events-none absolute inset-0 transition-opacity duration-75"
          style={{
            opacity: hud.damageFlash * 0.55,
            background:
              'radial-gradient(circle at center, transparent 45%, rgba(220, 38, 38, 0.72) 100%)',
          }}
        />
      )}

      {/* UPPER SIDE HUD (All stats & shout banner anchored strictly at top edge, clear of center 3D character face) */}
      {(hud.phase === 'parachuting' ||
        hud.phase === 'playing' ||
        hud.phase === 'paused') && (
        <div className="pointer-events-none flex flex-col items-center">
          <header className="pointer-events-none flex w-full items-start justify-between gap-3 px-4 pt-3 sm:px-6">
            {/* Upper-Left: Clean Character Portrait + Health & Combat Stats beside it */}
            <div
              onPointerDown={(e) => e.stopPropagation()}
              className="pointer-events-auto flex items-center gap-3 rounded-xl border border-white/10 bg-[#18110f]/90 px-3 py-2"
            >
              <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-white/15 bg-[#2a1d1a]">
                {!portraitFailed ? (
                  <img
                    src="/assets/aistudio/game_character_9a27433f.jpg"
                    alt="Survivor portrait"
                    referrerPolicy="no-referrer"
                    onError={() => setPortraitFailed(true)}
                    className="h-full w-full object-cover object-top"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-amber-300">
                    CA
                  </div>
                )}
              </div>

              <div className="min-w-[138px] sm:min-w-[155px]">
                <div className="flex items-center justify-between text-xs font-medium text-stone-300">
                  <span>HP</span>
                  <span className="font-mono-num text-stone-100">
                    {hud.hp} / {hud.maxHp}
                  </span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-sm bg-stone-800">
                  <div
                    className="h-full transition-all duration-150"
                    style={{
                      width: `${hpPct}%`,
                      backgroundColor:
                        hpPct > 50 ? '#22c55e' : hpPct > 25 ? '#f59e0b' : '#ef4444',
                    }}
                  />
                </div>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-stone-400">
                  <span className="text-stone-200">
                    {hud.knifeReady ? 'Knife ∞' : 'Returning'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-num">{hud.kills} Slain</span>
                </div>
              </div>
            </div>

            {/* Upper-Center: Forged Stairs Escape Progress & Altitude */}
            <div
              onPointerDown={(e) => e.stopPropagation()}
              className="pointer-events-auto hidden md:flex flex-col items-center rounded-xl border border-white/10 bg-[#18110f]/90 px-5 py-2 min-w-[265px]"
            >
              <div className="flex w-full items-center justify-between gap-4 text-xs">
                <span className="font-medium text-stone-300">
                  {hud.portalUnlocked
                    ? 'Summit Portal Open'
                    : 'Escape Stairs Forged'}
                </span>
                <span className="font-mono-num font-bold text-amber-400">
                  {hud.stairsBuilt} / {hud.totalStairs}
                </span>
              </div>
              <div className="mt-1.5 grid w-full grid-cols-12 gap-1">
                {Array.from({ length: hud.totalStairs }).map((_, idx) => (
                  <div
                    key={idx}
                    className={`h-2 rounded-[2px] transition-colors duration-200 ${
                      idx < hud.stairsBuilt
                        ? hud.portalUnlocked
                          ? 'bg-sky-400'
                          : 'bg-amber-400'
                        : 'bg-stone-800'
                    }`}
                  />
                ))}
              </div>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-stone-400">
                <span>Alt {hud.altitude.toFixed(1)}m</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-num">{formatTime(hud.elapsedSeconds)}</span>
              </div>
            </div>

            {/* Upper-Right: Compact Mobile Stairs Counter + Audio & Pause */}
            <div
              onPointerDown={(e) => e.stopPropagation()}
              className="pointer-events-auto flex items-center gap-2"
            >
              <div className="md:hidden rounded-lg border border-white/10 bg-[#18110f]/90 px-3 py-2 text-right">
                <div className="font-mono-num text-xs font-bold text-amber-400">
                  {hud.stairsBuilt}/{hud.totalStairs} Stairs
                </div>
                <div className="font-mono-num text-[10px] text-stone-400">
                  {hud.altitude.toFixed(0)}m · {formatTime(hud.elapsedSeconds)}
                </div>
              </div>

              <button
                type="button"
                onClick={onToggleMute}
                aria-label={hud.muted ? 'Unmute audio' : 'Mute audio'}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-[#18110f]/90 text-stone-200 transition-colors hover:bg-stone-800 focus-visible:outline-2 focus-visible:outline-amber-400"
              >
                {hud.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={onTogglePause}
                aria-label={hud.phase === 'paused' ? 'Resume game' : 'Pause game'}
                className="flex h-10 items-center gap-1.5 rounded-lg border border-white/10 bg-[#18110f]/90 px-3 text-xs font-medium text-stone-200 transition-colors hover:bg-stone-800 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-amber-400"
              >
                {hud.phase === 'paused' ? (
                  <>
                    <Play className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Resume</span>
                  </>
                ) : (
                  <>
                    <Pause className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Pause</span>
                  </>
                )}
              </button>
            </div>
          </header>

          {/* Upper Event / Shout Callout Banner — strictly in the upper side, never over her face */}
          <div className="pointer-events-none mt-2.5 flex flex-col items-center px-4">
            {hud.phase === 'parachuting' && (
              <div className="rounded-lg border border-amber-500/30 bg-[#18110f]/90 px-4 py-1.5 text-center text-xs sm:text-sm font-medium text-amber-200">
                Parachute Descent — Steer toward the crater rock · Hold Dive to drop faster
              </div>
            )}
            {hud.phase === 'playing' && hud.stairBannerText && (
              <div className="rounded-lg border border-amber-400/45 bg-[#18110f]/95 px-4 py-1.5 text-center font-display text-sm sm:text-base font-bold tracking-wide text-amber-300 shadow-lg">
                {hud.stairBannerText}
              </div>
            )}
          </div>
        </div>
      )}

      {/* FREE FIRE-STYLE ERGONOMIC BOTTOM CONTROLS */}
      {(hud.phase === 'parachuting' || hud.phase === 'playing') && (
        <div className="pointer-events-none flex items-end justify-between px-4 pb-5 sm:px-8 sm:pb-7">
          {/* Bottom-Left: Free Fire Virtual Movement Joystick */}
          <div
            ref={joyRef}
            onPointerDown={handleJoyPointerDown}
            onPointerMove={handleJoyPointerMove}
            onPointerUp={handleJoyPointerUp}
            onPointerCancel={handleJoyPointerUp}
            className="pointer-events-auto relative flex h-32 w-32 sm:h-36 sm:w-36 touch-none items-center justify-center rounded-full border-2 border-white/20 bg-[#140e0d]/70 shadow-xl"
            aria-label="Movement joystick"
          >
            {/* Subtle directional ticks */}
            <div className="pointer-events-none absolute inset-3 rounded-full border border-white/10" />
            <span className="pointer-events-none absolute top-2 text-[9px] font-bold text-white/35">
              W
            </span>
            <span className="pointer-events-none absolute bottom-2 text-[9px] font-bold text-white/35">
              S
            </span>
            <span className="pointer-events-none absolute left-2.5 text-[9px] font-bold text-white/35">
              A
            </span>
            <span className="pointer-events-none absolute right-2.5 text-[9px] font-bold text-white/35">
              D
            </span>

            {/* Draggable Thumb Knob */}
            <div
              className={`pointer-events-none h-14 w-14 rounded-full border-2 transition-colors ${
                joyActive
                  ? 'border-amber-300 bg-amber-500/85'
                  : 'border-white/40 bg-stone-200/35'
              }`}
              style={{
                transform: `translate3d(${knobOffset.x}px, ${knobOffset.y}px, 0)`,
              }}
            />
          </div>

          {/* Bottom-Center: Optional Collapsible Keyboard Tip */}
          <div className="pointer-events-none hidden lg:flex flex-col items-center">
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setControlsCollapsed((v) => !v)}
              className="pointer-events-auto mb-1 flex items-center gap-1 rounded-md border border-white/10 bg-[#18110f]/85 px-2.5 py-1 text-[11px] font-medium text-stone-300 hover:bg-stone-800"
            >
              {controlsCollapsed ? (
                <>
                  <ChevronUp className="h-3 w-3" />
                  <span>Keys</span>
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3" />
                  <span>Hide</span>
                </>
              )}
            </button>
            {!controlsCollapsed && (
              <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-white/10 bg-[#18110f]/90 px-4 py-1.5 text-xs text-stone-300">
                <span>WASD Move</span>
                <span aria-hidden="true" className="text-stone-600">·</span>
                <span>Space Jump</span>
                <span aria-hidden="true" className="text-stone-600">·</span>
                <span className="text-amber-300">Click / F Throw</span>
                <span aria-hidden="true" className="text-stone-600">·</span>
                <span>Drag / Q E Camera ({Math.round(stairPct)}%)</span>
              </div>
            )}
          </div>

          {/* Bottom-Right: Free Fire Action Cluster (Throw Knife, Jump/Dive, Camera Rotate) */}
          <div
            onPointerDown={(e) => e.stopPropagation()}
            className="pointer-events-auto relative flex items-end gap-3"
          >
            {/* Left column of right cluster: Camera turn & Jump/Dive */}
            <div className="flex flex-col items-end gap-2.5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Rotate camera left"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onCameraTurn(1);
                  }}
                  onPointerUp={() => onCameraTurn(0)}
                  onPointerLeave={() => onCameraTurn(0)}
                  onPointerCancel={() => onCameraTurn(0)}
                  className="flex h-11 w-11 touch-none items-center justify-center rounded-full border border-white/20 bg-[#18110f]/85 text-stone-200 active:scale-95 active:bg-stone-700"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Rotate camera right"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onCameraTurn(-1);
                  }}
                  onPointerUp={() => onCameraTurn(0)}
                  onPointerLeave={() => onCameraTurn(0)}
                  onPointerCancel={() => onCameraTurn(0)}
                  className="flex h-11 w-11 touch-none items-center justify-center rounded-full border border-white/20 bg-[#18110f]/85 text-stone-200 active:scale-95 active:bg-stone-700"
                >
                  <RotateCw className="h-4 w-4" />
                </button>
              </div>

              <button
                type="button"
                aria-label={hud.phase === 'parachuting' ? 'Dive faster' : 'Jump'}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onJumpChange(true);
                }}
                onPointerUp={() => onJumpChange(false)}
                onPointerLeave={() => onJumpChange(false)}
                onPointerCancel={() => onJumpChange(false)}
                className="flex h-16 w-16 touch-none flex-col items-center justify-center rounded-full border-2 border-white/25 bg-[#18110f]/85 text-stone-100 shadow-lg active:scale-95 active:border-sky-400 active:bg-sky-500/30"
              >
                <ArrowUp className="h-5 w-5" />
                <span className="font-display text-[10px] font-bold tracking-wider">
                  {hud.phase === 'parachuting' ? 'DIVE' : 'JUMP'}
                </span>
              </button>
            </div>

            {/* Primary Large Fire / Throw Knife Button (Free Fire Fire-button anchor) */}
            <button
              type="button"
              aria-label="Throw knife"
              onPointerDown={(e) => {
                e.stopPropagation();
                onThrowKnife();
              }}
              className={`flex h-22 w-22 sm:h-24 sm:w-24 touch-none flex-col items-center justify-center rounded-full border-[3px] shadow-2xl transition-transform active:scale-90 ${
                hud.knifeReady
                  ? 'border-amber-300 bg-amber-500/90 text-stone-950'
                  : 'border-white/25 bg-[#2a1c17]/90 text-stone-300'
              }`}
            >
              <Crosshair className="h-7 w-7 stroke-[2.4]" />
              <span className="mt-0.5 font-display text-xs font-extrabold tracking-wider">
                THROW
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Title Screen Overlay */}
      {hud.phase === 'title' && (
        <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-[#120b0a]/65 p-6">
          <div className="w-full max-w-2xl rounded-2xl border border-white/12 bg-[#17100e]/95 p-6 sm:p-8 shadow-2xl">
            <div className="flex flex-col sm:flex-row items-center sm:items-stretch gap-6">
              {/* Character Portrait */}
              <div className="w-40 h-44 sm:w-44 sm:h-auto shrink-0 overflow-hidden rounded-xl border border-white/12 bg-[#251a17]">
                {!portraitFailed ? (
                  <img
                    src="/assets/aistudio/game_character_9a27433f.jpg"
                    alt="Volcano survivor girl"
                    referrerPolicy="no-referrer"
                    onError={() => setPortraitFailed(true)}
                    className="h-full w-full object-cover object-top"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center font-display text-2xl font-bold text-amber-400">
                    HERO
                  </div>
                )}
              </div>

              {/* Game Title & Clear Rules */}
              <div className="flex flex-1 flex-col justify-between text-center sm:text-left">
                <div>
                  <div className="text-xs font-medium text-amber-400">
                    3D Volcano Survival Action
                  </div>
                  <h1 className="mt-1 font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-stone-100">
                    Caldera Ascent
                  </h1>
                  <p className="mt-3 text-sm leading-relaxed text-stone-300">
                    Parachute straight into an active volcanic crater, survive waves of
                    respawning magma monsters with infinite returning knives, and forge one
                    escape stair from every monster you slay.
                  </p>
                </div>

                <div className="mt-5 space-y-1.5 border-t border-white/10 pt-4 text-xs text-stone-300">
                  <div>01. Parachute safely onto the central basalt island</div>
                  <div>02. Throw infinite knives to hand out candy & forge stairs</div>
                  <div>03. Climb all 12 forged stairs to escape through the Summit Portal</div>
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-center sm:justify-start gap-3">
                  <button
                    type="button"
                    onClick={onStart}
                    className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-6 py-3 text-sm font-bold text-stone-950 transition-colors hover:bg-amber-400 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-amber-300"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    <span>Jump Into Volcano</span>
                  </button>
                  <button
                    type="button"
                    onClick={onToggleMute}
                    className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-stone-900 px-4 py-3 text-sm font-medium text-stone-200 transition-colors hover:bg-stone-800 whitespace-nowrap shrink-0"
                  >
                    {hud.muted ? (
                      <>
                        <VolumeX className="h-4 w-4" />
                        <span>Sound Off</span>
                      </>
                    ) : (
                      <>
                        <Volume2 className="h-4 w-4" />
                        <span>Sound On</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pause Modal */}
      {hud.phase === 'paused' && (
        <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-black/55 p-6">
          <div className="w-full max-w-sm rounded-2xl border border-white/12 bg-[#17100e]/95 p-6 text-center">
            <h2 className="font-display text-2xl font-bold text-stone-100">
              Game Paused
            </h2>
            <p className="mt-2 text-xs text-stone-400">
              Stairs Forged: {hud.stairsBuilt} / {hud.totalStairs} · Monsters Slain:{' '}
              {hud.kills}
            </p>
            <div className="mt-5 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={onTogglePause}
                className="w-full rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-bold text-stone-950 transition-colors hover:bg-amber-400"
              >
                Resume
              </button>
              <button
                type="button"
                onClick={onStart}
                className="w-full rounded-lg border border-white/15 bg-stone-900 px-4 py-2.5 text-sm font-medium text-stone-200 transition-colors hover:bg-stone-800"
              >
                Restart Run
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Victory Overlay */}
      {hud.phase === 'victory' && (
        <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-[#0c1624]/70 p-6">
          <div className="w-full max-w-md rounded-2xl border border-sky-400/30 bg-[#14161d]/95 p-7 text-center shadow-2xl">
            <div className="text-xs font-semibold text-sky-400">Volcano Escaped</div>
            <h2 className="mt-1 font-display text-3xl font-extrabold text-stone-100">
              You Reached the Summit!
            </h2>
            <p className="mt-2 text-sm text-stone-300">
              You survived the caldera, forged all {hud.totalStairs} volcanic stairs,
              and climbed out to safety.
            </p>
            <div className="mt-5 grid grid-cols-3 gap-3 border-y border-white/10 py-4 text-center">
              <div>
                <div className="text-[11px] text-stone-400">Time</div>
                <div className="font-mono-num text-lg font-bold text-stone-100">
                  {formatTime(hud.elapsedSeconds)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-stone-400">Slain</div>
                <div className="font-mono-num text-lg font-bold text-amber-400">
                  {hud.kills}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-stone-400">Stairs</div>
                <div className="font-mono-num text-lg font-bold text-sky-400">
                  {hud.stairsBuilt} / {hud.totalStairs}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onStart}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-sky-400 px-5 py-3 text-sm font-bold text-slate-950 transition-colors hover:bg-sky-300"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Play Again</span>
            </button>
          </div>
        </div>
      )}

      {/* Game Over Overlay */}
      {hud.phase === 'gameover' && (
        <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-[#1c0907]/75 p-6">
          <div className="w-full max-w-md rounded-2xl border border-red-500/30 bg-[#1a100f]/95 p-7 text-center shadow-2xl">
            <div className="text-xs font-semibold text-red-400">Overwhelmed</div>
            <h2 className="mt-1 font-display text-3xl font-extrabold text-stone-100">
              Fallen in the Caldera
            </h2>
            <p className="mt-2 text-sm text-stone-300">
              Keep moving, dodge magma charges, and throw knives continuously to build
              your escape staircase.
            </p>
            <div className="mt-5 grid grid-cols-3 gap-3 border-y border-white/10 py-4 text-center">
              <div>
                <div className="text-[11px] text-stone-400">Time</div>
                <div className="font-mono-num text-lg font-bold text-stone-100">
                  {formatTime(hud.elapsedSeconds)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-stone-400">Slain</div>
                <div className="font-mono-num text-lg font-bold text-amber-400">
                  {hud.kills}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-stone-400">Stairs</div>
                <div className="font-mono-num text-lg font-bold text-stone-100">
                  {hud.stairsBuilt} / {hud.totalStairs}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onStart}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-5 py-3 text-sm font-bold text-stone-950 transition-colors hover:bg-amber-400"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Try Again</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
