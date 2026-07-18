import { useEffect, useRef, useState } from "react";
import { useSettings, type ScreenFps, type ScreenResolution } from "../store/settings";
import { listDevices, refreshMic, setInputVolume, startMicTest } from "../lib/voice";
import { previewSound } from "../lib/sound";
import { useI18n } from "../lib/i18n";

const FPS_OPTIONS: ScreenFps[] = [15, 30, 60, 120, 144];
const RES_OPTIONS: { value: ScreenResolution; label: string }[] = [
  { value: "720p", label: "720p" },
  { value: "1080p", label: "1080p" },
  { value: "1440p", label: "1440p (2K)" },
  { value: "4k", label: "2160p (4K)" },
  { value: "source", label: "Source (max)" },
];

// Voice & sound settings: compact two-column card grid (single column on
// phones) instead of the old endless vertical list.
export default function VoiceSettings() {
  const s = useSettings();
  const { t } = useI18n();
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const [level, setLevel] = useState(0);
  const [testing, setTesting] = useState(false);
  const [bindingPtt, setBindingPtt] = useState(false);
  const [rnnoiseOk, setRnnoiseOk] = useState<boolean | null>(null); // null = probing
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

  // When RNNoise is on, verify the model actually loads on this device and
  // show the result — a silent fallback used to feel like "no effect at all".
  useEffect(() => {
    if (!s.rnnoise) {
      setRnnoiseOk(null);
      return;
    }
    let alive = true;
    setRnnoiseOk(null);
    import("../lib/rnnoise")
      .then((m) => m.probeRnnoise())
      .then((ok) => alive && setRnnoiseOk(ok))
      .catch(() => alive && setRnnoiseOk(false));
    return () => {
      alive = false;
    };
  }, [s.rnnoise]);

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
    // The running mic test keeps its old chain — restart it transparently so
    // toggling RNNoise etc. is audible immediately.
    if (testing) {
      stopTest.current?.();
      startMicTest(setLevel).then((stop) => (stopTest.current = stop)).catch(() => setTesting(false));
    }
  };

  // Two explicit columns (desktop) so cards stack tightly without the ragged
  // gaps a plain auto-flow grid produces; single column on phones.
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <div className="min-w-0 flex-1 space-y-3">
      <Card icon="🎤" title={t("vset.input")}>
        <Select
          value={s.inputDeviceId}
          onChange={(v) => onProcessingChange({ inputDeviceId: v })}
          options={[{ value: "", label: t("vset.default") }, ...inputs.map((d, i) => ({ value: d.deviceId, label: d.label || `${t("vset.microphone")} ${i + 1}` }))]}
        />
        <Slider label={t("vset.inputVolume")} unit="%" min={0} max={200} value={s.inputVolume} onChange={(v) => setInputVolume(v)} />
        <div className="flex items-center gap-2.5">
          <button
            onClick={toggleTest}
            className={`shrink-0 rounded px-3 py-1.5 text-xs font-medium ${testing ? "bg-discord-danger text-white" : "bg-discord-accent text-white hover:bg-discord-accentDark"}`}
          >
            {testing ? t("vset.stopTest") : t("vset.testMic")}
          </button>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-discord-deep">
            <div className="h-full rounded-full bg-discord-green transition-[width] duration-75" style={{ width: `${Math.min(level * 140, 100)}%` }} />
          </div>
        </div>
      </Card>

      <Card icon="🔈" title={t("vset.output")}>
        <Select
          value={s.outputDeviceId}
          onChange={(v) => s.set({ outputDeviceId: v })}
          options={[{ value: "", label: t("vset.default") }, ...outputs.map((d, i) => ({ value: d.deviceId, label: d.label || `${t("vset.output")} ${i + 1}` }))]}
        />
        <Slider label={t("vset.outputVolume")} unit="%" min={0} max={100} value={s.outputVolume} onChange={(v) => s.set({ outputVolume: v })} />
      </Card>

      <Card icon="🎚" title={t("vset.processing")}>
        <Toggle label={t("vset.echo")} checked={s.echoCancellation} onChange={(v) => onProcessingChange({ echoCancellation: v })} />
        <Toggle label={t("vset.noise")} checked={s.noiseSuppression} onChange={(v) => onProcessingChange({ noiseSuppression: v })} />
        <Toggle label={t("vset.rnnoise")} checked={s.rnnoise} onChange={(v) => onProcessingChange({ rnnoise: v })} />
        {s.rnnoise && (
          <p className={`text-xs ${rnnoiseOk === false ? "text-discord-danger" : rnnoiseOk ? "text-discord-green" : "text-discord-faint"}`}>
            {rnnoiseOk === null ? "…" : rnnoiseOk ? `✓ ${t("vset.rnnoiseOk")}` : `⚠ ${t("vset.rnnoiseFail")}`}
          </p>
        )}
        <Toggle label={t("vset.agc")} checked={s.autoGainControl} onChange={(v) => onProcessingChange({ autoGainControl: v })} />
        {s.noiseSuppression && (
          <Slider label={t("vset.micSensitivity")} unit="%" min={0} max={100} value={s.micSensitivity} onChange={(v) => s.set({ micSensitivity: v })} />
        )}
      </Card>
      </div>

      <div className="min-w-0 flex-1 space-y-3">
      <Card icon="🎙" title={t("vset.inputMode")}>
        <div className="flex gap-1.5">
          <Pill active={s.voiceMode === "vad"} onClick={() => s.set({ voiceMode: "vad" })}>{t("vset.voiceActivity")}</Pill>
          <Pill active={s.voiceMode === "ptt"} onClick={() => s.set({ voiceMode: "ptt" })}>{t("vset.pushToTalk")}</Pill>
        </div>
        {s.voiceMode === "ptt" && (
          <button
            onClick={() => setBindingPtt(true)}
            className="w-full rounded bg-discord-deep px-3 py-1.5 text-left text-sm text-discord-text hover:bg-discord-hover"
          >
            {bindingPtt ? t("vset.pressKey") : `${t("vset.keybind")}: ${friendlyKey(s.pttKey)}`}
          </button>
        )}
      </Card>

      <Card icon="🖥" title={t("vset.screenShare")}>
        <div className="grid grid-cols-2 gap-2">
          <Select value={s.screenResolution} onChange={(v) => s.set({ screenResolution: v as ScreenResolution })} options={RES_OPTIONS} />
          <Select
            value={String(s.screenFps)}
            onChange={(v) => s.set({ screenFps: Number(v) as ScreenFps })}
            options={FPS_OPTIONS.map((f) => ({ value: String(f), label: `${f} FPS` }))}
          />
        </div>
        <Toggle label={t("vset.shareSystemAudio")} checked={s.screenAudio} onChange={(v) => s.set({ screenAudio: v })} />
      </Card>

      <Card icon="🔔" title={t("vset.sounds")}>
        <Toggle label={t("vset.playSounds")} checked={s.soundsEnabled} onChange={(v) => s.set({ soundsEnabled: v })} />
        {s.soundsEnabled && (
          <>
            <Slider
              label={t("vset.soundVolume")}
              unit="%"
              min={0}
              max={100}
              value={s.soundVolume}
              onChange={(v) => {
                s.set({ soundVolume: v });
                previewSound("peerJoin", v);
              }}
            />
            <div className="flex flex-wrap gap-1.5">
              <SoundPreview label={t("voice.call")} onClick={() => previewSound("voiceJoin", s.soundVolume)} />
              <SoundPreview label={t("voice.leave")} onClick={() => previewSound("voiceLeave", s.soundVolume)} />
              <SoundPreview label={t("voice.mute")} onClick={() => previewSound("mute", s.soundVolume)} />
              <SoundPreview label={t("profile.message")} onClick={() => previewSound("message", s.soundVolume)} />
            </div>
          </>
        )}
      </Card>

      {window.concord?.isDesktop && (
        <Card icon="📌" title={t("vset.overlay")}>
          <Toggle label={t("vset.overlayEnable")} checked={s.overlayEnabled} onChange={(v) => s.set({ overlayEnabled: v })} />
          {s.overlayEnabled && (
            <Select
              value={s.overlayCorner}
              onChange={(v) => s.set({ overlayCorner: v as typeof s.overlayCorner })}
              options={[
                { value: "top-left", label: t("vset.cornerTL") },
                { value: "top-right", label: t("vset.cornerTR") },
                { value: "bottom-left", label: t("vset.cornerBL") },
                { value: "bottom-right", label: t("vset.cornerBR") },
              ]}
            />
          )}
        </Card>
      )}
      </div>
    </div>
  );
}

