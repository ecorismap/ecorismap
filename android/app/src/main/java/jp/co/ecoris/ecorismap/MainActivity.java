package jp.co.ecoris.ecorismap;

import android.content.ContentResolver;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.util.Log;
import com.facebook.react.ReactActivity;
import com.facebook.react.ReactActivityDelegate;
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint;
import com.facebook.react.defaults.DefaultReactActivityDelegate;
import expo.modules.ReactActivityDelegateWrapper;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

public class MainActivity extends ReactActivity {

  /**
   * Returns the name of the main component registered from JavaScript.
   * This is used to schedule rendering of the component.
   */
  @Override
  protected String getMainComponentName() {
    return "main";
  }

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    // Set the theme to AppTheme BEFORE onCreate to support
    // coloring the background, status bar, and navigation bar.
    // This is required for expo-splash-screen.
    setTheme(R.style.AppTheme);
    super.onCreate(null);
  }

  /**
   * Returns the instance of the {@link ReactActivityDelegate}. There the RootView is created and
   * you can specify the renderer you wish to use - the new renderer (Fabric) or the old renderer
   * (Paper).
   */
  @Override
  protected ReactActivityDelegate createReactActivityDelegate() {
    return new ReactActivityDelegateWrapper(
      this,
      BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
      new DefaultReactActivityDelegate(
        this,
        getMainComponentName(),
        DefaultNewArchitectureEntryPoint.getFabricEnabled()
      )
    );
  }

  // // on your MainActivity Class body
  @Override
  public void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    Uri data = getIntent().getData();
    if (data != null) {
      try {
        Log.d("ecorismapLog", "Start Import");
        importData(data);
      } catch (Exception e) {
        Log.e("File Import Error", e.getMessage());
      }
    }
    getIntent().setData(null);
  }

  @Override
  protected void onResume() {
    super.onResume();
    Uri data = getIntent().getData();
    if (data != null) {
      try {
        Log.d("ecorismapLog", "Start Import");
        importData(data);
      } catch (Exception e) {
        Log.e("File Import Error", e.getMessage());
      }
    }
    getIntent().setData(null);
  }

  private void importData(Uri data) {
    final String scheme = data.getScheme();
    if (ContentResolver.SCHEME_CONTENT.equals(scheme)) {
      try {
        ContentResolver cr = getApplicationContext().getContentResolver();
        InputStream is = cr.openInputStream(data);
        if (is == null) return;

        String name = getContentName(cr, data);
        Log.d("ecorismapLog", name);
        PackageManager m = getPackageManager();
        String s = getPackageName();
        PackageInfo p = m.getPackageInfo(s, 0);
        s = p.applicationInfo.dataDir;

        InputStreamToFile(is, s + "/cache/" + name);
      } catch (Exception e) {
        Log.e("File Import Error", e.getMessage());
      }
    }
  }

  private String getContentName(ContentResolver resolver, Uri uri) {
    Cursor cursor = resolver.query(uri, null, null, null, null);

    int nameIndex = cursor.getColumnIndex(MediaStore.MediaColumns.DISPLAY_NAME);
    cursor.moveToFirst();
    if (nameIndex >= 0) {
      return cursor.getString(nameIndex);
    } else {
      return null;
    }
  }

  private void InputStreamToFile(InputStream in, String file) {
    try {
      OutputStream out = new FileOutputStream(new File(file));

      int size = 0;
      byte[] buffer = new byte[1024];

      while ((size = in.read(buffer)) != -1) {
        out.write(buffer, 0, size);
      }

      out.close();
    } catch (Exception e) {
      Log.e("MainActivity", "InputStreamToFile exception: " + e.getMessage());
    }
  }
}
