package com.rnmaps.maps;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Rect;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.Operation;
import androidx.work.WorkInfo;
import androidx.work.WorkManager;
import androidx.work.WorkRequest;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import com.google.android.gms.maps.GoogleMap;
import com.google.android.gms.maps.model.Tile;
import com.google.android.gms.maps.model.TileOverlay;
import com.google.android.gms.maps.model.TileOverlayOptions;
import com.google.android.gms.maps.model.TileProvider;
import com.google.android.gms.maps.model.UrlTileProvider;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.System;
import java.net.MalformedURLException;
import java.net.URL;
import java.net.URLConnection;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

public class MapTileProvider implements TileProvider {

  class AIRMapUrlTileProvider extends UrlTileProvider {

    private String urlTemplate;

    public AIRMapUrlTileProvider(int width, int height, String urlTemplate) {
      super(width, height);
      this.urlTemplate = urlTemplate;
    }

    @Override
    public URL getTileUrl(int x, int y, int zoom) {
      if (MapTileProvider.this.flipY == true) {
        y = (1 << zoom) - y - 1;
      }

      String s =
        this.urlTemplate.replace("{x}", Integer.toString(x))
          .replace("{y}", Integer.toString(y))
          .replace("{z}", Integer.toString(zoom));
      URL url = null;

      if (MapTileProvider.this.maximumZ > 0 && zoom > MapTileProvider.this.maximumZ) {
        return url;
      }

      if (MapTileProvider.this.minimumZ > 0 && zoom < MapTileProvider.this.minimumZ) {
        return url;
      }

      try {
        url = new URL(s);
      } catch (MalformedURLException e) {
        throw new AssertionError(e);
      }
      return url;
    }

    public void setUrlTemplate(String urlTemplate) {
      this.urlTemplate = urlTemplate;
    }
  }

  protected static final int BUFFER_SIZE = 16 * 1024;
  // protected static final int TARGET_TILE_SIZE = 512;
  protected UrlTileProvider tileProvider;
  protected String urlTemplate;
  protected int tileSize;
  protected boolean doubleTileSize;
  protected int maximumZ;
  protected int maximumNativeZ;
  protected int minimumZ;
  protected boolean flipY;
  protected String tileCachePath;
  protected int tileCacheMaxAge;
  protected boolean offlineMode;
  protected Context context;
  protected boolean customMode;

  public MapTileProvider(
    int tileSizet,
    boolean doubleTileSize,
    String urlTemplate,
    int maximumZ,
    int maximumNativeZ,
    int minimumZ,
    boolean flipY,
    String tileCachePath,
    int tileCacheMaxAge,
    boolean offlineMode,
    Context context,
    boolean customMode
  ) {
    this.tileProvider = new AIRMapUrlTileProvider(tileSizet, tileSizet, urlTemplate);

    this.tileSize = tileSizet;
    this.doubleTileSize = doubleTileSize;
    this.urlTemplate = urlTemplate;
    this.maximumZ = maximumZ;
    this.maximumNativeZ = maximumNativeZ;
    this.minimumZ = minimumZ;
    this.flipY = flipY;
    this.tileCachePath = tileCachePath;
    this.tileCacheMaxAge = tileCacheMaxAge;
    this.offlineMode = offlineMode;
    this.context = context;
    this.customMode = customMode;
  }

