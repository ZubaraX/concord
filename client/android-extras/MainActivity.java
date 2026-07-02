package com.concord.app;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

// Replaces the Capacitor-generated MainActivity during CI (see android.yml):
// registers the local plugins (push service, screen capture) and forwards
// "Share → Concord" intents to the JS side.
public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(PushPlugin.class);
    registerPlugin(ScreenCapPlugin.class);
    super.onCreate(savedInstanceState);
    PushPlugin.handleShare(this, getIntent());
    PushPlugin.handleInvite(getIntent());
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    PushPlugin.handleShare(this, intent);
    PushPlugin.handleInvite(intent);
  }
}
