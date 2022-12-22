import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';

interface Props {
  openDisabled?: boolean;
  selectedButton: string;
  directionRow: 'column' | 'row';
  children: any;
  isPositionRight?: boolean;
}

const SelectionalButton = React.memo((props: Props) => {
  const [isButtonOpen, setButtonOpen] = useState(false);
  const { openDisabled, selectedButton, directionRow, isPositionRight } = props;

  const styles = StyleSheet.create({
    button: {
      alignItems: 'flex-end',
      marginRight: directionRow === 'row' ? 5 : 0,
      marginTop: directionRow === 'column' ? 5 : 0,
    },
    buttonLandscape: {
      alignItems: 'flex-end',
      marginLeft: directionRow === 'row' ? 5 : 0,
      marginTop: directionRow === 'column' ? 5 : 0,
    },
  });

  return (
    <View style={{ flexDirection: directionRow }}>
      {isButtonOpen
        ? React.Children.map(props.children, (item, index) => {
            if (item === null) return null;
            const newitem = React.cloneElement(item, {
              onPress: () => {
                setButtonOpen(false);
                item.props.onPressCustom();
              },
              onLongPress: () => {},
            });

            return (
              <View key={index} style={isPositionRight ? styles.buttonLandscape : styles.button}>
                {newitem}
              </View>
            );
          })
        : React.Children.map(props.children, (item, index) => {
            if (item === null) return null;
            const newitem = React.cloneElement(item, {
              onLongPress: () => {
                if (openDisabled) {
                  item.props.onPressCustom();
                } else {
                  setButtonOpen(true);
                }
              },
              onPress: () => {
                item.props.onPressCustom();
              },
            });
            return item.props.id === selectedButton ? (
              <View key={index} style={{ marginTop: 0 }}>
                {newitem}
              </View>
            ) : null;
          })}
    </View>
  );
});

export default SelectionalButton;
