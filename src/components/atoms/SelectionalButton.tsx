import React, { useState } from 'react';
import { View } from 'react-native';

interface Props {
  openDisabled?: boolean;
  selectedButton: string;
  directionRow: 'column' | 'row';
  children: any;
}

const SelectionalButton = React.memo((props: Props) => {
  const [isButtonOpen, setButtonOpen] = useState(false);
  const { openDisabled, selectedButton, directionRow } = props;

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
            });

            return (
              <View
                key={index}
                style={{
                  marginTop: directionRow === 'column' ? 5 : 0,
                  marginRight: directionRow === 'row' ? 5 : 0,
                  alignItems: 'flex-end',
                }}
              >
                {newitem}
              </View>
            );
          })
        : React.Children.map(props.children, (item, index) => {
            if (item === null) return null;
            const newitem = React.cloneElement(item, {
              onPress: () => {
                if (openDisabled) {
                  item.props.onPressCustom();
                } else {
                  setButtonOpen(true);
                }
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
