import { TextStyle } from 'react-native';

// Web-only: entfernt den Browser-Fokusrahmen von TextInputs.
// `outlineWidth` fehlt im React-Native-Typ — die Assertion lebt einmal hier
// statt als `as any` an jeder Verwendungsstelle.
export const webInputReset = { outlineWidth: 0 } as unknown as TextStyle;
