import React from 'react';
import { MaterialCommunityIcons as ExpoMaterialCommunityIcons } from '@expo/vector-icons';

export function MaterialCommunityIcons({ style, ...props }) {
  return <ExpoMaterialCommunityIcons {...props} style={style} />;
}
