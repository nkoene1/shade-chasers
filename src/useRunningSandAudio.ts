import { useFrame } from "@react-three/fiber";
import type { RapierRigidBody } from "@react-three/rapier";
import { useEffect, useRef } from "react";
import { gameState } from "./gameState";

const RUNNING_SAND_AUDIO_PATH = "/audio/run-on-sand.ogg";
const SPEED_WINDOW_SEC = 0.1;
const START_SPEED = 0.45;
const STOP_SPEED = 0.25;
const MAX_VOLUME = 0.35;
const FADE_RATE = 10;

type PosSample = { x: number; z: number; t: number };

interface UseRunningSandAudioOptions {
  rigidBodyRef: React.RefObject<RapierRigidBody | null>;
  groundedRef: React.RefObject<boolean>;
  rollingRef: React.RefObject<boolean>;
  deadRef: React.RefObject<boolean>;
  maxSpeed: number;
}

export function useRunningSandAudio({
  rigidBodyRef,
  groundedRef,
  rollingRef,
  deadRef,
  maxSpeed,
}: UseRunningSandAudioOptions) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playPendingRef = useRef(false);
  const playingRef = useRef(false);
  const posSamples = useRef<PosSample[]>([]);

  useEffect(() => {
    const audio = new Audio(RUNNING_SAND_AUDIO_PATH);
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = 0;
    audioRef.current = audio;

    return () => {
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
  }, []);

  useFrame((_, delta) => {
    const audio = audioRef.current;
    if (!audio) return;

    const rb = rigidBodyRef.current;
    const canPlay =
      rb != null &&
      gameState.phase === "running" &&
      groundedRef.current &&
      !rollingRef.current &&
      !deadRef.current;

    let horizontalSpeed = 0;
    if (canPlay && rb) {
      const pos = rb.translation();
      const now = performance.now() / 1000;
      posSamples.current.push({ x: pos.x, z: pos.z, t: now });

      while (
        posSamples.current.length > 2 &&
        posSamples.current[1].t <= now - SPEED_WINDOW_SEC
      ) {
        posSamples.current.shift();
      }

      const oldest = posSamples.current[0];
      const sampleDt = now - oldest.t;
      if (sampleDt > 1e-3) {
        const dx = pos.x - oldest.x;
        const dz = pos.z - oldest.z;
        horizontalSpeed = Math.sqrt(dx * dx + dz * dz) / sampleDt;
      }
    } else {
      posSamples.current.length = 0;
    }

    const speedThreshold = playingRef.current ? STOP_SPEED : START_SPEED;
    const shouldPlay = canPlay && horizontalSpeed > speedThreshold;
    playingRef.current = shouldPlay;

    if (shouldPlay && audio.paused && !playPendingRef.current) {
      playPendingRef.current = true;
      void audio
        .play()
        .catch(() => undefined)
        .finally(() => {
          playPendingRef.current = false;
        });
    }

    const targetVolume = shouldPlay ? MAX_VOLUME : 0;
    const fadeT = 1 - Math.exp(-FADE_RATE * delta);
    audio.volume += (targetVolume - audio.volume) * fadeT;

    if (shouldPlay && maxSpeed > 0) {
      const speedRatio = horizontalSpeed / maxSpeed;
      audio.playbackRate = Math.min(1.15, Math.max(0.85, speedRatio));
    }

    if (!shouldPlay && audio.volume < 0.01 && !audio.paused) {
      audio.pause();
    }
  });
}
