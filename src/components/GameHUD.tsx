import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  ArrowUp,
  Crosshair,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Smartphone,
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
  onFireChange: (pressed: boolean) => void;
  onCameraLook: (dx: number, dy: number) => void;
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
  onFireChange,
  onCameraLook,
}: GameHUDProps) {
  const [portraitFailed, setPortraitFailed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPortraitMobile, setIsPortraitMobile] = useState(false);
  const [portraitDismissed, setPortraitDismissed] = useState(false);

  // Left-thumb Joystick state (pointerId isolated)
  const joyRef = useRef<HTMLDivElement | null>(null);
  const joyPointerId = useRef<number | null>(null);
  const [knobOffset, setKnobOffset] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [joyActive, setJoyActive] = useState(false);

  // Right-thumb Aim Look state (pointerId isolated)
  const aimPointerId = useRef<number | null>(null);
  const lastAimPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Right-thumb Fire+Drag state (pointerId isolated)
  const firePointerId = useRef<number | null>(null);
  const lastFirePos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [fireActive, setFireActive] = useState(false);

  useEffect(() => {
    const checkLayout = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setIsPortraitMobile(w < h && w <= 900);
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    checkLayout();
    window.addEventListener('resize', checkLayout);
    document.addEventListener('fullscreenchange', checkLayout);
    return () => {
      window.removeEventListener('resize', checkLayout);
      document.removeEventListener('fullscreenchange', checkLayout);
    };
  }, []);

  const enterLandscapeFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (o: string) => Promise<void>;
      };
      if (orientation && typeof orientation.lock === 'function') {
        await orientation.lock('landscape');
      }
    } catch {
      // Orientation lock or fullscreen may be restricted in desktop/iframe browsers
    }
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await enterLandscapeFullscreen();
      }
    } catch {
      // Ignore if blocked
    }
  };

  const hpPct = Math.max(0, Math.min(100, (hud.hp / hud.maxHp) * 100));

  // Left-Thumb Movement Joystick Handlers
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

  // Right-Thumb Free Touch-Look Aim Pad Handlers
  const handleAimPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    aimPointerId.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    lastAimPos.current = { x: e.clientX, y: e.clientY };
  };

  const handleAimPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (aimPointerId.current !== e.pointerId) return;
    e.stopPropagation();
    const dx = e.clientX - lastAimPos.current.x;
    const dy = e.clientY - lastAimPos.current.y;
    lastAimPos.current = { x: e.clientX, y: e.clientY };
    onCameraLook(dx, dy);
  };

  const handleAimPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (aimPointerId.current !== e.pointerId) return;
    e.stopPropagation();
    aimPointerId.current = null;
  };

  // Right-Thumb Fire Button (Hold to rapid-throw + drag to track moving targets!)
  const handleFirePointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    firePointerId.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    lastFirePos.current = { x: e.clientX, y: e.clientY };
    setFireActive(true);
    onFireChange(true);
  };

  const handleFirePointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (firePointerId.current !== e.pointerId) return;
    e.stopPropagation();
    const dx = e.clientX - lastFirePos.current.x;
    const dy = e.clientY - lastFirePos.current.y;
    lastFirePos.current = { x: e.clientX, y: e.clientY };
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
      onCameraLook(dx * 0.85, dy * 0.85);
    }
  };

  const handleFirePointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (firePointerId.current !== e.pointerId) return;
    e.stopPropagation();
    firePointerId.current = null;
    setFireActive(false);
    onFireChange(false);
  };

  const isPlaying = hud.phase === 'parachuting' || hud.phase === 'playing';

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

      {/* Right-Half Dual-Thumb Touch-Look Aim Layer (sits behind right-thumb Fire/Jump buttons) */}
      {isPlaying && (
        <div
          onPointerDown={handleAimPointerDown}
          onPointerMove={handleAimPointerMove}
          onPointerUp={handleAimPointerUp}
          onPointerCancel={handleAimPointerUp}
          className="pointer-events-auto absolute inset-y-0 right-0 z-0 w-1/2 touch-none"
          aria-label="Camera aim pad"
        />
      )}

      {/* Center TPS Crosshair Reticle */}
      {hud.phase === 'playing' && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
          <div
            className={`relative flex h-8 w-8 items-center justify-center transition-transform duration-75 ${
              hud.crosshairLocked ? 'scale-110' : 'scale-100'
            }`}
          >
            {/* 4 crisp reticle ticks */}
            <span
              className={`absolute top-0 h-2 w-0.5 rounded-full ${
                hud.crosshairLocked ? 'bg-amber-400' : 'bg-white/80'
              }`}
            />
            <span
              className={`absolute bottom-0 h-2 w-0.5 rounded-full ${
                hud.crosshairLocked ? 'bg-amber-400' : 'bg-white/80'
              }`}
            />
            <span
              className={`absolute left-0 h-0.5 w-2 rounded-full ${
                hud.crosshairLocked ? 'bg-amber-400' : 'bg-white/80'
              }`}
            />
            <span
              className={`absolute right-0 h-0.5 w-2 rounded-full ${
                hud.crosshairLocked ? 'bg-amber-400' : 'bg-white/80'
              }`}
            />
            {/* Center dot */}
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                hud.crosshairLocked ? 'bg-red-500' : 'bg-white'
              }`}
            />
          </div>
        </div>
      )}

      {/* COMPACT UPPER HUD BAR (Landscape mobile & desktop optimized, never blocks center TPS view) */}
      {(isPlaying || hud.phase === 'paused') && (
        <div className="pointer-events-none relative z-10 flex flex-col items-center">
          <header className="pointer-events-none flex w-full items-start justify-between gap-2 px-3 pt-2.5 sm:px-5 sm:pt-3">
            {/* Upper-Left: Portrait + Compact HP & Slain */}
            <div
              onPointerDown={(e) => e.stopPropagation()}
              className="pointer-events-auto flex items-center gap-2.5 rounded-xl border border-white/10 bg-[#18110f]/88 px-2.5 py-1.5"
            >
              <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-white/15 bg-[#2a1d1a]">
                {!portraitFailed ? (
                  <img
                    src="/assets/aistudio/game_character_9a27433f.jpg"
                    alt="Survivor portrait"
                    referrerPolicy="no-referrer"
                    onError={() => setPortraitFailed(true)}
                    className="h-full w-full object-cover object-top"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[11px] font-semibold text-amber-300">
                    CA
                  </div>
                )}
              </div>

              <div className="min-w-[116px] sm:min-w-[144px]">
                <div className="flex items-center justify-between text-[11px] font-medium text-stone-300">
                  <span>HP</span>
                  <span className="font-mono-num text-stone-100">
                    {hud.hp}/{hud.maxHp}
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-sm bg-stone-800">
                  <div
                    className="h-full transition-all duration-150"
                    style={{
                      width: `${hpPct}%`,
                      backgroundColor:
                        hpPct > 50 ? '#22c55e' : hpPct > 25 ? '#f59e0b' : '#ef4444',
                    }}
                  />
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-[10px] text-stone-400">
                  <span className="text-stone-200">
                    {hud.knifeReady ? 'Knife ∞' : 'Returning'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-num">{hud.kills} Slain</span>
                </div>
              </div>
            </div>

            {/* Upper-Center: Compact Stairs Escape Progress (visible on landscape mobile too!) */}
            <div
              onPointerDown={(e) => e.stopPropagation()}
              className="pointer-events-auto flex flex-col items-center rounded-xl border border-white/10 bg-[#18110f]/88 px-3 py-1.5 min-w-[175px] sm:min-w-[240px]"
            >
              <div className="flex w-full items-center justify-between gap-2 text-[11px]">
                <span className="font-medium text-stone-300 truncate">
                  {hud.portalUnlocked ? 'Portal Open' : 'Stairs Forged'}
                </span>
                <span className="font-mono-num font-bold text-amber-400">
                  {hud.stairsBuilt}/{hud.totalStairs}
                </span>
              </div>
              <div className="mt-1 grid w-full grid-cols-12 gap-0.5 sm:gap-1">
                {Array.from({ length: hud.totalStairs }).map((_, idx) => (
                  <div
                    key={idx}
                    className={`h-1.5 rounded-[2px] transition-colors duration-200 ${
                      idx < hud.stairsBuilt
                        ? hud.portalUnlocked
                          ? 'bg-sky-400'
                          : 'bg-amber-400'
                        : 'bg-stone-800'
                    }`}
                  />
                ))}
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-[10px] text-stone-400">
                <span>Alt {hud.altitude.toFixed(0)}m</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-num">{formatTime(hud.elapsedSeconds)}</span>
              </div>
            </div>

            {/* Upper-Right: Fullscreen, Audio & Pause */}
            <div
              onPointerDown={(e) => e.stopPropagation()}
              className="pointer-events-auto flex items-center gap-1.5"
            >
              <button
                type="button"
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen landscape'}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-[#18110f]/88 text-stone-200 transition-colors hover:bg-stone-800"
              >
                {isFullscreen ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </button>
              <button
                type="button"
                onClick={onToggleMute}
                aria-label={hud.muted ? 'Unmute audio' : 'Mute audio'}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-[#18110f]/88 text-stone-200 transition-colors hover:bg-stone-800"
              >
                {hud.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={onTogglePause}
                aria-label={hud.phase === 'paused' ? 'Resume game' : 'Pause game'}
                className="flex h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-[#18110f]/88 px-2.5 text-xs font-medium text-stone-200 transition-colors hover:bg-stone-800 whitespace-nowrap shrink-0"
              >
                {hud.phase === 'paused' ? (
                  <Play className="h-3.5 w-3.5" />
                ) : (
                  <Pause className="h-3.5 w-3.5" />
                )}
                <span className="hidden sm:inline">
                  {hud.phase === 'paused' ? 'Resume' : 'Pause'}
                </span>
              </button>
            </div>
          </header>

          {/* Upper Shout / Event Callout Banner (never blocks center crosshair) */}
          <div className="pointer-events-none mt-1.5 flex flex-col items-center px-4">
            {hud.phase === 'parachuting' && (
              <div className="rounded-lg border border-amber-500/30 bg-[#18110f]/88 px-3 py-1 text-center text-[11px] sm:text-xs font-medium text-amber-200">
                Parachute Descent — Left thumb steers · Right thumb aims · Hold Dive to drop faster
              </div>
            )}
            {hud.phase === 'playing' && hud.stairBannerText && (
              <div className="rounded-lg border border-amber-400/45 bg-[#18110f]/92 px-3.5 py-1 text-center font-display text-xs sm:text-sm font-bold tracking-wide text-amber-300 shadow-lg">
                {hud.stairBannerText}
              </div>
            )}
          </div>
        </div>
      )}

      {/* DUAL-THUMB MOBILE TPS CONTROLS (Left Thumb Move Joystick + Right Thumb Fire & Jump) */}
      {isPlaying && (
        <div className="pointer-events-none relative z-10 flex items-end justify-between px-4 pb-4 sm:px-7 sm:pb-5">
          {/* Bottom-Left: Left-Thumb Movement Joystick */}
          <div
            ref={joyRef}
            onPointerDown={handleJoyPointerDown}
            onPointerMove={handleJoyPointerMove}
            onPointerUp={handleJoyPointerUp}
            onPointerCancel={handleJoyPointerUp}
            className="pointer-events-auto relative flex h-28 w-28 sm:h-32 sm:w-32 touch-none items-center justify-center rounded-full border-2 border-white/25 bg-[#140e0d]/60 shadow-xl"
            aria-label="Left thumb movement joystick"
          >
            <div className="pointer-events-none absolute inset-3 rounded-full border border-white/10" />
            <div
              className={`pointer-events-none h-12 w-12 sm:h-14 sm:w-14 rounded-full border-2 transition-colors ${
                joyActive
                  ? 'border-amber-300 bg-amber-500/85'
                  : 'border-white/45 bg-stone-200/35'
              }`}
              style={{
                transform: `translate3d(${knobOffset.x}px, ${knobOffset.y}px, 0)`,
              }}
            />
          </div>

          {/* Bottom-Right: Right-Thumb TPS Action Cluster (Jump/Dive + Hold-to-Throw & Drag Aim) */}
          <div
            onPointerDown={(e) => e.stopPropagation()}
            className="pointer-events-auto flex items-end gap-3"
          >
            <button
              type="button"
              aria-label={hud.phase === 'parachuting' ? 'Dive faster' : 'Jump'}
              onPointerDown={(e) => {
                e.stopPropagation();
                onJumpChange(true);
              }}
              onPointerUp={(e) => {
                e.stopPropagation();
                onJumpChange(false);
              }}
              onPointerLeave={() => onJumpChange(false)}
              onPointerCancel={() => onJumpChange(false)}
              className="flex h-14 w-14 sm:h-16 sm:w-16 touch-none flex-col items-center justify-center rounded-full border-2 border-white/25 bg-[#18110f]/80 text-stone-100 shadow-lg active:scale-95 active:border-sky-400 active:bg-sky-500/35"
            >
              <ArrowUp className="h-5 w-5" />
              <span className="font-display text-[10px] font-bold tracking-wider">
                {hud.phase === 'parachuting' ? 'DIVE' : 'JUMP'}
              </span>
            </button>

            <button
              type="button"
              aria-label="Throw knife"
              onPointerDown={handleFirePointerDown}
              onPointerMove={handleFirePointerMove}
              onPointerUp={handleFirePointerUp}
              onPointerCancel={handleFirePointerUp}
              className={`flex h-20 w-20 sm:h-22 sm:w-22 touch-none flex-col items-center justify-center rounded-full border-[3px] shadow-2xl transition-transform ${
                fireActive ? 'scale-92' : 'scale-100'
              } ${
                hud.knifeReady
                  ? 'border-amber-300 bg-amber-500/90 text-stone-950'
                  : 'border-white/25 bg-[#2a1c17]/90 text-stone-300'
              }`}
            >
              <Crosshair className="h-7 w-7 stroke-[2.4]" />
              <span className="mt-0.5 font-display text-[11px] font-extrabold tracking-wider">
                THROW
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Portrait Mobile Orientation Prompt (encourages Landscape Dual-Thumb TPS) */}
      {isPortraitMobile && !portraitDismissed && (
        <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-[#120b0a]/92 p-6">
          <div className="max-w-xs rounded-2xl border border-amber-400/30 bg-[#1a110f] p-6 text-center shadow-2xl">
            <Smartphone className="mx-auto h-10 w-10 rotate-90 text-amber-400" />
            <h2 className="mt-3 font-display text-xl font-bold text-stone-100">
              Rotate to Landscape
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-stone-300">
              Caldera Ascent is built for landscape dual-thumb TPS controls: left thumb
              moves, right thumb aims &amp; throws knives.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={enterLandscapeFullscreen}
                className="w-full rounded-lg bg-amber-500 px-4 py-2.5 text-xs font-bold text-stone-950 hover:bg-amber-400"
              >
                Switch to Landscape Fullscreen
              </button>
              <button
                type="button"
                onClick={() => setPortraitDismissed(true)}
                className="w-full rounded-lg border border-white/15 bg-stone-900 px-4 py-2 text-xs font-medium text-stone-300 hover:bg-stone-800"
              >
                Continue Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Title Screen Overlay (Landscape Mobile + Desktop Responsive) */}
      {hud.phase === 'title' && (
        <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center bg-[#120b0a]/65 p-3 sm:p-6">
          <div className="w-full max-w-2xl rounded-2xl border border-white/12 bg-[#17100e]/95 p-4 sm:p-7 shadow-2xl">
            <div className="flex flex-row items-center sm:items-stretch gap-4 sm:gap-6">
              {/* Character Portrait */}
              <div className="w-28 h-36 sm:w-44 sm:h-auto shrink-0 overflow-hidden rounded-xl border border-white/12 bg-[#251a17]">
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
              <div className="flex flex-1 flex-col justify-between text-left">
                <div>
                  <div className="text-[11px] sm:text-xs font-medium text-amber-400">
                    Landscape Mobile TPS · Dual-Thumb Survival
                  </div>
                  <h1 className="mt-0.5 font-display text-2xl sm:text-4xl font-extrabold tracking-tight text-stone-100">
                    Caldera Ascent
                  </h1>
                  <p className="mt-1.5 sm:mt-2.5 text-xs sm:text-sm leading-relaxed text-stone-300">
                    Parachute into an active volcanic crater, aim with your right thumb
                    and throw infinite knives at respawning monsters, hand out candy, and
                    forge 12 stairs to escape.
                  </p>
                </div>

                <div className="mt-3 sm:mt-4 space-y-1 border-t border-white/10 pt-2.5 text-[11px] sm:text-xs text-stone-300">
                  <div>Left Thumb: Move &amp; Steer Parachute</div>
                  <div>Right Thumb: Swipe Screen to Aim · Hold Throw / Tap Jump</div>
                </div>

                <div className="mt-3 sm:mt-5 flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      enterLandscapeFullscreen();
                      onStart();
                    }}
                    className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-5 py-2.5 text-xs sm:text-sm font-bold text-stone-950 transition-colors hover:bg-amber-400 whitespace-nowrap shrink-0"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    <span>Jump Into Volcano</span>
                  </button>
                  <button
                    type="button"
                    onClick={onToggleMute}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-stone-900 px-3.5 py-2.5 text-xs sm:text-sm font-medium text-stone-200 transition-colors hover:bg-stone-800 whitespace-nowrap shrink-0"
                  >
                    {hud.muted ? (
                      <>
                        <VolumeX className="h-4 w-4" />
                        <span>Muted</span>
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
        <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center bg-black/55 p-4">
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
        <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center bg-[#0c1624]/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-sky-400/30 bg-[#14161d]/95 p-6 text-center shadow-2xl">
            <div className="text-xs font-semibold text-sky-400">Volcano Escaped</div>
            <h2 className="mt-1 font-display text-2xl sm:text-3xl font-extrabold text-stone-100">
              You Reached the Summit!
            </h2>
            <p className="mt-2 text-xs sm:text-sm text-stone-300">
              You survived the caldera, forged all {hud.totalStairs} volcanic stairs,
              and climbed out to safety.
            </p>
            <div className="mt-4 grid grid-cols-3 gap-3 border-y border-white/10 py-3 text-center">
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
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-sky-400 px-5 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-sky-300"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Play Again</span>
            </button>
          </div>
        </div>
      )}

      {/* Game Over Overlay */}
      {hud.phase === 'gameover' && (
        <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center bg-[#1c0907]/75 p-4">
          <div className="w-full max-w-md rounded-2xl border border-red-500/30 bg-[#1a100f]/95 p-6 text-center shadow-2xl">
            <div className="text-xs font-semibold text-red-400">Overwhelmed</div>
            <h2 className="mt-1 font-display text-2xl sm:text-3xl font-extrabold text-stone-100">
              Fallen in the Caldera
            </h2>
            <p className="mt-2 text-xs sm:text-sm text-stone-300">
              Keep moving with your left thumb, aim with your right thumb, and throw
              knives continuously to build your escape stairs.
            </p>
            <div className="mt-4 grid grid-cols-3 gap-3 border-y border-white/10 py-3 text-center">
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
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-bold text-stone-950 transition-colors hover:bg-amber-400"
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