function Card({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5 rounded-lg bg-discord-card/40 p-3 ring-1 ring-black/20">
      <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-discord-muted">
        <span className="text-sm leading-none">{icon}</span> {title}
      </h3>
      {children}
    </section>
  );
}

function SoundPreview({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded bg-discord-deep px-2.5 py-1 text-xs text-discord-text hover:bg-discord-hover"
    >
      ▶ {label}
    </button>
  );
}

function friendlyKey(code: string) {
  return code.replace(/^Key/, "").replace(/^Digit/, "").replace("Space", "Spacebar");
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full min-w-0 rounded bg-discord-deep px-2.5 py-1.5 text-sm text-discord-text outline-none focus:ring-1 focus:ring-discord-accent"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Slider({
  label,
  unit,
  min,
  max,
  value,
  onChange,
}: {
  label: string;
  unit?: string;
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between text-xs text-discord-muted">
        <span>{label}</span>
        <span className="font-medium text-discord-text">{value}{unit}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 h-1.5 w-full accent-discord-accent"
      />
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full cursor-pointer items-center justify-between gap-3 py-0.5 text-left"
    >
      <span className="text-sm text-discord-text">{label}</span>
      <span className={`h-5 w-9 shrink-0 rounded-full transition ${checked ? "bg-discord-accent" : "bg-discord-deep"}`}>
        <span className={`block h-4 w-4 translate-y-0.5 rounded-full bg-white shadow transition ${checked ? "translate-x-[18px]" : "translate-x-0.5"}`} />
      </span>
    </button>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded px-3 py-1.5 text-sm font-medium ${active ? "bg-discord-accent text-white" : "bg-discord-deep text-discord-muted hover:text-white"}`}
    >
      {children}
    </button>
  );
}
