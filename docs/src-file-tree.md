src
├── App.tsx
├── __mocks__
│   └── lib
├── __tests__
│   └── resources
│       ├── dataSet.ts
│       ├── geojson.ts
│       ├── invalid_point_gpx.ts
│       ├── invalid_track_gpx.ts
│       ├── layer.ts
│       ├── location.ts
│       ├── maps.ts
│       ├── point_gpx.ts
│       ├── record.ts
│       ├── settings.ts
│       └── track_gpx.ts
├── assets
│   ├── accountIcon.png
│   └── icon.png
├── components
│   ├── atoms
│   │   ├── Airplane.tsx
│   │   ├── Alert.ts
│   │   ├── Alert.web.ts
│   │   ├── Button.tsx
│   │   ├── CheckButton.tsx
│   │   ├── Circle.tsx
│   │   ├── CustomIcon.tsx
│   │   ├── LineArrow.tsx
│   │   ├── LineArrow.web.tsx
│   │   ├── LineLabel.tsx
│   │   ├── LineLabel.web.tsx
│   │   ├── LineView.tsx
│   │   ├── Picker.tsx
│   │   ├── PointLabel.tsx
│   │   ├── PointView.tsx
│   │   ├── PolygonLabel.tsx
│   │   ├── PolygonLabel.web.tsx
│   │   ├── PolygonView.tsx
│   │   ├── RadioButton.tsx
│   │   ├── SelectionalButton.tsx
│   │   ├── SelectionalLongPressButton.tsx
│   │   ├── Slider.tsx
│   │   ├── Text.tsx
│   │   ├── TextInput.tsx
│   │   ├── X.tsx
│   │   └── index.tsx
│   ├── molecules
│   │   ├── AlertAsync.tsx
│   │   ├── CheckBox.tsx
│   │   ├── CheckInput.tsx
│   │   ├── DictionaryTextInput.tsx
│   │   ├── EditString.tsx
│   │   ├── HeaderRightButton.tsx
│   │   ├── Loading.tsx
│   │   ├── SimplePicker.tsx
│   │   └── TextButton.tsx
│   ├── organisms
│   │   ├── DataButton.tsx
│   │   ├── DataEditButtons.tsx
│   │   ├── DataEditCheck.tsx
│   │   ├── DataEditCoords.tsx
│   │   ├── DataEditDatetime.tsx
│   │   ├── DataEditDatetime.web.tsx
│   │   ├── DataEditDictionary.tsx
│   │   ├── DataEditLayerName.tsx
│   │   ├── DataEditList.tsx
│   │   ├── DataEditListTable.tsx
│   │   ├── DataEditModalPhotoView.tsx
│   │   ├── DataEditNumber.tsx
│   │   ├── DataEditNumberRange.tsx
│   │   ├── DataEditPhoto.tsx
│   │   ├── DataEditRadio.tsx
│   │   ├── DataEditRecordSelector.tsx
│   │   ├── DataEditReference.tsx
│   │   ├── DataEditString.tsx
│   │   ├── DataEditTable.tsx
│   │   ├── DataEditTimeRange.tsx
│   │   ├── DataEditTimeRange.web.tsx
│   │   ├── DataTable.tsx
│   │   ├── FeatureStyleColorTable.tsx
│   │   ├── FeatureStyleSingleColorSelect.tsx
│   │   ├── HomeAccountButton.tsx
│   │   ├── HomeAttributionText.tsx
│   │   ├── HomeButtons.tsx
│   │   ├── HomeCompassButton.tsx
│   │   ├── HomeCurrentMarker.tsx
│   │   ├── HomeCurrentMarker.web.tsx
│   │   ├── HomeDownloadArea.tsx
│   │   ├── HomeDownloadButton.tsx
│   │   ├── HomeDrawTools.tsx
│   │   ├── HomeGPSButton.tsx
│   │   ├── HomeInfoToolButton.tsx
│   │   ├── HomeLine.tsx
│   │   ├── HomeLine.web.tsx
│   │   ├── HomeLineToolButton.tsx
│   │   ├── HomeMapMemoBrush.tsx
│   │   ├── HomeMapMemoBrush.web.tsx
│   │   ├── HomeMapMemoColorPicker.tsx
│   │   ├── HomeMapMemoColorPicker.web.tsx
│   │   ├── HomeMapMemoStamp.tsx
│   │   ├── HomeMapMemoStamp.web.tsx
│   │   ├── HomeMapMemoTools.tsx
│   │   ├── HomeMapMemoView.tsx
│   │   ├── HomeMemberMarker.tsx
│   │   ├── HomeMemberMarker.web.tsx
│   │   ├── HomeModalBrushPicker.tsx
│   │   ├── HomeModalEraserPicker.tsx
│   │   ├── HomeModalInfoPicker.tsx
│   │   ├── HomeModalPDFSettings.tsx
│   │   ├── HomeModalPenPicker.tsx
│   │   ├── HomeModalStampPicker.tsx
│   │   ├── HomeModalTermsOfUse.tsx
│   │   ├── HomePDFArea.tsx
│   │   ├── HomePDFArea.web.tsx
│   │   ├── HomePDFButtons.tsx
│   │   ├── HomePoint.tsx
│   │   ├── HomePoint.web.tsx
│   │   ├── HomePolygon.tsx
│   │   ├── HomePolygon.web.tsx
│   │   ├── HomePolygonToolButton.tsx
│   │   ├── HomePopup.tsx
│   │   ├── HomeProjectButtons.tsx
│   │   ├── HomeProjectLabel.tsx
│   │   ├── HomeSvgView.tsx
│   │   ├── HomeTerrainControl.tsx
│   │   ├── HomeTrackLog.tsx
│   │   ├── HomeZoomButton.tsx
│   │   ├── HomeZoomButton.web.tsx
│   │   ├── HomeZoomLevel.tsx
│   │   ├── LayerButtons.tsx
│   │   ├── LayerEditButton.tsx
│   │   ├── LayerEditFieldTable.tsx
│   │   ├── LayerEditLayerName.tsx
│   │   ├── LayerEditLayerStyle.tsx
│   │   ├── LayerEditRadio.tsx
│   │   ├── LayersTable.tsx
│   │   ├── MapButttons.tsx
│   │   ├── MapItems.tsx
│   │   ├── MapListButtons.tsx
│   │   ├── MapListTable.tsx
│   │   ├── MapModalTileMap.tsx
│   │   ├── ProjectEditButtons.tsx
│   │   ├── ProjectEditMembers.tsx
│   │   ├── ProjectsButtons.tsx
│   │   ├── ProjectsModalEncryptPassword.tsx
│   │   ├── SettingsModalFileSave.tsx
│   │   ├── SettingsModalGPS.tsx
│   │   └── SettingsModalMapListURL.tsx
│   └── pages
│       ├── Account.tsx
│       ├── AccountSettings.tsx
│       ├── Data.tsx
│       ├── DataEdit.tsx
│       ├── Home.tsx
│       ├── Home.web.tsx
│       ├── LayerEdit.tsx
│       ├── LayerEditFeatureStyle.tsx
│       ├── LayerEditFieldItem.tsx
│       ├── Layers.tsx
│       ├── Licenses.tsx
│       ├── MapList.tsx
│       ├── Maps.tsx
│       ├── ProjectEdit.tsx
│       ├── Projects.tsx
│       ├── Purchases.tsx
│       ├── Purchases.web.tsx
│       └── Settings.tsx
├── constants
│   ├── APIKeys.ts
│   ├── AppConstants.tsx
│   ├── Maps.tsx
│   └── Tutrials.ts
├── containers
│   ├── Account.tsx
│   ├── AccountSettings.tsx
│   ├── Data.tsx
│   ├── DataEdit.tsx
│   ├── Home.tsx
│   ├── LayerEdit.tsx
│   ├── LayerEditFeatureStyle.tsx
│   ├── LayerEditFieldItem.tsx
│   ├── Layers.tsx
│   ├── Licenses.tsx
│   ├── MapList.tsx
│   ├── Maps.tsx
│   ├── ProjectEdit.tsx
│   ├── Projects.tsx
│   ├── Purchases.tsx
│   ├── Purchases.web.tsx
│   ├── Settings.tsx
│   └── __tests__
│       ├── Account.test.ts
│       ├── AccountSettings.test.ts
│       ├── Data.test.ts
│       ├── DataEdit.test.ts
│       ├── FeatureStyle.test.ts
│       ├── FieldListItem.test.ts
│       ├── Home.test.ts
│       ├── LayerEdit.test.ts
│       ├── Layers.test.ts
│       ├── Maps.test.ts
│       ├── ProjectEdit.test.ts
│       ├── Projects.test.ts
│       ├── Settings.test.ts
│       └── Top.test.ts
├── contexts
│   ├── Account.tsx
│   ├── AccountSettings.tsx
│   ├── Data.tsx
│   ├── DataEdit.tsx
│   ├── Home.tsx
│   ├── LayerEdit.tsx
│   ├── LayerEditFeatureStyle.tsx
│   ├── LayerEditFieldItem.tsx
│   ├── Layers.tsx
│   ├── Licenses.tsx
│   ├── MapList.tsx
│   ├── Maps.tsx
│   ├── ProjectEdit.tsx
│   ├── Projects.tsx
│   └── Settings.tsx
├── hooks
│   ├── __tests__
│   │   ├── useData.spec.ts
│   │   ├── useDataEdit.spec.ts
│   │   ├── useGeoFile.spec.ts
│   │   ├── useLayers.spec.ts
│   │   ├── useMapView.spec.ts
│   │   ├── usePermission.spec.ts
│   │   ├── useProject.spec.ts
│   │   ├── useProjects.spec.ts
│   │   └── useRepository.spec.ts
│   ├── useAccount.ts
│   ├── useData.ts
│   ├── useDataEdit.ts
│   ├── useDictionaryInput.ts
│   ├── useDrawTool.ts
│   ├── useE3kitGroup.ts
│   ├── useEcorismapFile.ts
│   ├── useFeatureSelectionWeb.ts
│   ├── useFeatureStyle.ts
│   ├── useFieldList.ts
│   ├── useGeoFile.ts
│   ├── useLayerEdit.ts
│   ├── useLayers.ts
│   ├── useLocation.ts
│   ├── useMapMemo.ts
│   ├── useMapView.ts
│   ├── useMaps.ts
│   ├── usePDF.ts
│   ├── usePermission.ts
│   ├── usePhoto.ts
│   ├── usePointTool.ts
│   ├── useProject.ts
│   ├── useProjectEdit.ts
│   ├── useProjects.ts
│   ├── usePurchasesWeb.ts
│   ├── useRecord.ts
│   ├── useRepository.ts
│   ├── useSyncLocation.ts
│   ├── useTiles.ts
│   ├── useTutrial.ts
│   ├── useVectorTile.ts
│   └── useWindow.ts
├── i18n
│   ├── config.ts
│   ├── dayjs.ts
│   ├── en
│   │   └── translation.json
│   └── ja
│       └── translation.json
├── lib
│   ├── __tests__
│   │   ├── firebase
│   │   │   ├── firestore_rules.test.ts
│   │   │   └── storage_rules.test.ts
│   │   └── virgilsecurity
│   │       └── e3kit.ts
│   ├── firebase
│   │   ├── firebase.ts
│   │   ├── firebase.web.ts
│   │   ├── firestore.ts
│   │   ├── sign-in.ts
│   │   ├── sign-in.web.ts
│   │   └── storage.ts
│   └── virgilsecurity
│       ├── e3kit-browser.ts
│       ├── e3kit.ts
│       ├── e3kit.web.ts
│       └── processFile.ts
├── licenses.json
├── modules
│   ├── __tests__
│   │   ├── dataSet.test.ts
│   │   ├── layers.test.ts
│   │   ├── projects.test.ts
│   │   ├── settings.test.ts
│   │   ├── tileMaps.test.ts
│   │   └── user.test.ts
│   ├── dataSet.ts
│   ├── index.ts
│   ├── layers.ts
│   ├── projects.ts
│   ├── settings.ts
│   ├── tileMaps.ts
│   ├── trackLog.ts
│   └── user.ts
├── routes
│   ├── index.tsx
│   └── split.tsx
├── store.ts
├── store.web.ts
├── types
│   └── index.d.ts
└── utils
    ├── Account.ts
    ├── Color.ts
    ├── Coords.ts
    ├── Data.ts
    ├── File.ts
    ├── File.web.ts
    ├── Format.ts
    ├── General.ts
    ├── Geometry.ts
    ├── Layer.ts
    ├── Location.ts
    ├── Map.ts
    ├── MapGl.web.ts
    ├── PDF.ts
    ├── PDF.web.ts
    ├── Photo.ts
    ├── Project.ts
    ├── SQLite.ts
    ├── SQLite.web.ts
    ├── Tile.ts
    ├── VectorTile.ts
    ├── Zip.ts
    ├── __tests__
    │   ├── Account.test.ts
    │   ├── Color.test.ts
    │   ├── Coords.test.ts
    │   ├── Data.test.ts
    │   ├── File.test.ts
    │   ├── Format.test.ts
    │   ├── General.test.ts
    │   ├── Geometry.test.ts
    │   ├── Layer.test.ts
    │   ├── Location.test.ts
    │   ├── Map.test.ts
    │   ├── Project.test.ts
    │   ├── Tile.test.ts
    │   ├── Zip.test.ts
    │   └── db.test.ts
    └── db.ts

32 directories, 327 files
