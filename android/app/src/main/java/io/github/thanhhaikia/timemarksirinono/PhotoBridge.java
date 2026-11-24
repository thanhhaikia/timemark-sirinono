package io.github.thanhhaikia.timemarksirinono;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;

/** window.TimemarkNative: saves watermarked JPEGs to the phone's gallery and shares them. */
final class PhotoBridge {
    private static final String ALBUM = "Timemark_Sirinono";
    private final MainActivity activity;

    PhotoBridge(MainActivity activity) {
        this.activity = activity;
    }

    /** Returns "ok" or a Vietnamese error message. */
    @JavascriptInterface
    public String savePhoto(String base64, String name) {
        try {
            store(Base64.decode(base64, Base64.DEFAULT), safeName(name));
            return "ok";
        } catch (Exception e) {
            return errorMessage(e);
        }
    }

    @JavascriptInterface
    public String sharePhoto(String base64, String name) {
        try {
            Uri uri = shareCopy(Base64.decode(base64, Base64.DEFAULT), safeName(name));
            Intent send = new Intent(Intent.ACTION_SEND)
                    .setType("image/jpeg")
                    .putExtra(Intent.EXTRA_STREAM, uri)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            activity.runOnUiThread(() -> activity.startActivity(Intent.createChooser(send, "Chia sẻ ảnh")));
            return "ok";
        } catch (Exception e) {
            return errorMessage(e);
        }
    }

    private String errorMessage(Exception e) {
        if (e instanceof SecurityException) return "Hãy cấp quyền lưu ảnh cho ứng dụng rồi thử lại";
        return "Không lưu được ảnh: " + e.getMessage();
    }

    private static String safeName(String name) {
        String n = name == null ? "" : name.replaceAll("[^A-Za-z0-9._-]", "_");
        if (n.isEmpty()) n = "Timemark_Sirinono_" + System.currentTimeMillis();
        return n.endsWith(".jpg") ? n : n + ".jpg";
    }

    private Uri shareCopy(byte[] jpeg, String name) throws IOException {
        File dir = ShareProvider.dir(activity);
        File[] old = dir.listFiles();
        if (old != null) for (File f : old) f.delete();
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("Cannot create " + dir);
        File file = new File(dir, name);
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(jpeg);
        }
        return ShareProvider.uriFor(file);
    }

    private static File unique(File dir, String name) {
        File file = new File(dir, name);
        String base = name.substring(0, name.length() - 4);
        for (int i = 1; file.exists(); i++) file = new File(dir, base + "_" + i + ".jpg");
        return file;
    }

    private Uri store(byte[] jpeg, String name) throws IOException {
        ContentResolver resolver = activity.getContentResolver();
        if (Build.VERSION.SDK_INT >= 29) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.Images.Media.DISPLAY_NAME, name);
            values.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
            values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/" + ALBUM);
            values.put(MediaStore.Images.Media.IS_PENDING, 1);
            Uri uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new IOException("MediaStore insert failed");
            try (OutputStream out = resolver.openOutputStream(uri)) {
                if (out == null) throw new IOException("Cannot open output stream");
                out.write(jpeg);
            } catch (IOException e) {
                resolver.delete(uri, null, null);
                throw e;
            }
            values.clear();
            values.put(MediaStore.Images.Media.IS_PENDING, 0);
            resolver.update(uri, values, null, null);
            return uri;
        }

        if (!activity.hasPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE)) {
            activity.runOnUiThread(() -> activity.requestPermissions(
                    new String[] {Manifest.permission.WRITE_EXTERNAL_STORAGE}, MainActivity.REQ_STORAGE));
            throw new SecurityException("storage permission");
        }
        File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), ALBUM);
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("Cannot create " + dir);
        File file = unique(dir, name);
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(jpeg);
        }
        ContentValues values = new ContentValues();
        values.put(MediaStore.Images.Media.DATA, file.getAbsolutePath());
        values.put(MediaStore.Images.Media.DISPLAY_NAME, file.getName());
        values.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
        Uri uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
        MediaScannerConnection.scanFile(activity, new String[] {file.getAbsolutePath()}, new String[] {"image/jpeg"}, null);
        if (uri == null) throw new IOException("MediaStore insert failed");
        return uri;
    }
}
