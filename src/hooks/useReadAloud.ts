import { useCallback, useEffect, useRef, useState } from "react";

type Playback = "stopped" | "speaking" | "paused";

/** User-initiated browser speech only; no paid service or automatic playback. */
export function useReadAloud() {
  const [supported, setSupported] = useState(false);
  const currentUtterance = useRef<SpeechSynthesisUtterance | null>(null);
  const [state, setState] = useState<Playback>("stopped");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceUri, setVoiceUri] = useState("");
  const [rate, setRate] = useState(1);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") return;
    setSupported(true);
    const synth = window.speechSynthesis;
    const refresh = () => setVoices(synth.getVoices());
    refresh();
    synth.addEventListener?.("voiceschanged", refresh);
    return () => {
      currentUtterance.current = null;
      synth.cancel();
      synth.removeEventListener?.("voiceschanged", refresh);
    };
  }, []);

  const stop = useCallback(() => {
    currentUtterance.current = null;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setState("stopped");
  }, []);

  const play = useCallback((content: string) => {
    if (!supported || !content.trim() || typeof window === "undefined") return;
    const synth = window.speechSynthesis;
    currentUtterance.current = null;
    synth.cancel(); // Prevent overlapping queued utterances.
    document.querySelector("audio")?.pause();
    const utterance = new SpeechSynthesisUtterance(content.trim().slice(0, 6000));
    utterance.rate = rate;
    const chosen = voices.find((voice) => voice.voiceURI === voiceUri);
    if (chosen) utterance.voice = chosen;
    currentUtterance.current = utterance;
    utterance.onstart = () => { if (currentUtterance.current === utterance) setState("speaking"); };
    utterance.onend = () => { if (currentUtterance.current === utterance) { currentUtterance.current = null; setState("stopped"); } };
    utterance.onerror = () => { if (currentUtterance.current === utterance) { currentUtterance.current = null; setState("stopped"); } };
    setState("speaking");
    synth.speak(utterance);
  }, [supported, rate, voices, voiceUri]);

  const pause = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window && window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
      setState("paused");
    }
  }, []);
  const resume = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window && window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      setState("speaking");
    }
  }, []);

  return { supported, state, voices, voiceUri, setVoiceUri, rate, setRate, play, pause, resume, stop };
}
