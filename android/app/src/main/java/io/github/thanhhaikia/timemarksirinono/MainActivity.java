package io.github.thanhhaikia.timemarksirinono;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.view.KeyEvent;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.Arrays;
import java.util.Collections;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Hosts the Timemark_Sirinono web app, bundled in assets/www, inside a WebView. */
public class MainActivity extends Activity {
    // Reserved by Google for apps serving local content; a secure origin (camera/GPS allowed) that never resolves on the network.
    static final String APP_HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + APP_HOST + "/index.html";

    private static final int REQ_CAMERA = 1;
    private static final int REQ_LOCATION = 2;
    static final int REQ_STORAGE = 3;
    private static final int REQ_PICK_IMAGE = 10;

    private static final int MIN_WEBVIEW = 80;
    private static final String OUTDATED_PAGE = "<meta name=viewport content='width=device-width,initial-scale=1'>"
            + "<body style='font-family:sans-serif;padding:24px;line-height:1.5'><h2>Timemark_Sirinono</h2>"
            + "<p>Thành phần hiển thị web của máy (Android System WebView) đã quá cũ nên chưa chạy được ứng dụng.</p>"
            + "<p>Hãy mở CH Play, cập nhật <b>Android System WebView</b> và <b>Chrome</b>, rồi mở lại ứng dụng.</p>";

    private WebView web;
    private PermissionRequest pendingCamera;
    private String pendingGeoOrigin;
    private GeolocationPermissions.Callback pendingGeoCallback;
    private ValueCallback<Uri[]> pendingFiles;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        web.setBackgroundColor(0xff0b0f17);
        setContentView(web);

        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);

        web.addJavascriptInterface(new PhotoBridge(this), "TimemarkNative");
        web.setWebViewClient(new AppClient());
        web.setWebChromeClient(new AppChrome());

        if (webViewMajorVersion(settings.getUserAgentString()) < MIN_WEBVIEW) {
            web.loadDataWithBaseURL(null, OUTDATED_PAGE, "text/html", "utf-8", null);
            return;
        }
        if (savedInstanceState == null || web.restoreState(savedInstanceState) == null) web.loadUrl(START_URL);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    /** Volume keys work as a shutter button, like most camera apps. */
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_VOLUME_DOWN || keyCode == KeyEvent.KEYCODE_VOLUME_UP) {
            if (event.getRepeatCount() == 0) web.evaluateJavascript("document.dispatchEvent(new Event('native-shutter'))", null);
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onPause() {
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }

    boolean hasPermission(String permission) {
        return checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED;
    }

    private static boolean granted(int[] results) {
        if (results.length == 0) return false;
        for (int r : results) if (r == PackageManager.PERMISSION_GRANTED) return true;
        return false;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        if (requestCode == REQ_CAMERA && pendingCamera != null) {
            if (granted(grantResults)) pendingCamera.grant(new String[] {PermissionRequest.RESOURCE_VIDEO_CAPTURE});
            else pendingCamera.deny();
            pendingCamera = null;
        } else if (requestCode == REQ_LOCATION && pendingGeoCallback != null) {
            pendingGeoCallback.invoke(pendingGeoOrigin, granted(grantResults), false);
            pendingGeoCallback = null;
            pendingGeoOrigin = null;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_PICK_IMAGE && pendingFiles != null) {
            pendingFiles.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            pendingFiles = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    private final class AppChrome extends WebChromeClient {
        @Override
        public void onPermissionRequest(PermissionRequest request) {
            if (!APP_HOST.equals(request.getOrigin().getHost())
                    || !Arrays.asList(request.getResources()).contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)) {
                request.deny();
                return;
            }
            if (hasPermission(Manifest.permission.CAMERA)) {
                request.grant(new String[] {PermissionRequest.RESOURCE_VIDEO_CAPTURE});
                return;
            }
            if (pendingCamera != null) pendingCamera.deny();
            pendingCamera = request;
            requestPermissions(new String[] {Manifest.permission.CAMERA}, REQ_CAMERA);
        }

        @Override
        public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
            if (hasPermission(Manifest.permission.ACCESS_FINE_LOCATION) || hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION)) {
                callback.invoke(origin, true, false);
                return;
            }
            pendingGeoOrigin = origin;
            pendingGeoCallback = callback;
            requestPermissions(new String[] {Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_LOCATION);
        }

        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (pendingFiles != null) pendingFiles.onReceiveValue(null);
            pendingFiles = callback;
            Intent intent = new Intent(Intent.ACTION_GET_CONTENT).addCategory(Intent.CATEGORY_OPENABLE).setType("image/*");
            try {
                startActivityForResult(Intent.createChooser(intent, "Chọn ảnh"), REQ_PICK_IMAGE);
            } catch (ActivityNotFoundException e) {
                pendingFiles = null;
                return false;
            }
            return true;
        }
    }

    private final class AppClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            if (!APP_HOST.equals(request.getUrl().getHost())) return null;
            String path = request.getUrl().getPath();
            if (path == null || path.equals("/")) path = "/index.html";
            try {
                return new WebResourceResponse(mimeType(path), "utf-8", getAssets().open("www" + path));
            } catch (IOException e) {
                return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found",
                        Collections.<String, String>emptyMap(), new ByteArrayInputStream(new byte[0]));
            }
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            if (APP_HOST.equals(request.getUrl().getHost())) return false;
            // The native bridge is only for the bundled app, so other pages open in the browser.
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, request.getUrl()));
            } catch (ActivityNotFoundException ignored) {
                // no browser installed
            }
            return true;
        }
    }

    /** Chromium version from a WebView user agent ("... Chrome/113.0.5672.136 ..."); 0 if it has none. */
    static int webViewMajorVersion(String userAgent) {
        Matcher m = Pattern.compile("Chrome/(\\d+)").matcher(userAgent == null ? "" : userAgent);
        return m.find() ? Integer.parseInt(m.group(1)) : 0;
    }

    private static String mimeType(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".js")) return "text/javascript";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".json")) return "application/json";
        if (path.endsWith(".svg")) return "image/svg+xml";
        if (path.endsWith(".png")) return "image/png";
        return "application/octet-stream";
    }
}
