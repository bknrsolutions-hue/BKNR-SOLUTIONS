import React from 'react';
import { StatusBar } from 'react-native';
import WebViewScreen from './src/screens/WebViewScreen';

export default function App() {
  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#060913" />
      <WebViewScreen />
    </>
  );
}
