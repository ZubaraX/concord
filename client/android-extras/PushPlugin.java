package com.concord.app;

import android.Manifest;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.service.notification.StatusBarNotification;
import android.util.Base64;
import android.util.Log;
import androidx.core.app.ActivityCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;

// JS bridge for the background notification service + small native utilities:
// speakerphone routing for calls, notification clearing, and the Android
// "Share → Concord" target (MainActivity forwards ACTION_SEND intents here).
@CapacitorPlugin(name = "PushService")
public class PushPlugin extends Plugin {
  private static PushPlugin instance;
  private static JSObject pendingShare;
  private static JSObject pendingInvite;

  @Override
  public void load() {
    instance = this;
    if (pendingShare != null) notifyListeners("share", pendingShare, true);
    if (pendingInvite != null) notifyListeners("invite", pendingInvite, true);
  }

  // Invite links (https://…/invite/CODE) open the app via a VIEW intent-filter;
  // the code is forwarded to JS which joins the server directly.
  public static void handleInvite(Intent intent) {
    if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction()) || intent.getData() == null) return;
    String path = intent.getData().getPath();
    if (path == null || !path.startsWith("/invite/")) return;
    String code = path.substring("/invite/".length());
    if (code.isEmpty()) return;
    JSObject d = new JSObject();
    d.put("code", code);
    pendingInvite = d;
    if (instance != null) instance.notifyListeners("invite", d, true);
  }

  @PluginMethod
  public void getPendingInvite(PluginCall call) {
    call.resolve(pendingInvite != null ? pendingInvite : new JSObject());
    pendingInvite = null;
  }

  @PluginMethod
  public void start(PluginCall call) {
    String url = call.getString("url");
    String token = call.getString("token");
    if (url == null || token == null) {
      call.reject("url and token are required");
      return;
    }
    SharedPreferences prefs = getContext().getSharedPreferences("concord-push", Context.MODE_PRIVATE);
    prefs.edit().putString("url", url).putString("token", token).apply();

    if (Build.VERSION.SDK_INT >= 33
        && getContext().checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED) {
      ActivityCompat.requestPermissions(
          getActivity(), new String[] {Manifest.permission.POST_NOTIFICATIONS}, 9911);
    }

    PushService.start(getContext());
    call.resolve();
  }

  @PluginMethod
  public void stop(PluginCall call) {
    getContext()
        .getSharedPreferences("concord-push", Context.MODE_PRIVATE)
        .edit()
        .clear()
        .apply();
    PushService.stop(getContext());
    call.resolve();
  }

  // ── call audio routing: speakerphone ↔ earpiece ──
  @PluginMethod
  public void setSpeakerphone(PluginCall call) {
    boolean on = Boolean.TRUE.equals(call.getBoolean("on"));
    AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
    am.setMode(AudioManager.MODE_IN_COMMUNICATION);
    am.setSpeakerphoneOn(on);
    call.resolve();
  }

  // ── share target: MainActivity hands ACTION_SEND intents to us ──
  public static void handleShare(Context ctx, Intent intent) {
    if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
    try {
      JSObject data = new JSObject();
      Uri stream = intent.getParcelableExtra(Intent.EXTRA_STREAM);
      String text = intent.getStringExtra(Intent.EXTRA_TEXT);
      if (stream != null) {
        InputStream in = ctx.getContentResolver().openInputStream(stream);
        if (in == null) return;
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        long total = 0;
        int n;
        while ((n = in.read(buf)) > 0) {
          total += n;
          if (total > 30L * 1024 * 1024) { in.close(); return; } // 30 MB cap
          out.write(buf, 0, n);
        }
        in.close();
        data.put("mimeType", intent.getType() != null ? intent.getType() : "application/octet-stream");
        data.put("dataB64", Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP));
      } else if (text != null) {
        data.put("text", text);
      } else {
        return;
      }
      pendingShare = data;
      if (instance != null) instance.notifyListeners("share", data, true);
    } catch (Exception e) {
      Log.w("ConcordPush", "share failed: " + e);
    }
  }

  @PluginMethod
  public void getPendingShare(PluginCall call) {
    call.resolve(pendingShare != null ? pendingShare : new JSObject());
    pendingShare = null;
  }

  // The service suppresses notifications while the app is visible; opening the
  // app also clears delivered message notifications (badge included).
  @Override
  protected void handleOnResume() {
    PushService.appInForeground = true;
    PushService.unreadCount = 0;
    try {
      NotificationManager nm = getContext().getSystemService(NotificationManager.class);
      if (Build.VERSION.SDK_INT >= 23) {
        for (StatusBarNotification sbn : nm.getActiveNotifications()) {
          if (sbn.getId() != 1) nm.cancel(sbn.getId()); // keep the service notif
        }
      }
    } catch (Exception ignored) {}
  }

  @Override
  protected void handleOnPause() {
    PushService.appInForeground = false;
  }
}
