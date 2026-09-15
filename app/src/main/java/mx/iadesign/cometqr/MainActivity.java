package mx.iadesign.cometqr;

import android.app.Activity;
import android.content.ClipData;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanner;
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning;

import org.json.JSONObject;

public class MainActivity extends Activity {
    private static final int FILE_CHOOSER_REQUEST = 501;

    private WebView webView;
    private GmsBarcodeScanner scanner;
    private ValueCallback<Uri[]> fileCallback;
    private Uri pendingCameraUri;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        GmsBarcodeScannerOptions options = new GmsBarcodeScannerOptions.Builder()
                .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
                .enableAutoZoom()
                .build();
        scanner = GmsBarcodeScanning.getClient(this, options);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);

        webView.setWebViewClient(new WebViewClient());
        webView.addJavascriptInterface(new AndroidQrBridge(), "AndroidQR");
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
