import React, { ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { COLOR } from '../../constants/AppConstants';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface BottomSheetHeaderProps {
  title: string;
  onBack?: () => void;
  showBackButton?: boolean;
  rightComponent?: ReactNode;
  leftComponent?: ReactNode;
  centerComponent?: ReactNode;
}

export function BottomSheetHeader({
  title,
  onBack,
  showBackButton = false,
  rightComponent,
  leftComponent,
  centerComponent,
}: BottomSheetHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.leftContainer}>
        {leftComponent ? (
          leftComponent
        ) : showBackButton && onBack ? (
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <MaterialCommunityIcons name="chevron-left" size={28} color={COLOR.BLACK} />
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={styles.centerContainer}>
        {centerComponent ? centerComponent : <Text style={styles.title} numberOfLines={1}>{title}</Text>}
      </View>
      <View style={styles.rightContainer}>{rightComponent}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 50,
    backgroundColor: COLOR.MAIN,
    borderBottomWidth: 1,
    borderBottomColor: COLOR.GRAY1,
    paddingHorizontal: 10,
  },
  leftContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  centerContainer: {
    flex: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rightContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  backButton: {
    padding: 5,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: COLOR.BLACK,
  },
});
