package com.gdalwarp;

import android.content.res.AssetManager;
import android.util.Log;
import androidx.annotation.NonNull;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.module.annotations.ReactModule;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Enumeration;
import java.util.Vector;
import org.gdal.gdal.Dataset;
import org.gdal.gdal.Driver;
import org.gdal.gdal.WarpOptions;
import org.gdal.gdal.gdal;
import org.gdal.gdalconst.gdalconstConstants;

@ReactModule(name = GdalwarpModule.NAME)
public class GdalwarpModule extends ReactContextBaseJavaModule {

  public static final String NAME = "Gdalwarp";
  private static final String E_CONVERT_ERROR = "E_CONVERT_ERROR";
  private static final String TAG = "Gdalwarp";

  private void copyAssets(ReactApplicationContext reactContext) {
    try {
      AssetManager assetManager = reactContext.getAssets();
      String[] files = assetManager.list("proj");
      File projDir = new File(reactContext.getFilesDir(), "proj");
      if (!projDir.exists()) {
        projDir.mkdirs();
      }
      for (String filename : files) {
        Log.d(TAG, "PdfToImageModule: copy_proj_files: filename: " + filename);
        InputStream is = assetManager.open("proj/" + filename);
        OutputStream os = new FileOutputStream(new File(projDir, filename));
        byte[] buffer = new byte[1024];
        int length;
        while ((length = is.read(buffer)) > 0) {
          os.write(buffer, 0, length);
        }
        is.close();
        os.close();
      }
      gdal.SetConfigOption("PROJ_LIB", projDir.getAbsolutePath());
      Log.d(TAG, "PdfToImageModule: copy_proj_files: PROJ_LIB: " + projDir.getAbsolutePath());
      files = assetManager.list("gdal");
      File gdalDir = new File(reactContext.getFilesDir(), "gdal");
      if (!gdalDir.exists()) {
        gdalDir.mkdirs();
      }
      for (String filename : files) {
        Log.d(TAG, "PdfToImageModule: copy_proj_files: filename: " + filename);
        InputStream is = assetManager.open("gdal/" + filename);
        OutputStream os = new FileOutputStream(new File(gdalDir, filename));
        byte[] buffer = new byte[1024];
        int length;
        while ((length = is.read(buffer)) > 0) {
          os.write(buffer, 0, length);
        }
        is.close();
        os.close();
      }
      gdal.SetConfigOption("GDAL_DATA", gdalDir.getAbsolutePath());
      Log.d(TAG, "PdfToImageModule: copy_proj_files: GDAL_DATA: " + gdalDir.getAbsolutePath());
    } catch (IOException e) {
      Log.e(TAG, "PdfToImageModule: copy_proj_files: error", e);
      e.printStackTrace();
    }
  }

  public GdalwarpModule(ReactApplicationContext reactContext) {
    super(reactContext);
    this.copyAssets(reactContext);
  }

  @Override
  @NonNull
  public String getName() {
    return NAME;
  }

  private WritableMap getOutputFileMap(Dataset outputDataset, String outputFilePath) {
    double[] adfGeoTransform = new double[6];
    outputDataset.GetGeoTransform(adfGeoTransform);

    double topLeftX = adfGeoTransform[0];
    double topLeftY = adfGeoTransform[3];
    double bottomRightX = adfGeoTransform[0] + adfGeoTransform[1] * outputDataset.getRasterXSize();
    double bottomRightY = adfGeoTransform[3] + adfGeoTransform[5] * outputDataset.getRasterYSize();
    Log.d(TAG, "getOutputFileMap: topLeftX: " + topLeftX);
    Log.d(TAG, "getOutputFileMap: topLeftY: " + topLeftY);
    Log.d(TAG, "getOutputFileMap: bottomRightX: " + bottomRightX);
    Log.d(TAG, "getOutputFileMap: bottomRightY: " + bottomRightY);
    Log.d(TAG, "getOutputFileMap: bottomRightX: " + bottomRightX);
    Log.d(TAG, "getOutputFileMap: bottomRightY: " + bottomRightY);
    WritableMap fileMap = Arguments.createMap();
    fileMap.putString("uri", outputFilePath);
    fileMap.putDouble("width", outputDataset.getRasterXSize());
    fileMap.putDouble("height", outputDataset.getRasterYSize());
    fileMap.putMap("topLeft", createCoordinateMap(topLeftX, topLeftY));
    fileMap.putMap("bottomRight", createCoordinateMap(bottomRightX, bottomRightY));
    return fileMap;
  }

