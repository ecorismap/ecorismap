<style>
table {
    border-collapse: collapse;
}
table, th, td {
     border: none!important;
     vertical-align:top;
}
@media only screen and (max-width: 750px) {
    img { width: 100%; }
}
</style>
<div style="text-align: right;">
13/9/2022 updated 
</div>

<img src="images/toplogo_en.png" width="460">

## What is EcorisMap?

EcorisMap is an application that allows you to record and check your location with your smartphone.

Main features
- Location information can be displayed and recorded on a map.
- Any map published in map tile format can be loaded.
- You can import GeoJSON or GPX format data created by GIS and set labels and colors.
- You can set your own items to be recorded, and use forms such as lists and checkboxes.
- Recorded data can be exported in CSV, GeoJSON, and GPX formats.
- You can use it in offline mode even in places where there is no Internet environment.

## Quick Start
### Main screen

|Home|Add Points|Select Map|Map Settings||
|-|-|-|-|-|-|
|<img src="images/HomeScreen.png" width="180px">|<img src="images/PointAddScreen.png" width="180px">|<img src="images/MapScreen.png" width="180px">|<img src="images/MapSettingScreen.png" width="180px">|


|Layer List|Layer Settings|Data|Data Editing|
|-|-|-|-|-|-|
|<img src="images/LayersScreen.png" width="250px">|<img src="images/LayerEditScreen.png" width="180px">|<img src="images/DataScreen.png" width="180px">|<img src="images/DataEditScreen.png" width="180px">|

### Procedure
#### A. Map Preparation
  1. press the map selection button on the home screen. 2.
  Select the map you wish to view on the map selection screen. 3.
  If you wish to use the map offline, download the map. 4.
  4. if you want to add a map, add a new map setting or select from the list of map settings.

#### B. Prepare data to be displayed
  1. press the Layer List button from the Home screen
  1. import the data you want to display (GeoJSON or GPX) by pressing the Import button. 2.
  Change the style (color) of the data. 3.
  If you want to display labels, select the field name you want to use for the labels.

#### C. Setting up layers for recording
  On the Layer List screen, click the Add New button to create a layer to be used for recording data. 2.
  On the Layer Settings screen, add a layer name, style, and fields, and save the layer. 3.
  3. To edit an existing layer, press the Layer Settings button.

#### D. Using in the Field
  1. turn on GPS and navigate to your current location
  2. for offline use, switch to offline mode on the map selection screen.
  To record a track, press the track button to start recording. Press again to end recording. 4.
  To record location information, switch the layer to edit mode on the layer list screen. 4.
  Select the Point tool or Line tool on the Home screen to add points or lines. 5.
  5. enter the field values in the Data Edit screen and save the data.


#### E. Exporting Data
  1. select a layer from the Layer List screen to display data. 2.
  2. select the data and press the Export button.


## Basic Operations

### Home
On the Home screen, you can operate the map and various function buttons.
<img src="images/HomeScreen.png" width="300" align="right" style="margin-left:10px">

**(1) Map Selection Button**.
Opens the map selection screen.

**(2) Record Track**.
Press the track button to start recording. Press again to end recording. The track will be recorded on a linetype layer that is in edit mode. cmt field will record the total distance. (If there is no cmt field, it will not be recorded.)

**(3) Layer List button**
Opens the Layer List screen.

**(4) Select Point and Line Tools**
Displays the Point Tool and Line Tool.

**(5) Settings button**
Opens the Settings screen.

**(6) Compass**
Toggles between north-up (north direction up) and heading-up (direction of travel up) on the map.

**(7) Zoom**
Changes the scale of the map. You can also change it by pinching in and out of the screen.

**(8) GPS**.
Activates GPS to display current location. When activated, it is in the current location tracking mode. Drag the map to release the tracking mode, and press the GPS button again to enter the tracking mode. Pressing the GPS button while in track mode turns it off.
The orange marker indicates the current location within 1.5 meters of accuracy, and the red marker indicates accuracy within 1.5 meters of accuracy.

<br clear="right">

### Map Selection
The map selection screen allows you to select and set the map to be displayed.
<img src="images/MapScreen.png" width="300" align="right">

**(1)Select map**.
Select the map to be displayed. Maps with transparency settings can be overlaid with the map below.

**(2)Map Settings button**
Opens the map settings.

**(3)Download button**
Opens the map download screen.

**(4) Map settings list button** Opens a list of pre-registered map settings.
Opens a list of pre-registered map settings.

**(5) Add Map Setting Button** Opens the Add New Map Setting screen.
Opens the Add New Map Setting screen.

**(6)Toggle Offline Mode** Toggles between offline and online mode.
Switches between offline mode and online mode. Offline mode loads previously downloaded maps from the cache and displays them. Use this mode in places where there is no Internet environment.

<br clear="right">

### Downloading maps
The map download screen downloads maps for offline use.
<img src="images/MapDownloadScreen.png" width="300" align="right">

