// ============================================================
// BKNR ERP — App Navigator
// All screens registered here
// ============================================================
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';

// Auth
import LoginScreen from '../screens/LoginScreen';

// Dashboard
import HomeScreen from '../screens/HomeScreen';

// WebView (for all non-native modules)
import WebViewScreen from '../screens/WebViewScreen';

// Operations
import GateEntryScreen   from '../screens/operations/GateEntryScreen';
import RMPScreen         from '../screens/operations/RMPScreen';
import DeheadingScreen   from '../screens/operations/DeheadingScreen';
import GradingScreen     from '../screens/operations/GradingScreen';
import PeelingScreen     from '../screens/operations/PeelingScreen';
import SoakingScreen     from '../screens/operations/SoakingScreen';
import ProductionScreen  from '../screens/operations/ProductionScreen';

// Inventory & HR
import StockEntryScreen  from '../screens/StockEntryScreen';
import AttendanceScreen  from '../screens/AttendanceScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const { user } = useAuth();

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        {!user ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          <>
            {/* Dashboard */}
            <Stack.Screen name="Home"        component={HomeScreen} />

            {/* WebView — for all non-native modules */}
            <Stack.Screen name="WebView"     component={WebViewScreen} />

            {/* Operations */}
            <Stack.Screen name="GateEntry"   component={GateEntryScreen} />
            <Stack.Screen name="RMP"         component={RMPScreen} />
            <Stack.Screen name="Deheading"   component={DeheadingScreen} />
            <Stack.Screen name="Grading"     component={GradingScreen} />
            <Stack.Screen name="Peeling"     component={PeelingScreen} />
            <Stack.Screen name="Soaking"     component={SoakingScreen} />
            <Stack.Screen name="Production"  component={ProductionScreen} />

            {/* Inventory & HR */}
            <Stack.Screen name="StockEntry"  component={StockEntryScreen} />
            <Stack.Screen name="Attendance"  component={AttendanceScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
