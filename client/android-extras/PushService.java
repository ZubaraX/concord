package com.concord.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

// Foreground service holding one SSE stream to the Concord server
// (/api/push/stream). Self-hosted push without Google FCM: DMs, @mentions and
// incoming calls arrive here and become system notifications even when the
// app's WebView is frozen in the background or the app is closed.
public class PushService extends Service {
  private static final String TAG = "ConcordPush";
  private static final String CH_SERVICE = "push-service";
  private static final String CH_MESSAGES = "push-messages";
  private static final String CH_CALLS = "push-calls";
  private static final int SERVICE_NOTIF_ID = 1;

  // Set by PushPlugin on app resume/pause; while visible the in-app UI
  // (toasts + sounds) already announces events, so we stay quiet.
  public static volatile boolean appInForeground = false;

  private volatile boolean running = false;
  private Thread worker;

  public static void start(Context ctx) {
    Intent i = new Intent(ctx, PushService.class);
    if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i);
    else ctx.startService(i);
  }

  public static void stop(Context ctx) {
    ctx.stopService(new Intent(ctx, PushService.class));
  }

  @Override
  public void onCreate() {
    super.onCreate();
    NotificationManager nm = getSystemService(NotificationManager.class);
    if (Build.VERSION.SDK_INT >= 26) {
      NotificationChannel svc =
          new NotificationChannel(CH_SERVICE, "Фоновое подключение", NotificationManager.IMPORTANCE_MIN);
      svc.setShowBadge(false);
      nm.createNotificationChannel(svc);
      NotificationChannel msg =
          new NotificationChannel(CH_MESSAGES, "Сообщения", NotificationManager.IMPORTANCE_HIGH);
      msg.enableVibration(true);
      nm.createNotificationChannel(msg);
      NotificationChannel call =
          new NotificationChannel(CH_CALLS, "Звонки", NotificationManager.IMPORTANCE_HIGH);
      call.enableVibration(true);
      nm.createNotificationChannel(call);
    }
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    Notification notif =
        new NotificationCompat.Builder(this, CH_SERVICE)
            .setContentTitle("Concord")
            .setContentText("Ожидание сообщений")
            .setSmallIcon(getApplicationInfo().icon)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setContentIntent(launchIntent(null))
            .build();
    if (Build.VERSION.SDK_INT >= 29) {
      startForeground(SERVICE_NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
    } else {
      startForeground(SERVICE_NOTIF_ID, notif);
    }

    if (worker == null || !worker.isAlive()) {
      running = true;
      worker = new Thread(this::streamLoop, "concord-push");
      worker.setDaemon(true);
      worker.start();
    }
    return START_STICKY;
  }

  @Override
  public void onDestroy() {
    running = false;
    if (worker != null) worker.interrupt();
    super.onDestroy();
  }

  @Override
  public IBinder onBind(Intent intent) {
    return null;
  }

  // ── SSE loop: connect, read events, reconnect with backoff. ──
  private void streamLoop() {
    long backoffMs = 5_000;
    while (running) {
      SharedPreferences prefs = getSharedPreferences("concord-push", Context.MODE_PRIVATE);
      String base = prefs.getString("url", null);
      String token = prefs.getString("token", null);
      if (base == null || token == null) return; // logged out

      HttpURLConnection conn = null;
      try {
        URL url = new URL(base + "/api/push/stream?token=" + token);
        conn = (HttpURLConnection) url.openConnection();
        conn.setConnectTimeout(15_000);
        // Server heartbeats every 25s; 75s of silence = dead link.
        conn.setReadTimeout(75_000);
        conn.setRequestProperty("Accept", "text/event-stream");
        int status = conn.getResponseCode();
        if (status == 401) return; // token revoked/expired — stop until next app open
        if (status != 200) throw new java.io.IOException("HTTP " + status);

        BufferedReader reader =
            new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8));
        backoffMs = 5_000; // connected — reset backoff
        String line;
        while (running && (line = reader.readLine()) != null) {
          if (line.startsWith("data:")) handleEvent(line.substring(5).trim());
        }
      } catch (Exception e) {
        Log.w(TAG, "stream error: " + e);
      } finally {
        if (conn != null) conn.disconnect();
      }

      if (!running) return;
      try {
        Thread.sleep(backoffMs);
      } catch (InterruptedException ie) {
        return;
      }
      backoffMs = Math.min(backoffMs * 2, 300_000);
    }
  }

  private void handleEvent(String json) {
    try {
      JSONObject o = new JSONObject(json);
      if (appInForeground) return; // in-app UI covers visible sessions
      String type = o.optString("type", "dm");
      String title = o.optString("title", "Concord");
      String body = o.optString("body", "");
      String channelId = o.optString("channelId", "");

      String channel = "call".equals(type) ? CH_CALLS : CH_MESSAGES;
      NotificationCompat.Builder b =
          new NotificationCompat.Builder(this, channel)
              .setContentTitle(title)
              .setContentText(body)
              .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
              .setSmallIcon(getApplicationInfo().icon)
              .setAutoCancel(true)
              .setPriority(NotificationCompat.PRIORITY_HIGH)
              .setCategory(
                  "call".equals(type)
                      ? NotificationCompat.CATEGORY_CALL
                      : NotificationCompat.CATEGORY_MESSAGE)
              .setContentIntent(launchIntent(channelId));

      // One notification per conversation: a newer message replaces the old.
      int id = 1000 + (channelId.hashCode() & 0x7fffffff) % 100_000;
      getSystemService(NotificationManager.class).notify(id, b.build());
    } catch (Exception e) {
      Log.w(TAG, "bad event: " + e);
    }
  }

  private PendingIntent launchIntent(String channelId) {
    Intent i = getPackageManager().getLaunchIntentForPackage(getPackageName());
    if (i == null) i = new Intent();
    i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    if (channelId != null) i.putExtra("channelId", channelId);
    return PendingIntent.getActivity(
        this, channelId == null ? 0 : channelId.hashCode(), i,
        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
  }
}