  @Override
  public Tile getTile(int x, int y, int zoom) {
    if (!this.customMode) return this.tileProvider.getTile(x, y, zoom);

    byte[] image = null;
    int maximumZ = this.maximumZ > 0 ? this.maximumZ : Integer.MAX_VALUE;

    if (this.maximumZ == 0 || zoom > this.maximumZ) return null;
    int drawType = 0; // 0:original 1:high-resolution 2:overzoom
    if (zoom < this.minimumZ) {
      //Log.d("RNM:", "A");
      image = generateTileFromHigherZoom(x, y, zoom);
      drawType = 1;
    } else if (zoom > this.maximumNativeZ && !this.doubleTileSize) {
      //Log.d("RNM:", "B");
      image = drawOverZoomTile(x, y, zoom, this.maximumNativeZ);
      drawType = 2;
    } else if (zoom > this.maximumNativeZ - 1 && this.doubleTileSize) {
      //Log.d("RNM:", "C");
      image = drawOverZoomTile(x, y, zoom, this.maximumNativeZ);
      drawType = 2;
    } else if (zoom <= maximumZ && !this.doubleTileSize) {
      //Log.d("RNM:", "D");
      image = getTileImage(x, y, zoom);
      drawType = 0;
    } else if (zoom <= this.maximumNativeZ - 1 && this.doubleTileSize) {
      //Log.d("RNM:", "E");
      image = drawDoubleSizeTile(x, y, zoom);
      drawType = 0;
    }

    if (image == null && this.tileCachePath != null && this.offlineMode && drawType == 0) {
      //Log.d("urlTile", "findLowerZoomTileForScaling");
      int zoomLevelToStart = (zoom > this.maximumNativeZ) ? this.maximumNativeZ - 1 : zoom - 1; 
      int minimumZoomToSearch = this.minimumZ >= zoom - 3 ? this.minimumZ : zoom - 3;
      for (int tryZoom = zoomLevelToStart; tryZoom >= minimumZoomToSearch; tryZoom--) {
        image = drawOverZoomTile(x, y, zoom, tryZoom);
        if (image != null) {
          break;
        }
      }
    }

    return image == null ? null : new Tile(this.tileSize, this.tileSize, image);
  }

  byte[] getTileImage(int x, int y, int zoom) {
    byte[] image = null;
    if (this.tileCachePath != null) {
      image = readTileImage(x, y, zoom);
      if (image != null && !this.offlineMode) {
        boolean needRefresh = checkForRefresh(x, y, zoom);
        if (needRefresh) {
          image = null;
        }
      }
    }
    if (image == null && !this.offlineMode && this.tileCachePath != null) {
      // Log.d("urlTile", "Normal fetch");
      image = fetchTile(x, y, zoom);
      if (image != null) {
        boolean success = writeTileImage(image, x, y, zoom);
      }
    }
    return image;
  }

  byte[] drawDoubleSizeTile(int x, int y, int zoom) {
    byte[] data;
    Bitmap image = getNewBitmap(this.tileSize * 2, this.tileSize * 2);
    Canvas canvas = new Canvas(image);
    Paint paint = new Paint();

    int X = x * 2;
    int Y = y * 2;
    int Z = zoom + 1;
    byte[] leftTop = getTileImage(X, Y, Z);
    byte[] leftBottom = getTileImage(X, Y + 1, Z);
    byte[] rightTop = getTileImage(X + 1, Y, Z);
    byte[] rightBottom = getTileImage(X + 1, Y + 1, Z);

    if (leftTop == null && leftBottom == null && rightTop == null && rightBottom == null) {
      return null;
    }

    Bitmap bitmap;
    if (leftTop != null) {
      bitmap = BitmapFactory.decodeByteArray(leftTop, 0, leftTop.length);
      if (bitmap != null) {
        canvas.drawBitmap(bitmap, 0, 0, paint);
        bitmap.recycle();
      }
    }
    if (leftBottom != null) {
      bitmap = BitmapFactory.decodeByteArray(leftBottom, 0, leftBottom.length);
      if (bitmap != null) {
        canvas.drawBitmap(bitmap, 0, this.tileSize, paint);
        bitmap.recycle();
      }
    }
    if (rightTop != null) {
      bitmap = BitmapFactory.decodeByteArray(rightTop, 0, rightTop.length);
      if (bitmap != null) {
        canvas.drawBitmap(bitmap, this.tileSize, 0, paint);
        bitmap.recycle();
      }
    }
    if (rightBottom != null) {
      bitmap = BitmapFactory.decodeByteArray(rightBottom, 0, rightBottom.length);
      if (bitmap != null) {
        canvas.drawBitmap(bitmap, this.tileSize, this.tileSize, paint);
        bitmap.recycle();
      }
    }
    data = bitmapToByteArray(image);
    image.recycle();
    return data;
  }

