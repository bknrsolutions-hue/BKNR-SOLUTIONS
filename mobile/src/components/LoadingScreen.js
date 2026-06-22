import React from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';

export default function LoadingScreen({ message = 'Loading...' }) {
  return (
    <View style={styles.root}>
      <ActivityIndicator size="large" color="#3b82f6" />
      <Text style={styles.msg}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#060913',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  msg: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '600',
  },
});
