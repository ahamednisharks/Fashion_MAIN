let context: AudioContext | null = null;

/**
 * Short error tone so staff notice a failed scan without looking at the screen.
 * Silently does nothing where audio is unavailable.
 */
export function errorBeep(): void {
  try {
    context ??= new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'square';
    oscillator.frequency.value = 220;
    gain.gain.value = 0.06;
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.18);
  } catch {
    // No audio support (or blocked) — the on-screen message is enough.
  }
}
