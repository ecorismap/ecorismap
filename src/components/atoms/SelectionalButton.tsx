import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';

interface Props {
  selectedButton: string;
  direction: 'topToDown' | 'bottomToUp' | 'leftToRight';
  children: any;
}

const SelectionalButton = React.memo((props: Props) => {
  const [isButtonOpen, setButtonOpen] = useState(false);
  const { selectedButton, direction } = props;

  const styles = StyleSheet.create({
    button: {
      alignItems: 'flex-end',
      marginBottom: direction === 'topToDown' ? 5 : 0,
      marginRight: direction === 'leftToRight' ? 5 : 0,
      marginTop: direction === 'topToDown' ? 0 : 5,
    },
  });

  return (
    <View style={{ flexDirection: direction === 'leftToRight' ? 'row' : 'column' }}>
      {isButtonOpen
        ? React.Children.map(props.children, (item, index) => {
            if (item === null) return null;
            const newitem = React.cloneElement(item, {
              onPress: () => {
                setButtonOpen(false);
                if (typeof item.props.onPressCustom === 'function') {
                  item.props.onPressCustom();
                }
              },
            });

            return (
              <View key={index} style={styles.button}>
                {newitem}
              </View>
            );
          })
        : React.Children.map(props.children, (item, index) => {
            if (item === null) return null;
            const newitem = React.cloneElement(item, {
              onPress: () => {
                setButtonOpen(true);
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
