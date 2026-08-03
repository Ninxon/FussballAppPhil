import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Animated, Easing, KeyboardAvoidingView, Platform, ScrollView, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { useTheme } from '../contexts/ThemeContext';
import { supabase, setRememberMe } from '../lib/supabase';

interface Props {
  onLogin: () => void;
}

function getStyles(C: Colors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    scroll: {
      flexGrow: 1,
      paddingHorizontal: 24,
    },
    brand: {
      alignItems: 'center',
      marginBottom: 40,
    },
    logoBadge: {
      width: 120,
      height: 120,
      borderRadius: 26,
      marginBottom: 20,
      shadowColor: '#152238',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.15,
      shadowRadius: 20,
      elevation: 8,
    },
    studioName: {
      fontSize: 26,
      fontWeight: '800',
      color: C.text,
      letterSpacing: -0.5,
    },
    studioCity: {
      fontSize: 14,
      color: C.textFaint,
      marginTop: 5,
      letterSpacing: 0.1,
    },
    formCard: {
      backgroundColor: C.card,
      borderRadius: 24,
      padding: 28,
      marginBottom: 16,
      shadowColor: '#152238',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.10,
      shadowRadius: 24,
      elevation: 7,
      borderWidth: 1,
      borderColor: C.cardBorder,
    },
    formTitle: {
      fontSize: 22,
      fontWeight: '800',
      color: C.text,
      marginBottom: 4,
      letterSpacing: -0.3,
    },
    formSub: {
      fontSize: 14,
      color: C.textFaint,
      marginBottom: 28,
      lineHeight: 20,
    },
    fieldWrap: {
      marginBottom: 18,
    },
    fieldLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: C.textMid,
      marginBottom: 8,
      letterSpacing: 0.02,
    },
    input: {
      height: 52,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: C.cardBorder,
      backgroundColor: C.accentBg,
      color: C.text,
      fontSize: 16,
      paddingHorizontal: 16,
    },
    inputErr: {
      borderColor: C.red,
      backgroundColor: C.redBg,
    },
    pwWrap: {
      position: 'relative',
      justifyContent: 'center',
    },
    pwInput: {
      paddingRight: 52,
    },
    pwToggle: {
      position: 'absolute',
      right: 0,
      top: 0,
      bottom: 0,
      width: 52,
      alignItems: 'center',
      justifyContent: 'center',
    },
    errText: {
      fontSize: 13,
      color: C.red,
      fontWeight: '600',
      marginBottom: 16,
    },
    successText: {
      fontSize: 13,
      color: C.accent,
      fontWeight: '600',
      marginBottom: 16,
      lineHeight: 20,
    },
    rememberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 24,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: C.cardBorder,
      backgroundColor: C.accentBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxActive: {
      backgroundColor: C.accent,
      borderColor: C.accent,
    },
    checkmark: {
      color: '#fff',
      fontSize: 13,
      fontWeight: '800',
    },
    rememberLabel: {
      fontSize: 14,
      color: C.textMid,
      fontWeight: '500',
    },
    loginBtn: {
      height: 56,
      borderRadius: 16,
      backgroundColor: C.accent,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 10,
      shadowColor: C.accent,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.26,
      shadowRadius: 14,
      elevation: 7,
    },
    loginBtnLabel: {
      color: '#fff',
      fontSize: 17,
      fontWeight: '800',
      letterSpacing: 0.1,
    },
    loginBtnArrow: {
      color: 'rgba(255,255,255,0.65)',
      fontSize: 22,
    },
    forgotBtn: {
      alignItems: 'center',
      paddingVertical: 10,
      marginBottom: 16,
    },
    forgotLabel: {
      fontSize: 14,
      color: C.textFaint,
      fontWeight: '500',
    },
    backBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 20,
    },
    backLabel: {
      fontSize: 14,
      color: C.accent,
      fontWeight: '600',
    },
    // PWA Install Button (Android / Desktop Chrome)
    installBtn: {
      height: 52,
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: C.accent,
      backgroundColor: C.accentBg,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
      marginBottom: 16,
    },
    installBtnLabel: {
      fontSize: 15,
      fontWeight: '700',
      color: C.accent,
      letterSpacing: 0.1,
    },
    installBtnIcon: {
      fontSize: 16,
      color: C.accent,
    },
    // iOS Hint Card
    iosHintCard: {
      backgroundColor: C.accentBg,
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: C.cardBorder,
      padding: 16,
      marginBottom: 16,
      gap: 4,
    },
    iosHintTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: C.textMid,
    },
    iosHintText: {
      fontSize: 13,
      color: C.textFaint,
      lineHeight: 18,
    },
    decorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 16,
    },
    decorLine: {
      flex: 1,
      height: 1,
      backgroundColor: C.cardBorder,
    },
    decorText: {
      fontSize: 11,
      color: C.textFaint,
      fontWeight: '500',
      letterSpacing: 0.3,
    },
  });
}

