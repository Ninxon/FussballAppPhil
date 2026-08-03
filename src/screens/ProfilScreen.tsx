import React, { useRef, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Animated, Easing, TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { useTheme } from '../contexts/ThemeContext';
import { Card } from '../components/Card';
import { Btn } from '../components/Btn';
import { useProfile } from '../hooks/useProfile';
import { supabase } from '../lib/supabase';
import { STUDIO } from '../constants/studio';
import { Player } from '../types';

interface Props {
  onLogout: () => void;
  players: Player[];
}

function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  const { C } = useTheme();
  return (
    <View style={[
      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15 },
      !last && { borderBottomWidth: 1, borderBottomColor: C.cardBorder },
    ]}>
      <Text style={{ fontSize: 15, color: C.textMid, flex: 1 }}>{label}</Text>
      <Text style={{ fontSize: 15, fontWeight: '600', color: C.text, textAlign: 'right', flex: 1 }}>{value || '—'}</Text>
    </View>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  const { C } = useTheme();
  return (
    <Card style={{ marginBottom: 14 }}>
      <View style={{ paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.cardBorder }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: C.textFaint, textTransform: 'uppercase', letterSpacing: 0.2 }}>{title}</Text>
      </View>
      {children}
    </Card>
  );
}

function calcAge(birthDate: string | null): string {
  if (!birthDate) return '—';
  const birth = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return `${age} Jahre`;
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Übersetzt die (englischen) Supabase-Auth-Fehler in handlungsleitende Meldungen.
// Wichtigster Fall: abgelaufene/fehlende Session -> "erneut versuchen" hilft NICHT,
// der Kunde muss sich neu anmelden.
function passwordErrorMessage(error: { message?: string; status?: number }): string {
  const msg = (error?.message ?? '').toLowerCase();
  const status = error?.status;
  if (msg.includes('session') || msg.includes('jwt') || msg.includes('not authenticated') ||
      status === 401 || status === 403) {
    return 'Deine Sitzung ist abgelaufen. Bitte melde dich ab, neu an und ändere das Passwort dann erneut.';
  }
  if (msg.includes('different from the old') || msg.includes('should be different') ||
      msg.includes('same as') || msg.includes('same_password')) {
    return 'Das neue Passwort muss sich von deinem bisherigen unterscheiden.';
  }
  if (msg.includes('weak') || msg.includes('pwned') || msg.includes('leaked') || msg.includes('compromis')) {
    return 'Dieses Passwort ist zu unsicher (z. B. weil es bekannt/geleakt ist). Bitte wähle ein anderes.';
  }
  if (msg.includes('failed to fetch') || msg.includes('network') || msg.includes('load failed')) {
    return 'Keine Verbindung zum Server. Bitte prüfe dein Internet und versuche es erneut.';
  }
  if (msg.includes('rate') || status === 429) {
    return 'Zu viele Versuche. Bitte warte einen Moment und versuche es erneut.';
  }
  return error?.message
    ? `Fehler beim Ändern: ${error.message}`
    : 'Fehler beim Ändern. Bitte erneut versuchen.';
}

export function ProfilScreen({ onLogout, players }: Props) {
  const insets = useSafeAreaInsets();
  const { C, isDark, toggleTheme } = useTheme();
  const styles = React.useMemo(() => getStyles(C), [C]);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;
  const { profile, loading } = useProfile();

  const [pwOpen, setPwOpen] = useState(false);
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwErr, setPwErr] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);

  const [editContact, setEditContact] = useState(false);
  const [editPhone, setEditPhone] = useState('');
  const [contactLoading, setContactLoading] = useState(false);
  const [contactMsg, setContactMsg] = useState('');
  const pwSuccessTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (pwSuccessTimer.current) clearTimeout(pwSuccessTimer.current);
  }, []);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 350, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 350, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    if (profile?.phone) setEditPhone(profile.phone);
  }, [profile?.phone]);

  const changePassword = async () => {
    if (newPw.length < 6) { setPwErr('Mindestens 6 Zeichen.'); return; }
    if (newPw !== confirmPw) { setPwErr('Passwörter stimmen nicht überein.'); return; }
    setPwErr('');
    setPwLoading(true);

    // Häufigste Ursache für "Fehler beim Ändern": die lokale Session ist abgelaufen
    // (Web-Cookie gilt ohne "Angemeldet bleiben" nur 8 h). Dann scheitert updateUser
    // CLIENTSEITIG, ohne die Auth-API zu erreichen. Daher Session vorab sicherstellen.
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        console.error('[ProfilScreen] Session-Refresh fehlgeschlagen:', refreshError);
        setPwLoading(false);
        setPwErr('Deine Sitzung ist abgelaufen. Bitte melde dich ab, neu an und ändere das Passwort dann erneut.');
        return;
      }
    }

    const { error } = await supabase.auth.updateUser({ password: newPw });
    setPwLoading(false);
    if (error) {
      // Echte Ursache fürs Debugging festhalten, dem Kunden eine klare Meldung zeigen.
      console.error('[ProfilScreen] Passwort ändern fehlgeschlagen:', error);
      setPwErr(passwordErrorMessage(error));
    } else {
      setNewPw('');
      setConfirmPw('');
      setPwOpen(false);
      setPwSuccess(true);
      pwSuccessTimer.current = setTimeout(() => setPwSuccess(false), 3000);
    }
  };

  const saveContact = async () => {
    setContactLoading(true);
    setContactMsg('');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setContactLoading(false); return; }

    const { error } = await supabase
      .from('profiles')
      .update({ phone: editPhone.trim() })
      .eq('id', user.id);

    if (!error) {
      await supabase.from('notifications').insert({
        title: 'Kontaktdaten geändert',
        body: `Kunde ${profile?.full_name ?? ''} (Nr. ${profile?.customer_number}) hat seine Telefonnummer geändert auf: ${editPhone.trim()}`,
        is_global: false,
        created_by: user.id,
      });
      setContactMsg('Gespeichert.');
      setEditContact(false);
    } else {
      setContactMsg('Fehler beim Speichern.');
    }
    setContactLoading(false);
  };

  // Eltern-Account: oben die Namen der KINDER zeigen (nicht den Eltern-Namen).
  // Vornamen reichen für die große Box; die vollen Namen + Nummern stehen
  // gebündelt in der "Spieler"-Karte darunter.
  const playerNames = players.map(p => (p.name ?? '').trim()).filter(Boolean);
  const firstNames = playerNames.map(n => n.split(/\s+/)[0]);
  const displayName = firstNames.length
    ? (firstNames.length <= 2
        ? firstNames.join(' & ')
        : `${firstNames.slice(0, -1).join(', ')} & ${firstNames[firstNames.length - 1]}`)
    : (profile?.full_name ?? '—');

  const initials = (() => {
    if (players.length === 1) {
      const parts = playerNames[0].split(/\s+/);
      return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')) || '?';
    }
    if (firstNames.length) return firstNames.map(n => n[0]).join('').slice(0, 3);
    return profile?.full_name
      ? profile.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)
      : '?';
  })().toUpperCase();

  return (
    <ScrollView
      style={[styles.flex, { backgroundColor: 'transparent' }]}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 20, paddingBottom: 24 }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
        <Text style={styles.screenTitle}>Profil</Text>

        {/* Avatar Card */}
        <View style={styles.avatarCard}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarIcon}>{loading ? '' : initials}</Text>
          </View>
          <Text style={styles.userName}>{loading ? '…' : displayName}</Text>
          <Text style={styles.userType}>Elternaccount</Text>
          <View style={styles.userChips}>
            <View style={styles.chip}>
              <Text style={styles.chipText}>{players.length === 1 ? '1 Spieler' : `${players.length} Spieler`}</Text>
            </View>
          </View>
        </View>

        {/* Spieler (read-only) */}
        {players.length > 0 && (
          <SectionCard title="Spieler">
            {players.map((pl, i) => (
              <InfoRow
                key={pl.id}
                label={pl.name}
                value={[
                  pl.player_number ? `Nr. ${pl.player_number}` : '',
                  pl.birth_date ? calcAge(pl.birth_date) : '',
                ].filter(Boolean).join(' · ')}
                last={i === players.length - 1}
              />
            ))}
          </SectionCard>
        )}

        {/* Erreichbarkeit */}
        <SectionCard title="Erreichbarkeit">
          {editContact ? (
            <View style={styles.editContactForm}>
              <Text style={styles.editLabel}>Telefonnummer</Text>
              <TextInput
                style={styles.editInput}
                value={editPhone}
                onChangeText={setEditPhone}
                placeholder="0170 1234567"
                placeholderTextColor={C.textFaint}
                keyboardType="phone-pad"
              />
              <Text style={styles.editHint}>E-Mail-Änderungen bitte beim Kundenservice anfragen.</Text>
              {!!contactMsg && (
                <Text style={[styles.contactMsg, { color: contactMsg.startsWith('Fehler') ? C.red : '#15803D' }]}>
                  {contactMsg}
                </Text>
              )}
              <View style={styles.editContactBtns}>
                <TouchableOpacity
                  style={[styles.savePwBtn, { flex: 1 }, contactLoading && { opacity: 0.6 }]}
                  onPress={saveContact}
                  disabled={contactLoading}
                  activeOpacity={0.85}
                >
                  <Text style={styles.savePwLabel}>{contactLoading ? 'Speichern…' : 'Speichern'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.cancelBtn, { flex: 1 }]}
                  onPress={() => { setEditContact(false); setContactMsg(''); setEditPhone(profile?.phone ?? ''); }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.cancelBtnLabel}>Abbrechen</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              <InfoRow label="Mobil" value={profile?.phone ?? ''} />
              <InfoRow label="E-Mail" value={profile?.email ?? ''} last />
              <View style={styles.editContactRow}>
                <TouchableOpacity
                  style={styles.changePwBtn}
                  onPress={() => setEditContact(true)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.changePwLabel}>BEARBEITEN</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </SectionCard>

        {/* Allgemein */}
        <SectionCard title="Allgemein">
          <View style={[styles.infoRow, pwOpen && styles.infoRowBorder]}>
            <Text style={styles.infoKey}>App Passwort</Text>
            <TouchableOpacity
              style={styles.changePwBtn}
              activeOpacity={0.8}
              onPress={() => { setPwOpen(v => !v); setPwErr(''); setPwSuccess(false); }}
            >
              <Text style={styles.changePwLabel}>{pwOpen ? 'ABBRECHEN' : 'ÄNDERN'}</Text>
            </TouchableOpacity>
          </View>
          {pwSuccess && (
            <Text style={styles.pwSuccessMsg}>Passwort erfolgreich geändert.</Text>
          )}
          {pwOpen && (
            <View style={styles.pwForm}>
              <TextInput
                style={styles.pwInput}
                placeholder="Neues Passwort"
                placeholderTextColor={C.textFaint}
                secureTextEntry
                value={newPw}
                onChangeText={v => { setNewPw(v); setPwErr(''); }}
              />
              <TextInput
                style={[styles.pwInput, { marginTop: 10 }]}
                placeholder="Passwort bestätigen"
                placeholderTextColor={C.textFaint}
                secureTextEntry
                value={confirmPw}
                onChangeText={v => { setConfirmPw(v); setPwErr(''); }}
              />
              {!!pwErr && <Text style={styles.pwErr}>{pwErr}</Text>}
              <TouchableOpacity
                style={[styles.savePwBtn, pwLoading && { opacity: 0.6 }]}
                onPress={changePassword}
                disabled={pwLoading}
                activeOpacity={0.85}
              >
                <Text style={styles.savePwLabel}>{pwLoading ? 'Wird gespeichert…' : 'Speichern'}</Text>
              </TouchableOpacity>
            </View>
          )}
        </SectionCard>

        {/* Studio Kontakt */}
        <SectionCard title="Kontakt">
          <InfoRow label="Büro" value={STUDIO.name} />
          <InfoRow label="Adresse" value={STUDIO.address} />
          <InfoRow label="Kundenservice" value="+49 152 53148032" />
          <InfoRow label="E-Mail" value={STUDIO.email} />
          <InfoRow label="Erreichbar" value={STUDIO.hours} last />
        </SectionCard>

        {/* Dark Mode Toggle */}
        <SectionCard title="Darstellung">
          <TouchableOpacity onPress={toggleTheme} activeOpacity={0.8} style={styles.themeRow}>
            <View>
              <Text style={styles.themeLabel}>{isDark ? 'Dark Mode' : 'Light Mode'}</Text>
              <Text style={styles.themeSub}>Tippe zum Wechseln</Text>
            </View>
            <View style={[styles.themeToggle, isDark && styles.themeToggleOn]}>
              <View style={[styles.themeKnob, isDark && styles.themeKnobOn]} />
            </View>
          </TouchableOpacity>
        </SectionCard>

        <Btn label="Abmelden" onPress={onLogout} variant="ghost" />
      </Animated.View>
    </ScrollView>
  );
}

