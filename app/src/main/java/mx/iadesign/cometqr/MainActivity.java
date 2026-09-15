package mx.iadesign.cometqr;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.view.Gravity;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanner;
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    private static final int FILE_CHOOSER_REQUEST = 501;
    private static final int NOTIFICATION_PERMISSION_REQUEST = 502;

    private WebView webView;
    private View splashView;
    private GmsBarcodeScanner scanner;
    private ValueCallback<Uri[]> fileCallback;
    private Uri pendingCameraUri;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        NotificationReceiver.createChannel(this);
        requestNotificationPermissionIfNeeded();
        scheduleChecks("12:00", "15:30");

        GmsBarcodeScannerOptions options = new GmsBarcodeScannerOptions.Builder()
                .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
                .enableAutoZoom()
                .build();
        scanner = GmsBarcodeScanning.getClient(this, options);

        FrameLayout root = new FrameLayout(this);
        webView = new WebView(this);
        root.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));

        splashView = buildSplashView();
        root.addView(splashView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (url != null && url.contains("android_asset/index.html")) {
                    try {
                        String syncJs = readAsset("sync.js");
                        String v09Js = readAsset("v09.js");
                        String v10Js = readAsset("v10.js");
                        view.evaluateJavascript(syncJs, null);
                        view.evaluateJavascript(v09Js, null);
                        view.evaluateJavascript(v10Js, value -> {
                            openPendingFromIntent();
                            hideSplash();
                        });
                    } catch (Exception e) {
                        hideSplash();
                        Toast.makeText(MainActivity.this, "No se pudieron cargar los módulos de la aplicación.", Toast.LENGTH_LONG).show();
                    }
                }
            }
        });
        webView.addJavascriptInterface(new AndroidQrBridge(), "AndroidQR");
        webView.addJavascriptInterface(new AndroidSyncBridge(), "AndroidSync");
        webView.addJavascriptInterface(new AndroidReminderBridge(), "AndroidReminder");
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                pendingCameraUri = null;

                Intent contentIntent;
                try {
                    contentIntent = params.createIntent();
                } catch (Exception e) {
                    contentIntent = new Intent(Intent.ACTION_GET_CONTENT);
                    contentIntent.setType("image/*");
                }

                Intent chooser = new Intent(Intent.ACTION_CHOOSER);
                chooser.putExtra(Intent.EXTRA_INTENT, contentIntent);
                chooser.putExtra(Intent.EXTRA_TITLE, "Tomar o seleccionar evidencia");

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    try {
                        ContentValues values = new ContentValues();
                        values.put(MediaStore.Images.Media.DISPLAY_NAME, "COMET_" + System.currentTimeMillis() + ".jpg");
                        values.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
                        values.put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/COMET");
                        pendingCameraUri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                        if (pendingCameraUri != null) {
                            Intent camera = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                            camera.putExtra(MediaStore.EXTRA_OUTPUT, pendingCameraUri);
                            camera.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                            chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{camera});
                        }
                    } catch (Exception ignored) { }
                }

                try {
                    startActivityForResult(chooser, FILE_CHOOSER_REQUEST);
                    return true;
                } catch (Exception e) {
                    fileCallback = null;
                    Toast.makeText(MainActivity.this, "No se pudo abrir la cámara o archivos.", Toast.LENGTH_LONG).show();
                    return false;
                }
            }
        });

        webView.loadUrl("file:///android_asset/index.html");
    }

    private View buildSplashView() {
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setGravity(Gravity.CENTER);
        panel.setPadding(dp(28), dp(28), dp(28), dp(28));
        panel.setBackgroundColor(Color.rgb(248, 243, 234));

        ImageView icon = new ImageView(this);
        icon.setImageResource(R.drawable.app_icon);
        icon.setScaleType(ImageView.ScaleType.CENTER_CROP);
        LinearLayout.LayoutParams iconParams = new LinearLayout.LayoutParams(dp(230), dp(230));
        iconParams.bottomMargin = dp(26);
        panel.addView(icon, iconParams);

        TextView title = new TextView(this);
        title.setText("Puesta a Punto COMET");
        title.setTextColor(Color.rgb(32, 36, 42));
        title.setTextSize(28);
        title.setGravity(Gravity.CENTER);
        title.setTypeface(title.getTypeface(), android.graphics.Typeface.BOLD);
        panel.addView(title, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT));

        TextView powered = new TextView(this);
        powered.setText("POWERED BY IVAN AVILES");
        powered.setTextColor(Color.rgb(184, 87, 16));
        powered.setTextSize(15);
        powered.setLetterSpacing(0.12f);
        powered.setGravity(Gravity.CENTER);
        powered.setPadding(0, dp(14), 0, 0);
        powered.setTypeface(powered.getTypeface(), android.graphics.Typeface.BOLD);
        panel.addView(powered, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT));

        TextView loading = new TextView(this);
        loading.setText("Inicializando sistema...");
        loading.setTextColor(Color.rgb(102, 112, 133));
        loading.setTextSize(13);
        loading.setGravity(Gravity.CENTER);
        loading.setPadding(0, dp(18), 0, 0);
        panel.addView(loading, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT));

        return panel;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void hideSplash() {
        if (splashView == null) return;
        splashView.animate().alpha(0f).setDuration(500).withEndAction(() -> {
            if (splashView != null) {
                splashView.setVisibility(View.GONE);
                splashView = null;
            }
        }).start();
    }

    private void requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_PERMISSION_REQUEST);
        }
    }

    private int[] parseTime(String value, int defaultHour, int defaultMinute) {
        try {
            String[] parts = value.split(":");
            return new int[]{Integer.parseInt(parts[0]), Integer.parseInt(parts[1])};
        } catch (Exception e) {
            return new int[]{defaultHour, defaultMinute};
        }
    }

    private void scheduleChecks(String first, String second) {
        int[] t1 = parseTime(first, 12, 0);
        int[] t2 = parseTime(second, 15, 30);
        NotificationReceiver.schedule(this, t1[0], t1[1], 1200, first);
        NotificationReceiver.schedule(this, t2[0], t2[1], 1530, second);
    }

    private void openPendingFromIntent() {
        if (webView == null) return;
        String check = getIntent().getStringExtra("open_check");
        if (check != null && !check.isEmpty()) {
            callJs("if(window.openPendingChecks){window.openPendingChecks(" + JSONObject.quote(check) + ");}");
            getIntent().removeExtra("open_check");
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        openPendingFromIntent();
    }

    private String readAsset(String name) throws Exception {
        try (InputStream in = getAssets().open(name); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int n;
            while ((n = in.read(buffer)) >= 0) out.write(buffer, 0, n);
            return out.toString(StandardCharsets.UTF_8.name());
        }
    }

    public class AndroidReminderBridge {
        @JavascriptInterface
        public void configure(String first, String second) {
            runOnUiThread(() -> scheduleChecks(first, second));
        }
    }

    public class AndroidQrBridge {
        @JavascriptInterface
        public void scan() {
            runOnUiThread(() -> scanner.startScan()
                    .addOnSuccessListener(barcode -> {
                        String value = barcode.getRawValue();
                        if (value == null) value = "";
                        callJs("window.onNativeQrResult(" + JSONObject.quote(value) + ");");
                    })
                    .addOnCanceledListener(() -> callJs("window.onNativeQrError('Escaneo cancelado.');"))
                    .addOnFailureListener(e -> {
                        String msg = e.getMessage() == null ? "No se pudo abrir el lector QR." : e.getMessage();
                        callJs("window.onNativeQrError(" + JSONObject.quote(msg) + ");");
                    }));
        }
    }

    public class AndroidSyncBridge {
        @JavascriptInterface
        public void send(String requestId, String endpoint, String payload) {
            new Thread(() -> {
                HttpURLConnection conn = null;
                try {
                    URL url = new URL(endpoint);
                    conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("POST");
                    conn.setConnectTimeout(15000);
                    conn.setReadTimeout(30000);
                    conn.setDoOutput(true);
                    conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
                    conn.setRequestProperty("Accept", "application/json");
                    byte[] bytes = payload.getBytes(StandardCharsets.UTF_8);
                    conn.setFixedLengthStreamingMode(bytes.length);
                    try (OutputStream os = conn.getOutputStream()) {
                        os.write(bytes);
                    }

                    int code = conn.getResponseCode();
                    BufferedReader reader = new BufferedReader(new InputStreamReader(
                            code >= 200 && code < 400 ? conn.getInputStream() : conn.getErrorStream(),
                            StandardCharsets.UTF_8));
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = reader.readLine()) != null) sb.append(line);
                    reader.close();

                    if (code >= 200 && code < 300) {
                        callJs("window.onNativeSyncResult(" + JSONObject.quote(requestId) + ",true," + JSONObject.quote(sb.toString()) + ");");
                    } else {
                        callJs("window.onNativeSyncResult(" + JSONObject.quote(requestId) + ",false," + JSONObject.quote("HTTP " + code + ": " + sb) + ");");
                    }
                } catch (Exception e) {
                    String msg = e.getMessage() == null ? "Error de red" : e.getMessage();
                    callJs("window.onNativeSyncResult(" + JSONObject.quote(requestId) + ",false," + JSONObject.quote(msg) + ");");
                } finally {
                    if (conn != null) conn.disconnect();
                }
            }).start();
        }
    }

    private void callJs(String js) {
        runOnUiThread(() -> webView.evaluateJavascript(js, null));
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_CHOOSER_REQUEST || fileCallback == null) return;

        Uri[] result = null;
        if (resultCode == RESULT_OK) {
            if (data == null || data.getData() == null) {
                if (pendingCameraUri != null) result = new Uri[]{pendingCameraUri};
            } else {
                String dataString = data.getDataString();
                ClipData clipData = data.getClipData();
                if (clipData != null) {
                    result = new Uri[clipData.getItemCount()];
                    for (int i = 0; i < clipData.getItemCount(); i++) result[i] = clipData.getItemAt(i).getUri();
                } else if (dataString != null) {
                    result = new Uri[]{Uri.parse(dataString)};
                }
            }
        }

        fileCallback.onReceiveValue(result);
        fileCallback = null;
        pendingCameraUri = null;
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }
}