**(1)Download map**.
Navigate to the area and coverage you need and press the Download button. A map with zoom levels 0-16 covering that area will be downloaded.

**(2)Delete map**.
Delete a map that has already been downloaded. The already downloaded area will be displayed in orange.
<br clear="right">

### Map Settings
The Map Settings screen allows you to register and configure the display settings for map tiles.
<img src="images/MapSettingScreen.png" width="300" align="right">

**(1)Map name**.

**(2)URL of the map tile**
Enter in a format such as https://example/{z}/{x}/{y}.png. Please read the terms of use of the map to determine if it can be used.

**(3)Source Indication**.
Please indicate the source of the map according to the map's terms of use.

**(4) Transparency setting 0 (opaque) to 1 (transparent)**
Maps with transparency settings can be superimposed on the map below. Use this setting when you want to superimpose a shaded undulation map.

**(5)Minimum Zoom**.
Maps will not be displayed at zoom levels lower than this value.

**(6)Maximum zoom**.
Maps will not be displayed at zoom levels greater than this value.

**(7) Fixed zoom**.
At zoom levels greater than this value, the map at the fixed zoom level is enlarged.

**(8)High resolution**.
Displays the map at one zoom level higher. Use this function when you want to display a detailed map in a wide area on a standard Geographical Survey Institute map.

**(9)Y-axis reversal**
Check this box when loading TMS tiles (Y-axis origin is down). The default is XYZ tiles (Y-axis origin is up).

**(10)Delete setting**.
Delete this map setting.

<br clear="right">

### Map Settings List
The Map Settings List screen displays pre-registered map settings.
<img src="images/MapListScreen.png" width="300" align="right">

**(1)Add Map Setting button**.
Map settings will be added to the map selection screen.

**(2)Reload button**
Reloads a list of pre-registered map settings. The URL of the map settings list is specified on the settings screen.

<br clear="right">

### Layer List
The Layer List screen displays a list of layers and accesses their data and layer settings.
<img src="images/LayersScreen.png" width="300" align="right">

**(1)Display Switch Button**.
Toggles the display of layer data.

**(2)Style button**
Opens the layer style setting screen.

**(3)Edit checkbox**
Selects the layer to be in edit mode. When adding or editing points or lines, layers in edit mode are targeted. Layers of the same type (point or line) cannot be in edit mode at the same time.

**(4)Data Confirmation**.
Tap a layer name to open the layer's data screen.

**(5)Label Setting**
Select a field name to be displayed as a label.

**(6)Layer setting button**
Opens the Layer Settings screen.

**(7)Data Import button**
Import GeoJSON or GPX data. GeoJSON supports latitude and longitude points, lines, and polygons. GPX supports waypoints and tracks. Files can also be imported by opening them directly in EcorisMap.

**(8)Add Layer Settings button**.
Opens the Layer Settings screen to add a new layer.

<br clear="right">

### Layer Settings
The Layer Settings screen sets the layer name, type, and data fields.
<img src="images/LayerEditScreen.png" width="300" align="right">

**(1)Layer Name**.
Enter a layer name.

**(2)Style Setting Button**
Opens the style setting window.

**(3)Select Type**
Select a type. Point, Line, Polygon, None are supported. Polygon is read-only. None" is used to record data without location information.

**(4)Add Field button**.
Adds a field.

**(5)Field Name**
Enter a field name.

**(6)Data Format**
Select the data format. String, Sequential Number, Date, Date, Time, Time Range, Integer, Decimal, Numeric Range, List, Radio Button, Check Button, Photo, Table, and List Table are supported.

**(7)Delete Field button**.
Deletes a field.

**(8)Set Default Value, List Item**.
Sets default values for string and integer fields. Sets candidate values for lists, radio buttons, check buttons, tables, and list tables.

**(9)Change Display Order Button**
Changes the display order of fields.

**(10)Delete Layer Button**
Deletes a layer and its data.

**(11)Save Settings**
Saves changes to the layer settings.

<br clear="right">

### Style Settings
In the style setting screen, you can set the style (color) of the layer.
<img src="images/LayerEditStyleScreen.png" width="300" align="right">

**(1)Color Type**.
Selects the color application method. Single color and category are supported. Category fills in a color for each field value.

**(2)Transparency**.
Set the transparency of the fill when it is a polygon. 0 (opaque) to 1 (transparent). When the transparency setting is set to 1, the polygon's border is displayed.

**(3)Field Name**.
Selects the field name when the color type is category.

**(4)Color Ramp**.
Selects the color fill method to be automatically obtained when the color type is category. Only random is supported at this time.

**(5)Auto Get Button**
When the color type is category, this button automatically gets the value of the field and sets the color according to the color ramp.

**(6)Add Color Button**
Manually adds a color to a field value when the color type is category.

**(7) Set Color**.
Select a color with the color picker.

**(8) Delete Color Settings button**
Deletes the color settings for the field.

<br clear="right">

