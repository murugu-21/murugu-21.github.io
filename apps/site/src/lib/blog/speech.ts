// Rates the picker offers (SpeechSynthesisUtterance.rate accepts 0.1 to 10).
export const SPEECH_RATES = [0.75, 1, 1.25, 1.5, 2] as const;
export type SpeechRate = (typeof SPEECH_RATES)[number];

export function parseRate(value: string | null): SpeechRate {
  return SPEECH_RATES.find(rate => rate === Number(value)) ?? 1;
}
