import React, { useState } from 'react';
import { TextInput } from 'react-native';
import { C } from './theme';
import { s } from './styles';

interface Props {
  placeholder: string;
  children: (reason: string) => React.ReactNode;
}

// Storno-Grund mit LOKALEM State: Tippen rendert nur dieses Panel neu, nicht
// das komplette Wochen-/Tagesraster. Der aktuelle Text geht per Render-Prop
// an die Stornieren-Buttons; beim Schließen (Unmount) leert er sich von selbst.
export function CancelReasonSection({ placeholder, children }: Props) {
  const [reason, setReason] = useState('');
  return (
    <>
      <TextInput
        style={s.cancelReasonInput}
        value={reason}
        onChangeText={setReason}
        placeholder={placeholder}
        placeholderTextColor={C.textFaint}
        multiline
      />
      {children(reason)}
    </>
  );
}
