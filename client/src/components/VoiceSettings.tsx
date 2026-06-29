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

export default function VoiceSettings() {
  const s = useSettings();
  const { t } = useI18n();
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
        <h3 className="text-xs font-bold uppercase tracking-wide text-discord-muted">{t("vset.input")}</h3>
        <Select
          label={t("vset.microphone")}
          value={s.inputDeviceId}
          onChange={(v) => onProcessingChange({ inputDeviceId: v })}
          options={[{ value: "", label: t("vset.default") }, ...inputs.map((d, i) => ({ value: d.deviceId, label: d.label || `${t("vset.microphone")} ${i + 1}` }))]}
        />
        <Slider label={`${t("vset.inputVolume")} — ${s.inputVolume}%`} min={0} max={200} value={s.inputVolume} onChange={(v) => setInputVolume(v)} />

        <div className="flex items-center gap-3">
          <button
            onClick={toggleTest}
            className={`rounded px-4 py-2 text-sm font-medium ${testing ? "bg-discord-danger text-white" : "bg-discord-accent text-white hover:bg-discord-accentDark"}`}
          >
            {testing ? t("vset.stopTest") : t("vset.testMic")}
          </button>
          <div className="h-3 flex-1 overflow-hidden rounded bg-discord-deep">
            <div className="h-full bg-discord-green transition-[width] duration-75" style={{ width: `${Math.min(level * 140, 100)}%` }} />
          </div>
        </div>
      </section>

      {/* OUTPUT */}
      <section className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-discord-muted">{t("vset.output")}</h3>
        <Select
          label={t("vset.speaker")}
          value={s.outputDeviceId}
          onChange={(v) => s.set({ outputDeviceId: v })}
          options={[{ value: "", label: t("vset.default") }, ...outputs.map((d, i) => ({ value: d.deviceId, label: d.label || `${t("vset.output")} ${i + 1}` }))]}
        />
        <Slider label={`${t("vset.outputVolume")} — ${s.outputVolume}%`} min={0} max={100} value={s.outputVolume} onChange={(v) => s.set({ outputVolume: v })} />
      </section>

      {/* PROCESSING */}
      <section className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-discord-muted">{t("vset.processing")}</h3>
        <Toggle label={t("vset.echo")} checked={s.echoCancellation} onChange={(v) => onProcessingChange({ echoCancellation: v })} />
        <Toggle label={t("vset.noise")} checked={s.noiseSuppression} onChange={(v) => onProcessingChange({ noiseSuppression: v })} />
        <Toggle label={t("vset.agc")} checked={s.autoGainControl} onChange={(v) => onProcessingChange({ autoGainControl: v })} />
        {s.noiseSuppression && (
          <>
            <Slider
              label={`${t("vset.micSensitivity")} — ${s.micSensitivity}%`}
              min={0}
              max={100}
              value={s.micSensitivity}
              onChange={(v) => s.set({ micSensitivity: v })}
            />
            <p className="text-xs text-discord-faint">{t("vset.micSensitivityHelp")}</p>
          </>
        )}
      </section>

      {/* INPUT MODE */}
      <section className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-discord-muted">{t("vset.inputMode")}</h3>
        <div className="flex gap-2">
          <Pill active={s.voiceMode === "vad"} onClick={() => s.set({ voiceMode: "vad" })}>{t("vset.voiceActivity")}</Pill>
          <Pill active={s.voiceMode === "ptt"} onClick={() => s.set({ voiceMode: "ptt" })}>{t("vset.pushToTalk")}</Pill>
        </div>
        {s.voiceMode === "ptt" && (
          <button
            onClick={() => setBindingPtt(true)}
            className="rounded bg-discord-card px-4 py-2 text-sm text-discord-text hover:bg-discord-hover"
          >
            {bindingPtt ? t("vset.pressKey") : `${t("vset.keybind")}: ${friendlyKey(s.pttKey)}`}
          </button>
        )}
      </section>

      {/* SCREEN SHARE */}
      <section className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-discord-muted">{t("vset.screenShare")}</h3>
        <Select
          label={t("vset.resolution")}
          value={s.screenResolution}
          onChange={(v) => s.set({ screenResolution: v as ScreenResolution })}
          options={RES_OPTIONS}
        />
        <Select
          label={t("vset.frameRate")}
          value={String(s.screenFps)}
          onChange={(v) => s.set({ screenFps: Number(v) as ScreenFps })}
          options={FPS_OPTIONS.map((f) => ({ value: String(f), label: `${f} FPS` }))}
        />
        <Toggle label={t("vset.shareSystemAudio")} checked={s.screenAudio} onChange={(v) => s.set({ screenAudio: v })} />
        <p className="text-xs text-discord-faint">{t("vset.screenHelp")}</p>
      </section>

      {/* SOUNDS */}
      <section className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-discord-muted">{t("vset.sounds")}</h3>
        <Toggle
          label={t("vset.playSounds")}
          checked={s.soundsEnabled}
          onChange={(v) => s.set({ soundsEnabled: v })}
        />
        {s.soundsEnabled && (
          <>
            <Slider
              label={`${t("vset.soundVolume")} — ${s.soundVolume}%`}
              min={0}
              max={100}
              value={s.soundVolume}
              onChange={(v) => {
                s.set({ soundVolume: v });
                previewSound("peerJoin", v);
              }}
            />
            <div className="flex flex-wrap gap-2">
              <SoundPreview label={t("voice.call")} onClick={() => previewSound("voiceJoin", s.soundVolume)} />
              <SoundPreview label={t("voice.leave")} onClick={() => previewSound("voiceLeave", s.soundVolume)} />
              <SoundPreview label={t("voice.mute")} onClick={() => previewSound("mute", s.soundVolume)} />
              <SoundPreview label={t("profile.message")} onClick={() => previewSound("message", s.soundVolume)} />
            </div>
          </>
        )}
      </section>

      {/* CALL OVERLAY (desktop only) */}
      {window.concord?.isDesktop && (
        <section className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wide text-discord-muted">{t("vset.overlay")}</h3>
          <Toggle label={t("vset.overlayEnable")} checked={s.overlayEnabled} onChange={(v) => s.set({ overlayEnabled: v })} />
          {s.overlayEnabled && (
            <Select
              label={t("vset.overlayPosition")}
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
        </section>
      )}
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
        className="mt-1.5 w-full rounded bg-discord-deep px-3 py-2.5 text-discord-text outline-none focus:ring-1 focus:ring-discord-accent"
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
