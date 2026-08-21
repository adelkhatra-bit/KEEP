import React from 'react';
import { StatusBar } from 'expo-status-bar';
import Navigation from './src/navigation/Navigation';

export default function App() {
  return (
    <>
      <Navigation />
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
    </>
  );
}