  byte[] generateTileFromHigherZoom(int x, int y, int zoom) {
    int X = x * 2;
    int Y = y * 2;
    int Z = zoom + 1;
    byte[] leftTop = getTileImage(X, Y, Z);
    byte[] leftBottom = getTileImage(X, Y + 1, Z);
    byte[] rightTop = getTileImage(X + 1, Y, Z);
    byte[] rightBottom = getTileImage(X + 1, Y + 1, Z);
    // Log.d(
    //   "urlTile",
    //   "##" + x + " " + y + " " + zoom + " " + leftTop + " " + leftBottom + " " + rightTop + " " + rightBottom
    // );

    if (leftTop == null && leftBottom == null && rightTop == null && rightBottom == null) {
      // Log.d("urlTile", "generateTileFromHigherZoom: null " + x + " " + y + " " + zoom);
      return null;
    }
    
    int width = this.tileSize;
    int height = this.tileSize;
    //Log.d("######urlTile 2", width + " " + height);
    byte[] data;
    Paint paint = new Paint();
    Bitmap combinedBitmap = getNewBitmap(width, height);
    Canvas canvas = new Canvas(combinedBitmap);

    if (leftTop != null) {
      //Log.d("urlTile", "$$" + X + " " + Y + " " + Z);
      Bitmap bitmapLeftTop = BitmapFactory.decodeByteArray(leftTop, 0, leftTop.length);
      if (bitmapLeftTop != null) {
        canvas.drawBitmap(bitmapLeftTop, null, new Rect(0, 0, width / 2, height / 2), paint);
      }
    }
    if (leftBottom != null) {
      //Log.d("urlTile", "$$" + X + " " + (Y + 1) + " " + Z + " " + leftBottom.length);
      Bitmap bitmapLeftBottom = BitmapFactory.decodeByteArray(leftBottom, 0, leftBottom.length);
      if (bitmapLeftBottom != null) {
        canvas.drawBitmap(bitmapLeftBottom, null, new Rect(0, height / 2, width / 2, height), paint);
      }
    }
    if (rightTop != null) {
      //Log.d("urlTile", "$$" + (X + 1) + " " + Y + " " + Z + " " + rightTop.length);
      Bitmap bitmapRightTop = BitmapFactory.decodeByteArray(rightTop, 0, rightTop.length);
      if (bitmapRightTop != null) {
        canvas.drawBitmap(bitmapRightTop, null, new Rect(width / 2, 0, width, height / 2), paint);
      }
    }
    if (rightBottom != null) {
      //Log.d("urlTile", "$$" + (X + 1) + " " + (Y + 1) + " " + Z + " " + rightBottom.length);
      Bitmap bitmapRightBottom = BitmapFactory.decodeByteArray(rightBottom, 0, rightBottom.length);
      if (bitmapRightBottom != null) {
        canvas.drawBitmap(bitmapRightBottom, null, new Rect(width / 2, height / 2, width, height), paint);
      }
    }
    
    data = bitmapToByteArray(combinedBitmap);
    combinedBitmap.recycle();
  
    boolean success = writeTileImage(data, x, y, zoom);
    
    return data;
  }

  Bitmap getNewBitmap(int width, int height) {
    Bitmap image = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
    image.eraseColor(Color.TRANSPARENT);
    return image;
  }

  byte[] bitmapToByteArray(Bitmap bm) {
    ByteArrayOutputStream bos = new ByteArrayOutputStream();
    bm.compress(Bitmap.CompressFormat.PNG, 100, bos);

    byte[] data = bos.toByteArray();
    try {
      bos.close();
    } catch (Exception e) {
      // e.printStackTrace();
    }
    return data;
  }

  byte[] drawOverZoomTile(int x, int y, int zoom, int maximumZoom) {
    int overZoomLevel = zoom - maximumZoom;
    int zoomFactor = 1 << overZoomLevel;
    
    int xParent = x >> overZoomLevel;
    int yParent = y >> overZoomLevel;
    int zoomParent = zoom - overZoomLevel;
    
    int xOffset = x % zoomFactor;
    int yOffset = y % zoomFactor;
    byte[] data;

    if (overZoomLevel > 3) {
      return null;
    }
    Bitmap image = getNewBitmap(this.tileSize, this.tileSize);
    Canvas canvas = new Canvas(image);
    Paint paint = new Paint();
    data = getTileImage(xParent, yParent, zoomParent);

    if (data == null) return null;
    Bitmap sourceImage;

    sourceImage = BitmapFactory.decodeByteArray(data, 0, data.length);
    int subTileSize = this.tileSize / zoomFactor;

    Rect sourceRect = new Rect(
      xOffset * subTileSize,
      yOffset * subTileSize,
      xOffset * subTileSize + subTileSize,
      yOffset * subTileSize + subTileSize
    );
    Rect targetRect = new Rect(0, 0, this.tileSize, this.tileSize);
    canvas.drawBitmap(sourceImage, sourceRect, targetRect, paint);
    sourceImage.recycle();
    data = bitmapToByteArray(image);

    image.recycle();
    return data;
  }