export function LoginScreen({ onLogin }: Props) {
  const { C } = useTheme();
  const styles = React.useMemo(() => getStyles(C), [C]);
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMeState] = useState(false);

  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotErr, setForgotErr] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  // PWA install state (web only)
  const installPromptRef = useRef<any>(null);
  const [installPromptReady, setInstallPromptReady] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    // Prompt wurde möglicherweise bereits vor React-Mount gefangen (web/index.html)
    if ((window as any)._pwaInstallPrompt) {
      installPromptRef.current = (window as any)._pwaInstallPrompt;
      setInstallPromptReady(true);
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      installPromptRef.current = e;
      setInstallPromptReady(true);
    };
    const onInstalled = () => setInstallPromptReady(false);

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);

    // iOS: Hinweis wenn Safari und noch nicht als App installiert
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isStandalone = (window.navigator as any).standalone === true;
    if (isIos && !isStandalone) setShowIosHint(true);

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const doLogin = async () => {
    if (!email.includes('@')) { setErr('Bitte eine gültige E-Mail-Adresse eingeben.'); return; }
    if (pw.length < 6) { setErr('Passwort muss mindestens 6 Zeichen lang sein.'); return; }
    setErr('');
    setLoading(true);
    setRememberMe(rememberMe);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    setLoading(false);
    if (error) {
      setErr('E-Mail oder Passwort falsch.');
    } else {
      onLogin();
    }
  };

  const doForgotPassword = async () => {
    if (!forgotEmail.includes('@')) { setForgotErr('Bitte eine gültige E-Mail-Adresse eingeben.'); return; }
    setForgotErr('');
    setForgotLoading(true);
    const redirectTo =
      process.env.EXPO_PUBLIC_SITE_URL
      ?? (Platform.OS === 'web' && typeof window !== 'undefined'
          ? window.location.origin
          : undefined);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, { redirectTo });
    setForgotLoading(false);
    if (error) {
      setForgotErr('Fehler beim Senden. Bitte versuche es erneut.');
    } else {
      setForgotSent(true);
    }
  };

  const doInstall = async () => {
    if (!installPromptRef.current) return;
    installPromptRef.current.prompt();
    await installPromptRef.current.userChoice;
    installPromptRef.current = null;
    setInstallPromptReady(false);
  };

  const emailErr = !!err && !email.includes('@');
  const pwErr = !!err && pw.length < 6;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 44, paddingBottom: 40 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

          {/* Brand Header */}
          <View style={styles.brand}>
            <Image
              source={require('../../assets/icon.png')}
              style={styles.logoBadge}
              resizeMode="contain"
            />
            <Text style={styles.studioName}>PK-Fussballschule</Text>
            <Text style={styles.studioCity}>Rhein-Main</Text>
          </View>

          {/* Form Card */}
          <View style={styles.formCard}>
            {forgotMode ? (
              <>
                <TouchableOpacity style={styles.backBtn} onPress={() => { setForgotMode(false); setForgotSent(false); setForgotErr(''); setForgotEmail(''); }}>
                  <Text style={styles.backLabel}>← Zurück</Text>
                </TouchableOpacity>
                <Text style={styles.formTitle}>Passwort zurücksetzen</Text>
                <Text style={styles.formSub}>Gib deine E-Mail-Adresse ein. Du bekommst einen Link zum Zurücksetzen.</Text>

                {!forgotSent ? (
                  <>
                    <View style={styles.fieldWrap}>
                      <Text style={styles.fieldLabel}>E-Mail-Adresse</Text>
                      <TextInput
                        style={[styles.input, !!forgotErr && styles.inputErr]}
                        value={forgotEmail}
                        onChangeText={v => { setForgotEmail(v); setForgotErr(''); }}
                        placeholder="anna@beispiel.de"
                        placeholderTextColor={C.textFaint}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                    </View>
                    {!!forgotErr && <Text style={styles.errText}>{forgotErr}</Text>}
                    <TouchableOpacity
                      onPress={doForgotPassword}
                      disabled={forgotLoading}
                      activeOpacity={0.88}
                      style={[styles.loginBtn, forgotLoading && { opacity: 0.7 }]}
                    >
                      <Text style={styles.loginBtnLabel}>
                        {forgotLoading ? 'Wird gesendet…' : 'Reset-Link senden'}
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <Text style={styles.successText}>
                    E-Mail gesendet! Prüfe dein Postfach und klicke auf den Link, um ein neues Passwort festzulegen.
                  </Text>
                )}
              </>
            ) : (
              <>
                <Text style={styles.formTitle}>Willkommen zurück</Text>
                <Text style={styles.formSub}>Melde dich an, um deine Termine zu verwalten.</Text>

                <View style={styles.fieldWrap}>
                  <Text style={styles.fieldLabel}>E-Mail-Adresse</Text>
                  <TextInput
                    style={[styles.input, emailErr && styles.inputErr]}
                    value={email}
                    onChangeText={v => { setEmail(v); setErr(''); }}
                    placeholder="anna@beispiel.de"
                    placeholderTextColor={C.textFaint}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                <View style={[styles.fieldWrap, { marginBottom: 18 }]}>
                  <Text style={styles.fieldLabel}>Passwort</Text>
                  <View style={styles.pwWrap}>
                    <TextInput
                      style={[styles.input, styles.pwInput, pwErr && styles.inputErr]}
                      value={pw}
                      onChangeText={v => { setPw(v); setErr(''); }}
                      placeholder="••••••••"
                      placeholderTextColor={C.textFaint}
                      secureTextEntry={!showPw}
                    />
                    <TouchableOpacity
                      style={styles.pwToggle}
                      onPress={() => setShowPw(v => !v)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={showPw ? 'Passwort verbergen' : 'Passwort anzeigen'}
                    >
                      <Feather name={showPw ? 'eye-off' : 'eye'} size={20} color={C.textFaint} />
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.rememberRow}
                  onPress={() => setRememberMeState(v => !v)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.checkbox, rememberMe && styles.checkboxActive]}>
                    {rememberMe && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={styles.rememberLabel}>Angemeldet bleiben (30 Tage)</Text>
                </TouchableOpacity>

                {!!err && <Text style={styles.errText}>{err}</Text>}

                <TouchableOpacity
                  onPress={doLogin}
                  disabled={loading}
                  activeOpacity={0.88}
                  style={[styles.loginBtn, loading && { opacity: 0.7 }]}
                >
                  <Text style={styles.loginBtnLabel}>
                    {loading ? 'Wird angemeldet…' : 'Anmelden'}
                  </Text>
                  {!loading && <Text style={styles.loginBtnArrow}>→</Text>}
                </TouchableOpacity>
              </>
            )}
          </View>

          {!forgotMode && (
            <TouchableOpacity style={styles.forgotBtn} onPress={() => setForgotMode(true)} activeOpacity={0.7}>
              <Text style={styles.forgotLabel}>Passwort vergessen?</Text>
            </TouchableOpacity>
          )}

          {/* PWA Install Button — Android / Desktop Chrome */}
          {installPromptReady && (
            <TouchableOpacity style={styles.installBtn} onPress={doInstall} activeOpacity={0.85}>
              <Text style={styles.installBtnIcon}>↓</Text>
              <Text style={styles.installBtnLabel}>App installieren</Text>
            </TouchableOpacity>
          )}

          {/* PWA iOS Hint */}
          {showIosHint && (
            <View style={styles.iosHintCard}>
              <Text style={styles.iosHintTitle}>App zum Home-Bildschirm hinzufügen</Text>
              <Text style={styles.iosHintText}>Tippe auf Teilen ↑ und dann auf „Zum Home-Bildschirm"</Text>
            </View>
          )}

          {/* Decorative footer */}
          <View style={styles.decorRow}>
            <View style={styles.decorLine} />
            <Text style={styles.decorText}>PK Fussballschule · Buchungs-App</Text>
            <View style={styles.decorLine} />
          </View>

        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
