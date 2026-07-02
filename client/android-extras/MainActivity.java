package com.concord.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

// Replaces the Capacitor-generated MainActivity during CI (see android.yml):
// registers the local PushService plugin so JS can start/stop the background
// notification service.
public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(PushPlugin.class);
    super.onCreate(savedInstanceState);
  }
}
