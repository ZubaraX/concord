package com.concord.app;

import android.app.Activity;
import android.content.Intent;
import android.media.projection.MediaProjectionManager;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

// Android screen share: the WebView has no getDisplayMedia, so we capture the
// screen natively (MediaProjection) and stream JPEG frames to JS, where a
// canvas.captureStream() turns them into a WebRTC video track.
@CapacitorPlugin(name = "ScreenCap")
public class ScreenCapPlugin extends Plugin {
  static ScreenCapPlugin instance;

  @Override
  public void load() {
    instance = this;
  }

  static void sendFrame(String b64) {
    if (instance != null) {
      JSObject d = new JSObject();
      d.put("b64", b64);
      instance.notifyListeners("frame", d);
    }
  }

  static void sendStopped() {
    if (instance != null) instance.notifyListeners("stopped", new JSObject());
  }

  @PluginMethod
  public void start(PluginCall call) {
    MediaProjectionManager mpm =
        (MediaProjectionManager) getContext().getSystemService(Activity.MEDIA_PROJECTION_SERVICE);
    startActivityForResult(call, mpm.createScreenCaptureIntent(), "onProjectionResult");
  }

  @ActivityCallback
  private void onProjectionResult(PluginCall call, ActivityResult result) {
    if (call == null) return;
    if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
      call.reject("declined");
      return;
    }
    Intent svc = new Intent(getContext(), ScreenCapService.class);
    svc.putExtra("resultCode", result.getResultCode());
    svc.putExtra("data", result.getData());
    getContext().startForegroundService(svc);
    call.resolve();
  }

  @PluginMethod
  public void stop(PluginCall call) {
    getContext().stopService(new Intent(getContext(), ScreenCapService.class));
    call.resolve();
  }
}
