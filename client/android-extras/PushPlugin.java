package com.concord.app;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.ActivityCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// JS bridge for the background notification service. `start` persists the
// server URL + long-lived push token (so BootReceiver can restart the service
// after a reboot) and brings the foreground service up.
@CapacitorPlugin(name = "PushService")
public class PushPlugin extends Plugin {

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

  // The service suppresses notifications while the app is visible — the in-app
  // toasts/sounds already cover that case.
  @Override
  protected void handleOnResume() {
    PushService.appInForeground = true;
  }

  @Override
  protected void handleOnPause() {
    PushService.appInForeground = false;
  }
}
