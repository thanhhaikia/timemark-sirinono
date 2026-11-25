package io.github.thanhhaikia.timemarksirinono;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;

/** Read-only provider for photos handed to the share sheet, so sharing does not add gallery copies. */
public final class ShareProvider extends ContentProvider {
    static final String AUTHORITY = "io.github.thanhhaikia.timemarksirinono.share";

    static File dir(Context context) {
        return new File(context.getCacheDir(), "share");
    }

    /** file is dir()/<token>/<name>; the token makes every share a distinct URI. */
    static Uri uriFor(File file) {
        return new Uri.Builder().scheme("content").authority(AUTHORITY)
                .appendPath(file.getParentFile().getName()).appendPath(file.getName()).build();
    }

    private File fileFor(Uri uri) throws FileNotFoundException {
        java.util.List<String> seg = uri.getPathSegments();
        if (seg.size() != 2) throw new FileNotFoundException();
        for (String s : seg) if (s.isEmpty() || s.contains("/") || s.startsWith(".")) throw new FileNotFoundException();
        File f = new File(new File(dir(getContext()), seg.get(0)), seg.get(1));
        if (!f.isFile()) throw new FileNotFoundException(seg.get(1));
        return f;
    }

    @Override public boolean onCreate() { return true; }

    @Override public String getType(Uri uri) { return "image/jpeg"; }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        if (!"r".equals(mode)) throw new SecurityException("read-only");
        return ParcelFileDescriptor.open(fileFor(uri), ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] args, String sort) {
        File f;
        try { f = fileFor(uri); } catch (FileNotFoundException e) { return null; }
        String[] cols = projection != null ? projection : new String[] {OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE};
        Object[] row = new Object[cols.length];
        for (int i = 0; i < cols.length; i++) {
            if (OpenableColumns.DISPLAY_NAME.equals(cols[i])) row[i] = f.getName();
            else if (OpenableColumns.SIZE.equals(cols[i])) row[i] = f.length();
        }
        MatrixCursor c = new MatrixCursor(cols, 1);
        c.addRow(row);
        return c;
    }

    @Override public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException(); }
    @Override public int update(Uri uri, ContentValues v, String s, String[] a) { throw new UnsupportedOperationException(); }
    @Override public int delete(Uri uri, String s, String[] a) { throw new UnsupportedOperationException(); }
}