  private WritableMap convertPDF2PNG(String pdfUriString, String outputFilePath) {
    Dataset hDataset = gdal.Open(pdfUriString, gdalconstConstants.GA_ReadOnly);
    if (hDataset == null) {
      return null;
    }

    Vector<String> options = new Vector<>();
    options.add("-t_srs");
    options.add("epsg:3857");
    options.add("-of");
    options.add("PNG");
    options.add("-r");
    options.add("lanczos");

    WarpOptions warpOptions = new WarpOptions(options);
    Dataset outputDataset = gdal.Warp(outputFilePath, new Dataset[] { hDataset }, warpOptions);
    hDataset.delete();
    if (outputDataset == null) {
      return null;
    }

    WritableMap fileMap = getOutputFileMap(outputDataset, outputFilePath);
    outputDataset.delete();

    return fileMap;
  }

  private void convertMultiPDF2PNG(String pdfUriString, Promise promise) {
    try {
      gdal.SetConfigOption("GDAL_PDF_DPI", "300");
      gdal.AllRegister();
      //Subsetsの取得
      Dataset hDataset = gdal.Open(pdfUriString, gdalconstConstants.GA_ReadOnly);
      if (hDataset == null) {
        promise.reject("E_CONVERT_ERROR", "Unable to open input file.");
        return;
      }

      Vector papszMetadata = hDataset.GetMetadata_List("SUBDATASETS");
      int subdatasetsCount = papszMetadata.size() / 2;
      hDataset.delete();
      ////////////////////
      WritableMap result = Arguments.createMap();
      WritableArray outputFiles = Arguments.createArray();
      if (subdatasetsCount == 0) {
        String outputFilePath = pdfUriString.replace(".pdf", ".png");
        WritableMap fileMap = convertPDF2PNG(pdfUriString, outputFilePath);
        if (fileMap != null) {
          outputFiles.pushMap(fileMap);
        }
      } else {
        for (int i = 1; i <= subdatasetsCount; i++) {
          String outputFilePath = pdfUriString.replace(".pdf", "_" + i + ".png");
          WritableMap fileMap = convertPDF2PNG("PDF:" + i + ":" + pdfUriString, outputFilePath);
          if (fileMap != null) {
            outputFiles.pushMap(fileMap);
          }
        }
      }

      result.putArray("outputFiles", outputFiles);
      promise.resolve(result);
    } catch (Exception e) {
      promise.reject("E_CONVERT_ERROR", e.toString());
    }
  }

  private void createGeoPDF(String xmlUriString, Promise promise) {
    try {
      gdal.AllRegister();
      String outputFilePath = xmlUriString.replace(".xml", "_out.pdf");
      Driver pdfDriver = gdal.GetDriverByName("PDF");
      String[] options = new String[] { "COMPOSITION_FILE=" + xmlUriString };
      //Log.d(TAG, "createGeoPDF: outputFilePath: " + outputFilePath);
      pdfDriver.Create(outputFilePath, 0, 0, 0, gdalconstConstants.GDT_Unknown, options);
      Dataset outputDataset = gdal.Open(outputFilePath, gdalconstConstants.GA_ReadOnly);

      if (outputDataset == null) {
        Log.e(TAG, "createGeoPDF: outputDataset is null");
        promise.reject("E_CONVERT_ERROR", "Unable to open input file.");
        return;
      }
      Driver hDriver = outputDataset.GetDriver();
      // Log.d(TAG, "Driver: " + hDriver.getShortName() + "/" + hDriver.getLongName());
      // Log.d(TAG, "createGeoPDF: outputDataset: " + outputDataset);

      WritableMap result = Arguments.createMap();
      WritableArray outputFiles = Arguments.createArray();
      WritableMap fileMap = getOutputFileMap(outputDataset, outputFilePath);
      outputDataset.delete();
      outputFiles.pushMap(fileMap);
      result.putArray("outputFiles", outputFiles);

      promise.resolve(result);
    } catch (Exception e) {
      Log.e(TAG, "createGeoPDF: error", e);
      promise.reject("E_CONVERT_ERROR", e.toString());
    }
  }

  @ReactMethod
  public void convert(String pdfUriString, Promise promise) {
    String extension = pdfUriString.substring(pdfUriString.lastIndexOf(".") + 1);
    // Log.d(TAG, "convert: extension: " + extension);
    // Log.d(TAG, "convert: pdfUriString: " + pdfUriString);
    if (extension.equals("pdf")) {
      this.convertMultiPDF2PNG(pdfUriString, promise);
    } else if (extension.equals("xml")) {
      this.createGeoPDF(pdfUriString, promise);
    } else {
      promise.reject("E_CONVERT_ERROR", "Unsupported file format.");
    }
  }

  private WritableMap createCoordinateMap(double x, double y) {
    WritableMap map = Arguments.createMap();
    map.putDouble("x", x);
    map.putDouble("y", y);
    return map;
  }
}
