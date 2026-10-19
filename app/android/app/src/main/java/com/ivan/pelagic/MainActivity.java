package com.ivan.pelagic;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // local plugins must be registered before the bridge starts
        registerPlugin(PelagicNativePlugin.class);
        registerPlugin(PelagicPlayerPlugin.class);
        registerPlugin(PelagicDownloadsPlugin.class);
        registerPlugin(PelagicWidgetPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
