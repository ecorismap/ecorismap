package jp.co.ecoris.ecorismap;

import android.os.Build;
import android.os.Bundle;

import com.facebook.react.ReactActivity;
import com.facebook.react.ReactActivityDelegate;
import com.facebook.react.ReactRootView;

import expo.modules.ReactActivityDelegateWrapper;

import android.content.Intent;
import android.content.ContentResolver;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.provider.MediaStore;
import android.util.Log;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

public class MainActivity extends ReactActivity {
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    // Set the theme to AppTheme BEFORE onCreate to support 
    // coloring the background, status bar, and navigation bar.
    // This is required for expo-splash-screen.
    setTheme(R.style.AppTheme);
    super.onCreate(null);
  }

  /**
   * Returns the name of the main component registered from JavaScript.
   * This is used to schedule rendering of the component.
   */
  @Override
  protected String getMainComponentName() {
    return "main";
  }

  /**
   * Returns the instance of the {@link ReactActivityDelegate}. There the RootView is created and
   * you can specify the renderer you wish to use - the new renderer (Fabric) or the old renderer
   * (Paper).
   */
  @Override
  protected ReactActivityDelegate createReactActivityDelegate() {
    return new ReactActivityDelegateWrapper(this, BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
      new MainActivityDelegate(this, getMainComponentName())
    );
  }

  /**
   * Align the back button behavior with Android S
   * where moving root activities to background instead of finishing activities.
   * @see <a href="https://developer.android.com/reference/android/app/Activity#onBackPressed()">onBackPressed</a>
   */
  @Override
  public void invokeDefaultOnBackPressed() {
    if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
      if (!moveTaskToBack(false)) {
        // For non-root activities, use the default implementation to finish them.
        super.invokeDefaultOnBackPressed();
      }
      return;
    }

    // Use the default back button implementation on Android S
    // because it's doing more than {@link Activity#moveTaskToBack} in fact.
    super.invokeDefaultOnBackPressed();
  }

  // // on your MainActivity Class body
@Override
public void onNewIntent(Intent intent) {
  super.onNewIntent(intent);
  setIntent(intent);
  Uri data = getIntent().getData();
        if(data != null) {
            try {
                Log.d("ecorismapLog", "Start Import");
                importData(data);
            }catch (Exception e) {
                Log.e("File Import Error", e.getMessage());
            }
        }
   getIntent().setData(null);
}



  @Override
    protected void onResume() {
        super.onResume();
        Uri data = getIntent().getData();
        if(data != null) {
            try {
                Log.d("ecorismapLog", "Start Import");
                importData(data);
            }catch (Exception e) {
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
              if(is == null) return;

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

  private String getContentName(ContentResolver resolver, Uri uri){
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
      }
      catch (Exception e) {
          Log.e("MainActivity", "InputStreamToFile exception: " + e.getMessage());
      }
  }


  public static class MainActivityDelegate extends ReactActivityDelegate {
    public MainActivityDelegate(ReactActivity activity, String mainComponentName) {
      super(activity, mainComponentName);
    }

    @Override
    protected ReactRootView createRootView() {
      ReactRootView reactRootView = new ReactRootView(getContext());
      // If you opted-in for the New Architecture, we enable the Fabric Renderer.
      reactRootView.setIsFabric(BuildConfig.IS_NEW_ARCHITECTURE_ENABLED);
      return reactRootView;
    }

    @Override
    protected boolean isConcurrentRootEnabled() {
      // If you opted-in for the New Architecture, we enable Concurrent Root (i.e. React 18).
      // More on this on https://reactjs.org/blog/2022/03/29/react-v18.html
      return BuildConfig.IS_NEW_ARCHITECTURE_ENABLED;
    }
  }
}
