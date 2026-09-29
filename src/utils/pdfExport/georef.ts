import { toPDFCoordinate, toPoint } from '../General';
import { getBoundingBox, PageLayout } from './geometry';

/**
 * QGIS等で出力PDFを重ねるためのVRT（Web版向け。モバイルはGeoPDFに埋め込む）。
 * PointからPDFCoordinateに変換しないと出力されたPDFと値がずれてQGISでエラーになる。
 * roundではなくfloorにしないとWebの出力と値がずれてQGISでエラーになる。
 * gdalinfoの出力と計算したXSize,YSizeが異なるとQGISでエラーになる（出力サイズはOSによって微妙に異なる）
 */
export const generateVRT = (layout: PageLayout, fileName: string) => {
  const { minX, minY, maxX, maxY } = getBoundingBox(layout.region);
  const { paper, margin } = layout;
  const leftPDFCoordinate = toPDFCoordinate(margin.millimeter);
  const rightPDFCoordinate = toPDFCoordinate(paper.widthMillimeter - margin.millimeter);
  const topPDFCoordinate = toPDFCoordinate(margin.millimeter);
  const bottomPDFCoordinate = toPDFCoordinate(paper.heightMillimeter - margin.millimeter);
  const XSize = Math.floor((paper.widthPoint * 150) / 72);
  const YSize = Math.floor((paper.heightPoint * 150) / 72);

  return `
    <VRTDataset rasterXSize="${XSize}" rasterYSize="${YSize}">
      <Metadata>
      </Metadata>
      <GCPList Projection="PROJCS[&quot;WGS 84 / Pseudo-Mercator&quot;,GEOGCS[&quot;WGS 84&quot;,DATUM[&quot;WGS_1984&quot;,SPHEROID[&quot;WGS 84&quot;,6378137,298.257223563,AUTHORITY[&quot;EPSG&quot;,&quot;7030&quot;]],AUTHORITY[&quot;EPSG&quot;,&quot;6326&quot;]],PRIMEM[&quot;Greenwich&quot;,0,AUTHORITY[&quot;EPSG&quot;,&quot;8901&quot;]],UNIT[&quot;degree&quot;,0.0174532925199433,AUTHORITY[&quot;EPSG&quot;,&quot;9122&quot;]],AUTHORITY[&quot;EPSG&quot;,&quot;4326&quot;]],PROJECTION[&quot;Mercator_1SP&quot;],PARAMETER[&quot;central_meridian&quot;,0],PARAMETER[&quot;scale_factor&quot;,1],PARAMETER[&quot;false_easting&quot;,0],PARAMETER[&quot;false_northing&quot;,0],UNIT[&quot;metre&quot;,1,AUTHORITY[&quot;EPSG&quot;,&quot;9001&quot;]],AXIS[&quot;Easting&quot;,EAST],AXIS[&quot;Northing&quot;,NORTH],EXTENSION[&quot;PROJ4&quot;,&quot;+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs&quot;],AUTHORITY[&quot;EPSG&quot;,&quot;3857&quot;]]" dataAxisToSRSAxisMapping="1,2">
        <GCP Id="" Pixel="${leftPDFCoordinate}" Line="${topPDFCoordinate}" X="${minX}" Y="${maxY}" />
        <GCP Id="" Pixel="${rightPDFCoordinate}" Line="${topPDFCoordinate}" X="${maxX}" Y="${maxY}" />
        <GCP Id="" Pixel="${leftPDFCoordinate}" Line="${bottomPDFCoordinate}" X="${minX}" Y="${minY}" />
        <GCP Id="" Pixel="${rightPDFCoordinate}" Line="${bottomPDFCoordinate}" X="${maxX}" Y="${minY}" />
      </GCPList>
      <VRTRasterBand dataType="Byte" band="1" blockYSize="1">
        <ColorInterp>Red</ColorInterp>
        <SimpleSource>
          <SourceFilename relativeToVRT="1">${fileName}</SourceFilename>
          <SourceBand>1</SourceBand>
          <SourceProperties RasterXSize="${XSize}" RasterYSize="${YSize}" DataType="Byte" BlockXSize="${XSize}" BlockYSize="1" />
          <SrcRect xOff="0" yOff="0" xSize="${XSize}" ySize="${YSize}" />
          <DstRect xOff="0" yOff="0" xSize="${XSize}" ySize="${YSize}" />
        </SimpleSource>
      </VRTRasterBand>
      <VRTRasterBand dataType="Byte" band="2" blockYSize="1">
        <ColorInterp>Green</ColorInterp>
        <SimpleSource>
          <SourceFilename relativeToVRT="1">${fileName}</SourceFilename>
          <SourceBand>2</SourceBand>
          <SourceProperties RasterXSize="${XSize}" RasterYSize="${YSize}" DataType="Byte" BlockXSize="${XSize}" BlockYSize="1" />
          <SrcRect xOff="0" yOff="0" xSize="${XSize}" ySize="${YSize}" />
          <DstRect xOff="0" yOff="0" xSize="${XSize}" ySize="${YSize}" />
        </SimpleSource>
      </VRTRasterBand>
      <VRTRasterBand dataType="Byte" band="3" blockYSize="1">
        <ColorInterp>Blue</ColorInterp>
        <SimpleSource>
          <SourceFilename relativeToVRT="1">${fileName}</SourceFilename>
          <SourceBand>3</SourceBand>
          <SourceProperties RasterXSize="${XSize}" RasterYSize="${YSize}" DataType="Byte" BlockXSize="${XSize}" BlockYSize="1" />
          <SrcRect xOff="0" yOff="0" xSize="${XSize}" ySize="${YSize}" />
          <DstRect xOff="0" yOff="0" xSize="${XSize}" ySize="${YSize}" />
        </SimpleSource>
      </VRTRasterBand>
    </VRTDataset>
  `;
};

//gdal_create用のPDFComposition。モバイルでexpo-printのPDFをGeoPDFにする
export const generateCompositionXML = (layout: PageLayout, pdfPath: string) => {
  const { minX, minY, maxX, maxY } = getBoundingBox(layout.region);
  const { paper, margin } = layout;
  const leftPoint = toPoint(margin.millimeter);
  const rightPoint = toPoint(paper.widthMillimeter - margin.millimeter);
  const topPoint = toPoint(margin.millimeter);
  const bottomPoint = toPoint(paper.heightMillimeter - margin.millimeter);

  return `
    <PDFComposition>
      <Metadata>
          <Author>EcorisMap</Author>
      </Metadata>
      <Page id="page_1">
          <DPI>300</DPI>
          <Width>${paper.widthPoint}</Width>
          <Height>${paper.heightPoint}</Height>
          <Georeferencing id="georeferenced">
            <SRS dataAxisToSRSAxisMapping="2,1">EPSG:3857</SRS>
            <ControlPoint x="${leftPoint}"  y="${bottomPoint}"  GeoY="${maxY}"  GeoX="${minX}"/>
            <ControlPoint x="${rightPoint}"  y="${bottomPoint}"  GeoY="${maxY}"  GeoX="${maxX}"/>
            <ControlPoint x="${leftPoint}"  y="${topPoint}"  GeoY="${minY}"  GeoX="${minX}"/>
            <ControlPoint x="${rightPoint}"  y="${topPoint}"  GeoY="${minY}"  GeoX="${maxX}"/>
          </Georeferencing>
          <Content>
            <PDF dataset="${pdfPath}">
              <Blending function="Normal" opacity="1"/>
            </PDF>
          </Content>
      </Page> 
    </PDFComposition>
  `;
};