  boolean checkForRefresh(int x, int y, int zoom) {
    String fileName = getTileFilename(x, y, zoom);
    File file = new File(fileName);
    long lastModified = file.lastModified();
    long now = System.currentTimeMillis();

    if ((now - lastModified) / 1000 > this.tileCacheMaxAge) {
      return true;
    }
    return false;
  }

  byte[] fetchTile(int x, int y, int zoom) {
    Tile tile = this.tileProvider.getTile(x, y, zoom);
    if (Objects.isNull(tile)) {
      // Log.d("urlTileA:NO_TILE", getTileFilename(x, y, zoom));
      return null;
    }
    return tile.data;
  }

  byte[] readTileImage(int x, int y, int zoom) {
    InputStream in = null;
    ByteArrayOutputStream buffer = null;
    String fileName = getTileFilename(x, y, zoom);
    if (fileName == null) {
      return null;
    }

    File file = new File(fileName);

    try {
      in = new FileInputStream(file);
      buffer = new ByteArrayOutputStream();

      int nRead;
      byte[] data = new byte[BUFFER_SIZE];

      while ((nRead = in.read(data, 0, BUFFER_SIZE)) != -1) {
        buffer.write(data, 0, nRead);
      }
      buffer.flush();

      if (this.tileCacheMaxAge == 0) {
        file.setLastModified(System.currentTimeMillis());
      }

      return buffer.toByteArray();
    } catch (IOException e) {
      e.printStackTrace();
      return null;
    } catch (OutOfMemoryError e) {
      e.printStackTrace();
      return null;
    } finally {
      if (in != null) try {
        in.close();
      } catch (Exception ignored) {}
      if (buffer != null) try {
        buffer.close();
      } catch (Exception ignored) {}
    }
  }

  boolean writeTileImage(byte[] image, int x, int y, int zoom) {
    OutputStream out = null;
    String fileName = getTileFilename(x, y, zoom);
    if (fileName == null) {
      return false;
    }

    try {
      File file = new File(fileName);
      file.getParentFile().mkdirs();
      out = new FileOutputStream(file);
      out.write(image);

      return true;
    } catch (IOException e) {
      Log.d("urlTile", "writeTileImage: " + e.getMessage());
      e.printStackTrace();
      return false;
    } catch (OutOfMemoryError e) {
      Log.d("urlTile", "writeTileImage: " + e.getMessage());
      e.printStackTrace();
      return false;
    } finally {
      if (out != null) try {
        out.close();
      } catch (Exception ignored) {}
    }
  }

  String getTileFilename(int x, int y, int zoom) {
    if (this.tileCachePath == null) {
      return null;
    }
    String s =
      this.tileCachePath + '/' + Integer.toString(zoom) + "/" + Integer.toString(x) + "/" + Integer.toString(y);
    return s;
  }

  protected URL getTileUrl(int x, int y, int zoom) {
    return this.tileProvider.getTileUrl(x, y, zoom);
  }

  public void setUrlTemplate(String urlTemplate) {
    this.urlTemplate = urlTemplate;
  }

  public void setTileSize(int tileSize) {
    if (this.tileSize != tileSize) {
      this.tileProvider = new AIRMapUrlTileProvider(tileSize, tileSize, urlTemplate);
    }
    this.tileSize = tileSize;
  }

  public void setDoubleTileSize(boolean doubleTileSize) {
    this.doubleTileSize = doubleTileSize;
  }

  public void setMaximumZ(int maximumZ) {
    this.maximumZ = maximumZ;
  }

  public void setMaximumNativeZ(int maximumNativeZ) {
    this.maximumNativeZ = maximumNativeZ;
  }

  public void setMinimumZ(int minimumZ) {
    this.minimumZ = minimumZ;
  }

  public void setFlipY(boolean flipY) {
    this.flipY = flipY;
  }

  public void setTileCachePath(String tileCachePath) {
    this.tileCachePath = tileCachePath;
  }

  public void setTileCacheMaxAge(int tileCacheMaxAge) {
    this.tileCacheMaxAge = tileCacheMaxAge;
  }

  public void setOfflineMode(boolean offlineMode) {
    this.offlineMode = offlineMode;
  }

  public void setCustomMode() {
    this.customMode = customMode;
  }
}