### Field Value Settings
The Field Value Settings screen allows you to set default values for fields and candidate values for lists and checkboxes.
<img src="images/LayerEditValueListScreen.png" width="300" align="right">

**(1)Value**.
Enter default value or list or checkbox value.

**(2)Add Value Button**
Add a value.

**(3)Add "other" value**.
Add "Other" value.

**(4) Delete value button**
Deletes a value.

<br clear="right">

### Data
The Data Screen displays a list of data and allows access and manipulation of each data.
<img src="images/DataScreen.png" width="300" align="right">

**(1)Display Switch Button**
Switches the display of data. The button in the header toggles between all data.

**(2) Data selection checkbox**
Select data to be deleted or exported. The checkbox in the header selects all data.

**(3) Change ascending or descending order**.
Tap a field name to change the ascending or descending order of data display.

**(4) Enter or edit data**.
Tap data to open the edit screen for that data.

**(5)Add Data button**
Adds new data. The default value of coordinates is 0,0.

**(6)Delete button**
Deletes the selected data.

**(7) Export button**
Exports the selected data.

<br clear="right">

### Data Edit
The Data Edit screen allows you to enter and edit data.
<img src="images/DataEditScreen.png" width="300" align="right">

**(1)Layer name**.
Displays the layer name of the data.

**(2)Field**.
Enter or select a value according to the field type.

**(3)Take Photo Button**
Takes a photo.

**(4) Select Photo Button**
Selects a photo.

**(5) View and Delete Photo**.
Tap a photo to enlarge it. You can also delete it.

**(6)Switch coordinates display button**.
Switches the display of coordinates between decimal and hexadecimal.

**(7)Move to Data button**
Moves the map to the data location.

**(8)GoogleMap button**
Displays the data location on Google Map. This is useful when using route information, etc.

**(9)Delete button**
Deletes data.

**(10)Save button**
Saves data changes.


<br clear="right">

### Add Point
Adds point location information with the Point Tool.
<img src="images/PointAddScreen.png" width="300" align="right">

**(1)Show Point Tool button**.
Displays the Point Tool.

**(2)Line tool button**
Displays the Line tool.

**(3)Add to Current Location button**
Adds a point to the current location. GPS must be turned on.

**(4)Add button to any location**.
Add a point to the tapped location on the map.

**(5)Move Point button**
With the button selected, press and hold the point and drag to move it.

<br clear="right">

### Add Line
Add line position information with the line tool.
<img src="images/LineAddScreen.png" width="300" align="right">

**(1)Add Line button**.
Trace over the map to add a line. You can modify a line by tracing it while it is selected (blue dashed line).

**(2)Select line button**
Select the line you want to modify. Select the button and tap the line you wish to correct. When selected, the line will become a blue dashed line.

**(3)Screen move button**
Use this button to move the screen while keeping the line selected. Select the button and drag the map.

**(4) Save button**
Saves line edits.

**(5) Redo button**
Redo button** redoes the line edit once. Pressing it twice discards the previous edits.

**(6) Delete button**
Deletes the selected line.

<br clear="right">

### Split screen
The home screen can be divided and displayed.
<img src="images/DividedScreen.png" width="300" align="right">

**(1)Split screen button**
Switches between split-screen and full-screen display. Use this button when you want to view data and a map at the same time.

**(2)Close button**
Closes the display screen and displays the home screen.

<br clear="right">

### Settings
In the Settings screen, you can refer to various settings and manuals, etc.
<img src="images/SettingsScreen.png" width="300" align="right">

**(1)Map settings list URL**.
Specify the URL for the map's settings list. The map settings list screen will load data from the URL specified here.

**(2)Backup data**.
Saves the current data and settings. Previous backup data will be overwritten.

**(3)Restore data**.
Restores saved data and settings.

**(4)Clear Map Cache**
Clears all cache of downloaded maps.

**(5)Initialize App**
Restores the app to its initial state. All EcorisMap data and settings in the device will be reset.

**(6)How to use EcorisMap**.
Displays how to use (this site).

**(7)Terms of Use**
Displays the Terms of Use.

**(8)Version** Displays the version of EcorisMap.
Displays the version.

<br clear="right">


## Applications

### Create a map setting list
<img src="images/SpreadSheet.png" width="800">

If you create a map settings list in a Google Spreadsheet, you can import it into EcorisMap.

1. correctly enter the following configuration item names in the first line of the Google Spreadsheet
  - name
  - url
  - attribution
  - transparency
  - overzoomThreshold
  - highResolutionEnabled
  - minimumZ
  - maximumZ
  - flipY 2.
Enter the setting values on the second line. 3.
3. go to File --> Publish to Web --> Select Sheet --> Select Comma Separated Values (.csv) 
   <img src="images/SpreadSheet2.png" width="400"> 4.
4. copy and paste the link into EcorisMap Settings --> Map Settings List URL
5. click the reload button on the map settings list screen to load it.
