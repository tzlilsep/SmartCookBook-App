// src/features/home/ui/HomeScreen.tsx
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HomeProps } from '../model/home.types';
import { HomeHeader } from './HomeHeader';
import { HomeGrid } from './HomeGrid';

export function HomeScreen({ username, onNavigate, onLogout }: HomeProps) {
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <View style={styles.container}>
        <HomeHeader username={username} onLogout={onLogout} />
        <HomeGrid onNavigate={onNavigate} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#EEF2FF',
  },
  container: {
    width: '100%',
    maxWidth: 960,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 8, 
  },
});
