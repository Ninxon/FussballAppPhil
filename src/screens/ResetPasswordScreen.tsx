import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';

interface Props {
  onDone: () => void;
}

function getStyles(C: Colors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    scroll: { flexGrow: 1, paddingHorizontal: 24 },
    brand: { alignItems: 'center', marginBottom: 40 },
    logoBadge: {
      width: 88,
      height: 88,
      borderRadius: 26,
      backgroundColor: C.accent,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 20,
      shadowColor: C.accent,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.28,
      shadowRadius: 22,
      elevation: 10,
    },
    badgeMonogram: { fontSize: 28, fontWeight: '900', color: '#fff', letterSpacing: 1 },
    studioName: { fontSize: 26, fontWeight: '800', color: C.text, letterSpacing: -0.5 },
    studioCity: { fontSize: 14, color: C.textFaint, marginTop: 5 },
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
    formTitle: { fontSize: 22, fontWeight: '800', color: C.text, marginBottom: 4, letterSpacing: -0.3 },
    formSub: { fontSize: 14, color: C.textFaint, marginBottom: 28, lineHeight: 20 },
    fieldWrap: { marginBottom: 18 },
    fieldLabel: { fontSize: 13, fontWeight: '600', color: C.textMid, marginBottom: 8 },
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
    inputErr: { borderColor: C.red, backgroundColor: C.redBg },
    errText: { fontSize: 13, color: C.red, fontWeight: '600', marginBottom: 16 },
    successCard: {
      backgroundColor: C.accentBg,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: C.accent,
      padding: 16,
      alignItems: 'center',
      gap: 4,
    },
    successIcon: { fontSize: 28, marginBottom: 4 },
    successTitle: { fontSize: 16, fontWeight: '800', color: C.accent },
    successSub: { fontSize: 13, color: C.textMid, textAlign: 'center', lineHeight: 18 },
    saveBtn: {
      height: 56,
      borderRadius: 16,
      backgroundColor: C.accent,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: C.accent,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.26,
      shadowRadius: 14,
      elevation: 7,
    },
    saveBtnLabel: { color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: 0.1 },
    decorRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
    decorLine: { flex: 1, height: 1, backgroundColor: C.cardBorder },
    decorText: { fontSize: 11, color: C.textFaint, fontWeight: '500', letterSpacing: 0.3 },
  });
}

export function ResetPasswordScreen({ onDone }: Props) {
  const { C } = useTheme();
  const styles = React.useMemo(() => getStyles(C), [C]);
  const insets = useSafeAreaInsets();

  const [pw, setPw] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  // Der Screen wird (bewusst) schon angezeigt, sobald die URL ein Recovery ist —
  // die Recovery-Session baut detectSessionInUrl aber erst asynchron auf. Erst
  // wenn sie steht, darf updateUser laufen (sonst „Auth session missing").
  const [sessionReady, setSessionReady] = useState(false);
  const doneTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (doneTimer.current) clearTimeout(doneTimer.current);
  }, []);

  useEffect(() => {
    let mounted = true;
    let settled = false;
    const markReady = (session: unknown) => {
      if (mounted && session && !settled) { settled = true; setSessionReady(true); }
    };
    supabase.auth.getSession().then(({ data: { session } }) => markReady(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => markReady(session));
    // Kommt nach kurzer Zeit keine Session zustande, ist der Link ab-/verbraucht.
    const timer = setTimeout(() => {
      if (mounted && !settled) {
        setErr('Der Reset-Link ist abgelaufen oder wurde bereits verwendet. Bitte fordere einen neuen an.');
      }
    }, 8000);
    return () => { mounted = false; subscription.unsubscribe(); clearTimeout(timer); };
  }, []);

  const doReset = async () => {
    if (!sessionReady) { setErr('Der Link wird noch geprüft – bitte einen Moment warten.'); return; }
    if (pw.length < 6) { setErr('Passwort muss mindestens 6 Zeichen lang sein.'); return; }
    if (pw !== pwConfirm) { setErr('Passwörter stimmen nicht überein.'); return; }
    setErr('');
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setLoading(false);
    if (error) {
      setErr(
        /session|missing|expired|jwt|token/i.test(error.message)
          ? 'Der Reset-Link ist abgelaufen oder wurde bereits verwendet. Bitte fordere einen neuen an.'
          : `Fehler beim Speichern: ${error.message}`,
      );
    } else {
      setSuccess(true);
      doneTimer.current = setTimeout(() => onDone(), 1800);
    }
  };

  const pwErr = !!err && pw.length < 6;
  const confirmErr = !!err && pw !== pwConfirm;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 44, paddingBottom: 40 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brand}>
          <View style={styles.logoBadge}>
            <Text style={styles.badgeMonogram}>PK</Text>
          </View>
          <Text style={styles.studioName}>PK-Fussballschule</Text>
          <Text style={styles.studioCity}>Rhein-Main</Text>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Neues Passwort</Text>
          <Text style={styles.formSub}>Wähle ein neues Passwort für deinen Account.</Text>

          {success ? (
            <View style={styles.successCard}>
              <Text style={styles.successIcon}>✓</Text>
              <Text style={styles.successTitle}>Passwort gespeichert</Text>
              <Text style={styles.successSub}>Du wirst jetzt eingeloggt…</Text>
            </View>
          ) : (
            <>
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Neues Passwort</Text>
                <TextInput
                  style={[styles.input, pwErr && styles.inputErr]}
                  value={pw}
                  onChangeText={v => { setPw(v); setErr(''); }}
                  placeholder="Mindestens 6 Zeichen"
                  placeholderTextColor={C.textFaint}
                  secureTextEntry
                />
              </View>

              <View style={[styles.fieldWrap, { marginBottom: err ? 8 : 28 }]}>
                <Text style={styles.fieldLabel}>Passwort bestätigen</Text>
                <TextInput
                  style={[styles.input, confirmErr && styles.inputErr]}
                  value={pwConfirm}
                  onChangeText={v => { setPwConfirm(v); setErr(''); }}
                  placeholder="Passwort wiederholen"
                  placeholderTextColor={C.textFaint}
                  secureTextEntry
                />
              </View>

              {!!err && <Text style={styles.errText}>{err}</Text>}

              <TouchableOpacity
                onPress={doReset}
                disabled={loading || !sessionReady}
                activeOpacity={0.88}
                style={[styles.saveBtn, (loading || !sessionReady) && { opacity: 0.7 }]}
              >
                <Text style={styles.saveBtnLabel}>
                  {loading ? 'Wird gespeichert…' : !sessionReady ? 'Link wird geprüft…' : 'Passwort speichern'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <View style={styles.decorRow}>
          <View style={styles.decorLine} />
          <Text style={styles.decorText}>PK Fussballschule · Buchungs-App</Text>
          <View style={styles.decorLine} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
