import { useEffect, useRef, useState } from "react";
import { useSettings, type ScreenFps, type ScreenResolution } from "../store/settings";
import { listDevices, refreshMic, setInputVolume, startMicTest } from "../lib/voice";
import { previewSound } from "../lib/sound";

const FPS_OPTIONS: ScreenFps[] = [15, 30, 60, 120, 144];
const RES_OPTIONS: { value: ScreenResolution; label: string }[] = [
  { value: "720p", label: "720p" },
  { value: "1080p", label: "1080p" },
  { value: "1440p", label: "1440p (2K)" },
  { value: "4k", label: "2160p (4K)" },
  { value: "source", label: "Source (max)" },
];

export default function VoiceSettings() {
  const s = useSettings();
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const [level, setLevel] = useState(0);
  const [testing, setTesting] = useState(false);
  const [bindingPtt, setBindingPtt] = useState(false);
  const stopTest = useRef<(() => void) | null>(null);

  const refreshDevices = async () => {
    const d = await listDevices();
    setInputs(d.inputs);
    setOutputs(d.outputs);
  };

  useEffect(() => {
    refreshDevices();
    return () => stopTest.current?.();
  }, []);

  // Capture the next key for push-to-talk.
  useEffect(() => {
    if (!bindingPtt) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      s.set({ pttKey: e.code });
      setBindingPtt(false);
    };
    window.addEventListener("keydown", onKey, { once: true });
    return () => window.removeEventListener("keydown", onKey);
  }, [bindingPtt, s]);

  async function toggleTest() {
    if (testing) {
      stopTest.current?.();
      stopTest.current = null;
      setTesting(false);
      setLevel(0);
      return;
    }
    try {
      stopTest.current = await startMicTest(setLevel);
      setTesting(true);
      refreshDevices(); // labels become available after permission
    } catch {
      alert("Could not access the microphone.");
    }
  }

  const onProcessingChange = (patch: Partial<typeof s>) => {
    s.set(patch);
    refreshMic(); // re-acquire mic with new constraints if in a call
  };

  return (
    <div className="space-y-6">
      {/* INPUT */}
      <section className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-discord-muted">Input</h3>
        <Select
          label="Microphone"
          value={s.inputDeviceId}
          onChange={(v) => onProcessingChange({ inputDeviceId: v })}
          options={[{ value: "", label: "Default" }, ...inputs.map((d, i) => ({ value: d.deviceId, label: d.label || `Microphone ${i + 1}` }))]}
        />
        <Slider label={`Input volume — ${s.inputVolume}%`} min={0} max={200} value={s.inputVolume} onChange={(v) => setInputVolume(v)} />

        <div className="flex items-center gap-3">
          <button
            onClick={toggleTest}
            className={`rounded px-4 py-2 text-sm font-medium ${testing ? "bg-discord-danger text-white" : "bg-discord-accent text-white hover:bg-[#4752c4]"}`}
          >
            {testing ? "Stop Test" : "Test Microphone"}
          </button>
          <div className="h-3 flex-1 overflow-hidden rounded bg-[#1e1f22]">
            <div className="h-full bg-discord-green transition-[width] duration-75" style={{ width: `${Math.min(level * 140, 100)}%` }} />
          </div>
        </div>
      </section>

      {/* OUTPUT */}
      <section className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-discord-muted">Output</h3>
        <Select
          label="Speaker / headset"
          value={s.outputDeviceId}
          onChange={(v) => s.set({ outputDeviceId: v })}
          options={[{ value: "", label: "Default" }, ...outputs.map((d, i) => ({ value: d.deviceId, label: d.label || `Output ${i + 1}` }))]}
        />
        <Slider label={`Output volume — ${s.outputVolume}%`} min={0} max={100} value={s.outputVolume} onChange={(v) => s.set({ outputVolume: v })} />
      </section>

      {/* PROCESSING */}
      <section className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-discord-muted">Processing</h3>
        <Toggle label="Echo cancellation" checked={s.echoCancellation} onChange={(v) => onProcessingChange({ echoCancellation: v })} />
        <Toggle label="Noise suppression" checked={s.noiseSuppression} onChange={(v) => onProcessingChange({ noiseSuppression: v })} />
        <Toggle label="Automatic gain control" checked={s.autoGainControl} onChange={(v) => onProcessingChange({ autoGainControl: v })} />
        {s.noiseSuppression && (
          <>
            <Slider
              label={`Mic sensitivity — ${s.micSensitivity}%`}
              min={0}
              max={100}
              value={s.micSensitivity}
              onChange={(v) => s.set({ micSensitivity: v })}
            />
            <p className="text-xs text-discord-faint">
              Lower = stronger noise gate (only louder speech is sent); higher = picks up quieter
              sounds. Use the mic test above and find where background noise stops transmitting.
            </p>
          </>
        )}
      </section>

      {/* INPUT MODE */}
      <section className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-discord-muted">Input mode</h3>
        <div className="flex gap-2">
          <Pill active={s.voiceMode === "vad"} onClick={() => s.set({ voiceMode: "vad" })}>Voice Activity</Pill>
          <Pill active={s.voiceMode === "ptt"} onClick={() => s.set({ voiceMode: "ptt" })}>Push to Talk</Pill>
        </div>
        {s.voiceMode === "ptt" && (
          <button
            onClick={() => setBindingPtt(true)}
            className="rounded bg-discord-card px-4 py-2 text-sm text-discord-text hover:bg-discord-hover"
          >
            {bindingPtt ? "Press any key…" : `Keybind: ${friendlyKey(s.pttKey)}`}
          </button>
        )}
      </section>

      {/* SCREEN SHARE */}
      <section className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-discord-muted">Screen share</h3>
        <Select
          label="Resolution"
          value={s.screenResolution}
          onChange={(v) => s.set({ screenResolution: v as ScreenResolution })}
          options={RES_OPTIONS}
        />
        <Select
          label="Frame rate"
          value={String(s.screenFps)}
          onChange={(v) => s.set({ screenFps: Number(v) as ScreenFps })}
          options={FPS_OPTIONS.map((f) => ({ value: String(f), label: `${f} FPS` }))}
        />
        <Toggle label="Share system audio" checked={s.screenAudio} onChange={(v) => s.set({ screenAudio: v })} />
        <p className="text-xs text-discord-faint">
          Applies to your next screen share. High resolutions/FPS need more upload bandwidth and CPU/GPU.
        </p>
      </section>

      {/* SOUNDS */}
      <section className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-discord-muted">Sounds</h3>
        <Toggle
          label="Play app sounds (join / leave / mute / message)"
          checked={s.soundsEnabled}
          onChange={(v) => s.set({ soundsEnabled: v })}
        />
        {s.soundsEnabled && (
          <>
            <Slider
              label={`Sound volume — ${s.soundVolume}%`}
              min={0}
              max={100}
              value={s.soundVolume}
              onChange={(v) => {
                s.set({ soundVolume: v });
                previewSound("peerJoin", v);
              }}
            />
            <div className="flex flex-wrap gap-2">
              <SoundPreview label="Join" onClick={() => previewSound("voiceJoin", s.soundVolume)} />
              <SoundPreview label="Leave" onClick={() => previewSound("voiceLeave", s.soundVolume)} />
              <SoundPreview label="Mute" onClick={() => previewSound("mute", s.soundVolume)} />
              <SoundPreview label="Message" onClick={() => previewSound("message", s.soundVolume)} />
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function SoundPreview({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded bg-discord-card px-3 py-1.5 text-xs text-discord-text hover:bg-discord-hover"
    >
      ▶ {label}
    </button>
  );
}

function friendlyKey(code: string) {
  return code.replace(/^Key/, "").replace(/^Digit/, "").replace("Space", "Spacebar");
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase text-discord-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded bg-[#1e1f22] px-3 py-2.5 text-discord-text outline-none focus:ring-1 focus:ring-discord-accent"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Slider({
  label,
  min,
  max,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase text-discord-muted">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-discord-accent"
      />
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between py-1">
      <span className="text-sm text-discord-text">{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-8 accent-discord-accent" />
    </label>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded px-3 py-1.5 text-sm font-medium ${active ? "bg-discord-accent text-white" : "bg-discord-card text-discord-muted hover:text-white"}`}
    >
      {children}
    </button>
  );
}