function getStyles(C: Colors) {
  const inputBg = C.isDark ? C.bgTop : '#F7FAFD';
  const inputBorder = C.cardBorder;
  return StyleSheet.create({
    flex: { flex: 1 },
    content: { paddingHorizontal: 20 },
    screenTitle: { fontSize: 28, fontWeight: '800', color: C.text, letterSpacing: -0.4, marginBottom: 24 },
    avatarCard: {
      backgroundColor: C.accent,
      borderRadius: 24, padding: 28, alignItems: 'center', marginBottom: 16,
      shadowColor: C.accent, shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.22, shadowRadius: 20, elevation: 8,
    },
    avatarCircle: {
      width: 80, height: 80, borderRadius: 40,
      backgroundColor: 'rgba(255,255,255,0.15)',
      alignItems: 'center', justifyContent: 'center', marginBottom: 14,
      borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)',
    },
    avatarIcon: { fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: 1 },
    userName: { fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 4 },
    userType: { fontSize: 14, color: 'rgba(255,255,255,0.70)', marginBottom: 14 },
    userChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
    chip: {
      backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20,
      paddingHorizontal: 12, paddingVertical: 5,
      borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)',
    },
    chipText: { fontSize: 12, color: 'rgba(255,255,255,0.90)', fontWeight: '600' },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 15,
    },
    infoRowBorder: {
      borderBottomWidth: 1,
      borderBottomColor: C.cardBorder,
    },
    infoKey: { fontSize: 15, color: C.textMid, flex: 1 },
    editContactRow: { paddingHorizontal: 20, paddingVertical: 12 },
    editContactForm: { paddingHorizontal: 20, paddingBottom: 16, paddingTop: 12 },
    editLabel: { fontSize: 12, fontWeight: '700', color: C.textFaint, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 },
    editInput: {
      height: 48, borderRadius: 12, borderWidth: 1.5,
      borderColor: inputBorder, backgroundColor: inputBg,
      color: C.text, fontSize: 15, paddingHorizontal: 14, marginBottom: 8,
    },
    editHint: { fontSize: 12, color: C.textFaint, marginBottom: 12 },
    contactMsg: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
    editContactBtns: { flexDirection: 'row', gap: 10 },
    changePwBtn: {
      backgroundColor: C.accentBg, borderRadius: 9,
      paddingHorizontal: 14, paddingVertical: 7,
      borderWidth: 1, borderColor: C.cardBorder,
    },
    changePwLabel: { fontSize: 13, fontWeight: '700', color: C.accent },
    pwForm: { paddingHorizontal: 20, paddingBottom: 16 },
    pwInput: {
      height: 48, borderRadius: 12, borderWidth: 1.5,
      borderColor: inputBorder, backgroundColor: inputBg,
      color: C.text, fontSize: 15, paddingHorizontal: 14,
    },
    pwErr: { fontSize: 13, color: C.red, fontWeight: '600', marginTop: 8 },
    pwSuccessMsg: { fontSize: 13, color: '#15803D', fontWeight: '600', paddingHorizontal: 20, paddingBottom: 12 },
    savePwBtn: {
      marginTop: 14, height: 48, borderRadius: 13,
      backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center',
    },
    savePwLabel: { color: '#fff', fontSize: 16, fontWeight: '700' },
    cancelBtn: {
      marginTop: 14, height: 48, borderRadius: 13,
      backgroundColor: C.accentBg, borderWidth: 1, borderColor: C.cardBorder,
      alignItems: 'center', justifyContent: 'center',
    },
    cancelBtnLabel: { color: C.textMid, fontSize: 16, fontWeight: '600' },
    themeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 },
    themeLabel: { fontSize: 15, fontWeight: '700', color: C.text },
    themeSub: { fontSize: 12, color: C.textFaint, marginTop: 2 },
    themeToggle: { width: 48, height: 28, borderRadius: 14, backgroundColor: C.cardBorder, padding: 3, justifyContent: 'center' },
    themeToggleOn: { backgroundColor: C.accent },
    themeKnob: { width: 22, height: 22, borderRadius: 11, backgroundColor: C.textFaint },
    themeKnobOn: { backgroundColor: '#fff', alignSelf: 'flex-end' },
  });
}
