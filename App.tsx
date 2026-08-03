import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from './src/constants/colors';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import { supabase, isPasswordRecoveryUrl } from './src/lib/supabase';
import { Tab } from './src/types';
import { useAppointments } from './src/hooks/useAppointments';
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
    roleErrorText: {
      fontSize: 15,
      fontWeight: '600',
      color: C.textMid,
      marginBottom: 10,
    },
    roleErrorRetry: {
      fontSize: 15,
      fontWeight: '700',
      color: C.accent,
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
  // Erst nach getSession() rendern wir Login oder App — verhindert den
  // LoginScreen-Flash für Nutzer mit gültiger Session beim Kaltstart.
  const [sessionChecked, setSessionChecked] = useState(false);
  const [role, setRole] = useState<'admin' | 'customer' | 'trainer' | null>(null);
  const [roleError, setRoleError] = useState(false);
  const userIdRef = useRef<string | null>(null);
  // Init aus der URL (synchron beim Modul-Load erfasst), damit ein Recovery-Link
  // nicht wegen verpasstem PASSWORD_RECOVERY-Event als normaler Login durchrutscht.
  const [passwordRecovery, setPasswordRecovery] = useState(isPasswordRecoveryUrl);
  const [tab, setTab] = useState<Tab>('home');
  const { players, activePlayer, activePlayerId, setActivePlayer, loading: playersLoading } = usePlayers();
  const { slotCounts, slotPlayers, myAppointments, activeTokens, addAppointment, cancelAppointment, refreshSlotData, refetch, loading: apptsLoading } = useAppointments(activePlayer);
  // Initial-Load der Kundendaten: solange keine leeren Zustände zeigen.
  const dataLoading = playersLoading || apptsLoading;
  const { trainerSchedules, trainers: trainerProfiles } = useTrainerSchedules();

  const switcher = (
    <PlayerSwitcher players={players} activePlayerId={activePlayerId} onSelect={setActivePlayer} />
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setLoggedIn(!!session);
      setSessionChecked(true);
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
    userIdRef.current = userId;
    setRoleError(false);
    const { data, error } = await supabase.from('profiles').select('role').eq('id', userId).single();
    // 'PGRST116' = keine Zeile gefunden → legitimer Default 'customer'.
    // Alle anderen Fehler (Netzwerk etc.) dürfen einen Admin nicht stumm
    // in die Kunden-App schicken — stattdessen Retry anbieten.
    if (error && error.code !== 'PGRST116') {
      setRole(null);
      setRoleError(true);
      return;
    }
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

      {!sessionChecked ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      ) : !loggedIn ? (
        <LoginScreen onLogin={() => {}} />
      ) : roleError ? (
        <View style={styles.loadingWrap}>
          <Text style={styles.roleErrorText}>Verbindung fehlgeschlagen.</Text>
          <Text
            style={styles.roleErrorRetry}
            onPress={() => { if (userIdRef.current) fetchRole(userIdRef.current); }}
          >
            Erneut versuchen
          </Text>
        </View>
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
                loading={dataLoading}
                onRefresh={refetch}
              />
            )}
            {tab === 'termine' && (
              <TermineScreen
                appointments={myAppointments}
                cancelAppointment={cancelAppointment}
                activeTokens={activeTokens}
                setTab={setTab}
                header={switcher}
                loading={dataLoading}
                onRefresh={refetch}
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
                loading={dataLoading}
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
