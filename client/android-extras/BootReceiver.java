package com.concord.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

// Restart the push service after a reboot — but only if the user is logged in
// (PushPlugin.start persisted a token; PushPlugin.stop / logout clears it).
public class BootReceiver extends BroadcastReceiver {
  @Override
  public void onReceive(Context context, Intent intent) {
    if (!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
    SharedPreferences prefs = context.getSharedPreferences("concord-push", Context.MODE_PRIVATE);
    if (prefs.getString("token", null) != null) PushService.start(context);
  }
}
