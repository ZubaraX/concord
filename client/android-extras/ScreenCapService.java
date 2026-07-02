package com.concord.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.util.Base64;
import android.util.DisplayMetrics;
import android.util.Log;
import android.view.WindowManager;
import androidx.core.app.NotificationCompat;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;

// Foreground service (mediaProjection type) that captures the screen into an
// ImageReader and forwards downscaled JPEG frames (~8 fps) to the WebView via
// ScreenCapPlugin. Quality/fps favor bridge throughput over smoothness — fine
// for screen sharing.
public class ScreenCapService extends Service {
  private static final String TAG = "ConcordScreen";
  private static final String CHANNEL = "screen-cap";
  private static final int NOTIF_ID = 3;
  private static final int MAX_DIM = 900; // long side of the streamed frame
  private static final long MIN_FRAME_MS = 125; // ~8 fps

  private MediaProjection projection;
  private VirtualDisplay display;
  private ImageReader reader;
  private HandlerThread thread;
  private long lastFrameAt = 0;

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    NotificationManager nm = getSystemService(NotificationManager.class);
    if (Build.VERSION.SDK_INT >= 26) {
      NotificationChannel ch =
          new NotificationChannel(CHANNEL, "Демонстрация экрана", NotificationManager.IMPORTANCE_LOW);
      nm.createNotificationChannel(ch);
    }
    Notification notif =
        new NotificationCompat.Builder(this, CHANNEL)
            .setContentTitle("Concord")
            .setContentText("Идёт демонстрация экрана")
            .setSmallIcon(getApplicationInfo().icon)
            .setOngoing(true)
            .build();
    if (Build.VERSION.SDK_INT >= 29) {
      startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
    } else {
      startForeground(NOTIF_ID, notif);
    }

    int resultCode = intent.getIntExtra("resultCode", 0);
    Intent data = intent.getParcelableExtra("data");
    if (data == null) {
      stopSelf();
      return START_NOT_STICKY;
    }

    MediaProjectionManager mpm =
        (MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE);
    projection = mpm.getMediaProjection(resultCode, data);
    if (projection == null) {
      stopSelf();
      return START_NOT_STICKY;
    }
    projection.registerCallback(
        new MediaProjection.Callback() {
          @Override
          public void onStop() {
            stopSelf();
          }
        },
        null);

    DisplayMetrics dm = new DisplayMetrics();
    ((WindowManager) getSystemService(WINDOW_SERVICE)).getDefaultDisplay().getRealMetrics(dm);
    float scale = Math.min(1f, (float) MAX_DIM / Math.max(dm.widthPixels, dm.heightPixels));
    int w = Math.max(2, (int) (dm.widthPixels * scale) / 2 * 2);
    int h = Math.max(2, (int) (dm.heightPixels * scale) / 2 * 2);

    thread = new HandlerThread("concord-screen");
    thread.start();
    Handler handler = new Handler(thread.getLooper());

    reader = ImageReader.newInstance(w, h, android.graphics.PixelFormat.RGBA_8888, 2);
    reader.setOnImageAvailableListener(
        (r) -> {
          Image img = null;
          try {
            img = r.acquireLatestImage();
            if (img == null) return;
            long now = System.currentTimeMillis();
            if (now - lastFrameAt < MIN_FRAME_MS) return; // throttle
            lastFrameAt = now;

            Image.Plane plane = img.getPlanes()[0];
            ByteBuffer buf = plane.getBuffer();
            int rowStride = plane.getRowStride();
            int pixelStride = plane.getPixelStride();
            int rowPadding = rowStride - pixelStride * w;
            Bitmap bmp = Bitmap.createBitmap(w + rowPadding / pixelStride, h, Bitmap.Config.ARGB_8888);
            bmp.copyPixelsFromBuffer(buf);
            Bitmap cropped = rowPadding == 0 ? bmp : Bitmap.createBitmap(bmp, 0, 0, w, h);

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            cropped.compress(Bitmap.CompressFormat.JPEG, 55, out);
            if (cropped != bmp) cropped.recycle();
            bmp.recycle();
            ScreenCapPlugin.sendFrame(Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP));
          } catch (Exception e) {
            Log.w(TAG, "frame failed: " + e);
          } finally {
            if (img != null) img.close();
          }
        },
        handler);

    display =
        projection.createVirtualDisplay(
            "concord-screen",
            w,
            h,
            dm.densityDpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            reader.getSurface(),
            null,
            handler);
    return START_NOT_STICKY;
  }

  @Override
  public void onDestroy() {
    try {
      if (display != null) display.release();
      if (reader != null) reader.close();
      if (projection != null) projection.stop();
      if (thread != null) thread.quitSafely();
    } catch (Exception ignored) {}
    ScreenCapPlugin.sendStopped();
    super.onDestroy();
  }

  @Override
  public IBinder onBind(Intent intent) {
    return null;
  }
}
