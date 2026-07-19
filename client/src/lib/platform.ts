// Runtime platform checks. Capacitor injects window.Capacitor in the native app.
type Cap = { getPlatform?: () => string; isNativePlatform?: () => boolean };
const cap = () => (window as unknown as { Capacitor?: Cap }).Capacitor;

export const platform = (): string => cap()?.getPlatform?.() ?? "web";
export const isAndroidApp = (): boolean => platform() === "android";
export const isNativeMobile = (): boolean => platform() === "android" || platform() === "ios";

/** Phone/tablet — native app OR the web version opened in a mobile browser. */
export const isTouchMobile = (): boolean =>
  isNativeMobile() || (typeof navigator !== "undefined" && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent));

/** Screen sharing needs getDisplayMedia (desktop browsers/Electron) or the
 *  native MediaProjection path in the Android app. Mobile web has neither. */
export const canShareScreen = (): boolean =>
  isAndroidApp() || !!(typeof navigator !== "undefined" && navigator.mediaDevices?.getDisplayMedia);
