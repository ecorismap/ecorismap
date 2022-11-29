import React from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity } from 'react-native';
import { RectButton } from '../atoms';
import { COLOR } from '../../constants/AppConstants';
import { PhotoType } from '../../types';

interface Props {
  fieldName: string;
  takePhoto: () => void;
  pickImage: () => void;
  photos: PhotoType[];
  showPhoto: (fieldName: string, photo: PhotoType, index: number) => void;
}
export const DataEditPhoto = (props: Props) => {
  const { fieldName, takePhoto, pickImage, photos, showPhoto } = props;
  //console.log('####', photos);

  return (
    <>
      <View style={styles.tr}>
        <View style={styles.td}>
          <View style={styles.tr2}>
            <Text style={styles.title}>{fieldName}</Text>
          </View>
          <View style={styles.button}>
            <RectButton name="camera" onPress={takePhoto} />
          </View>
          <View style={styles.button}>
            <RectButton name="file-image" onPress={pickImage} />
          </View>
        </View>
      </View>
      <ScrollView horizontal={true} style={{ borderBottomWidth: 1, borderColor: COLOR.GRAY2 }}>
        {photos.map(
          (photo, index) =>
            photo.uri !== undefined && (
              <TouchableOpacity style={{ margin: 2 }} key={index} onPress={() => showPhoto(fieldName, photo, index)}>
                <Image
                  source={{ uri: photo.thumbnail ? photo.thumbnail : undefined }}
                  style={{
                    width: photo.width > photo.height ? 200 : (150 * 3) / 4,
                    height: photo.width > photo.height ? 150 : 150,
                    resizeMode: 'contain',
                  }}
                />
              </TouchableOpacity>
            )
        )}
      </ScrollView>
    </>
  );
};

const styles = StyleSheet.create({
  button: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    margin: 5,
  },
  td: {
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: COLOR.GRAY2,
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 0,
  },

  title: {
    color: COLOR.GRAY3,
    flex: 1,
    fontSize: 12,
  },

  tr: {
    flexDirection: 'row',
    height: 60,
  },

  tr2: {
    flex: 1,
    flexDirection: 'column',
    margin: 5,
  },
});
