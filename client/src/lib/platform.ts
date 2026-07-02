// Runtime platform checks. Capacitor injects window.Capacitor in the native app.
type Cap = { getPlatform?: () => string; isNativePlatform?: () => boolean };
const cap = () => (window as unknown as { Capacitor?: Cap }).Capacitor;

export const platform = (): string => cap()?.getPlatform?.() ?? "web";
export const isAndroidApp = (): boolean => platform() === "android";
export const isNativeMobile = (): boolean => platform() === "android" || platform() === "ios";
