import React, { useState, useEffect, useCallback } from 'react';
import {
  View, StyleSheet, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from './src/constants/colors';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import { supabase, isPasswordRecoveryUrl } from './src/lib/supabase';
import { Tab } from './src/types';
import { useAppointments } from './src/hooks/useAppointments';
import { useProfile } from './src/hooks/useProfile';
import { usePlayers } from './src/hooks/usePlayers';
import { useTrainerSchedules } from './src/hooks/useTrainerSchedules';
import { PlayerSwitcher } from './src/components/PlayerSwitcher';
import { LoginScreen } from './src/screens/LoginScreen';
import { ResetPasswordScreen } from './src/screens/ResetPasswordScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { TermineScreen } from './src/screens/TermineScreen';
import { BuchenScreen } from './src/screens/BuchenScreen';
import { ProfilScreen } from './src/screens/ProfilScreen';
import { InfosScreen } from './src/screens/InfosScreen';
import { BottomNav } from './src/components/BottomNav';
import { AdminApp } from './src/admin/AdminApp';
import { TrainerApp } from './src/trainer/TrainerApp';

const isWeb = Platform.OS === 'web';

function getAppStyles(C: Colors) {
  return StyleSheet.create({
    adminRoot: {
      flex: 1,
      backgroundColor: '#F4F6F9',
    },
    nativeRoot: {
      flex: 1,
      backgroundColor: C.bgTop,
    },
    loadingWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    gradient: {
      flex: 1,
    },
    screens: {
      flex: 1,
    },
    webOuter: {
      flex: 1,
      backgroundColor: '#C8D8EE',
      alignItems: 'center',
      justifyContent: 'center',
      // @ts-ignore web-only
      minHeight: '100vh',
    },
    webInner: {
      width: 430,
      flex: 1,
      overflow: 'hidden',
      // @ts-ignore web-only
      maxHeight: '100vh',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 40 },
      shadowOpacity: 0.35,
      shadowRadius: 60,
    },
  });
}

function AppInner() {
  const { C, isDark } = useTheme();
  const styles = React.useMemo(() => getAppStyles(C), [C]);

  const [loggedIn, setLoggedIn] = useState(false);
  const [role, setRole] = useState<'admin' | 'customer' | 'trainer' | null>(null);
  // Init aus der URL (synchron beim Modul-Load erfasst), damit ein Recovery-Link
  // nicht wegen verpasstem PASSWORD_RECOVERY-Event als normaler Login durchrutscht.
  const [passwordRecovery, setPasswordRecovery] = useState(isPasswordRecoveryUrl);
  const [tab, setTab] = useState<Tab>('home');
  const { profile } = useProfile();
  const { players, activePlayer, activePlayerId, setActivePlayer } = usePlayers();
  const { slotCounts, slotPlayers, myAppointments, activeTokens, addAppointment, cancelAppointment, refreshSlotData } = useAppointments(activePlayer);
  const { trainerSchedules, trainers: trainerProfiles } = useTrainerSchedules();

  const switcher = (
    <PlayerSwitcher players={players} activePlayerId={activePlayerId} onSelect={setActivePlayer} />
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setLoggedIn(!!session);
      if (session) fetchRole(session.user.id);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecovery(true);
        setLoggedIn(true);
        if (session) fetchRole(session.user.id);
        return;
      }
      setLoggedIn(!!session);
      if (session) fetchRole(session.user.id);
      else { setRole(null); setPasswordRecovery(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  const fetchRole = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('role').eq('id', userId).single();
    setRole((data?.role as 'admin' | 'customer' | 'trainer') ?? 'customer');
  };

  const doLogout = useCallback(async () => {
    await supabase.auth.signOut();
    setTab('home');
  }, []);

  if (passwordRecovery) {
    const recoveryContent = (
      <LinearGradient colors={[C.bgTop, C.bgBot]} style={styles.gradient} start={{ x: 0.15, y: 0 }} end={{ x: 0.85, y: 1 }}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <ResetPasswordScreen onDone={() => setPasswordRecovery(false)} />
      </LinearGradient>
    );
    return (
      <SafeAreaProvider>
        {isWeb ? (
          <View style={styles.webOuter}><View style={styles.webInner}>{recoveryContent}</View></View>
        ) : (
          <View style={styles.nativeRoot}>{recoveryContent}</View>
        )}
      </SafeAreaProvider>
    );
  }

  if (loggedIn && role === 'admin') {
    return (
      <SafeAreaProvider>
        <View style={styles.adminRoot}>
          <AdminApp onLogout={doLogout} />
        </View>
      </SafeAreaProvider>
    );
  }

  if (loggedIn && role === 'trainer') {
    return (
      <SafeAreaProvider>
        <View style={styles.adminRoot}>
          <TrainerApp onLogout={doLogout} />
        </View>
      </SafeAreaProvider>
    );
  }

  const appContent = (
    <LinearGradient
      colors={[C.bgTop, C.bgBot]}
      style={styles.gradient}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.85, y: 1 }}
    >
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {!loggedIn ? (
        <LoginScreen onLogin={() => {}} />
      ) : role === null ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      ) : (
        <>
          <View style={styles.screens}>
            {tab === 'home' && (
              <HomeScreen
                appointments={myAppointments}
                player={activePlayer}
                activeTokens={activeTokens}
                setTab={setTab}
                header={switcher}
              />
            )}
            {tab === 'termine' && (
              <TermineScreen
                appointments={myAppointments}
                cancelAppointment={cancelAppointment}
                activeTokens={activeTokens}
                setTab={setTab}
                header={switcher}
              />
            )}
            {tab === 'buchen' && (
              <BuchenScreen
                key="buchen"
                slotCounts={slotCounts}
                slotPlayers={slotPlayers}
                myAppointments={myAppointments}
                activeTokens={activeTokens}
                player={activePlayer}
                addAppointment={(d, t, p) => addAppointment(d, t, p)}
                setTab={setTab}
                trainerSchedules={trainerSchedules}
                trainers={trainerProfiles}
                refreshSlotData={refreshSlotData}
                header={switcher}
              />
            )}
            {tab === 'infos' && (
              <InfosScreen player={activePlayer} />
            )}
            {tab === 'profil' && (
              <ProfilScreen onLogout={doLogout} players={players} />
            )}
          </View>
          <BottomNav tab={tab} setTab={setTab} />
        </>
      )}
    </LinearGradient>
  );

  if (isWeb) {
    return (
      <SafeAreaProvider>
        <View style={styles.webOuter}>
          <View style={styles.webInner}>
            {appContent}
          </View>
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <View style={styles.nativeRoot}>
        {appContent}
      </View>
    </SafeAreaProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  );
}
