import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Linking } from 'react-native';
import { supabase } from '../lib/supabase';
import { PROGRAMS, PROGRAM_CAPACITY, ProgramId } from '../constants/programs';

const PROGRAM_COLORS: Record<string, string> = {
  individual: '#4A8FE8', gruppe: '#3DBFA0', athletik: '#F5A84A',
  torhueter_individual: '#E87676', torhueter_gruppe: '#9B59B6',
};

const LEVEL_LABELS: Record<string, string> = {
  anfaenger: 'Anfänger', amateur: 'Amateur', profi: 'Profi', experte: 'Experte',
};
const LEVEL_COLORS: Record<string, string> = {
  anfaenger: '#4CAF50', amateur: '#FFC107', profi: '#FF9800', experte: '#F44336',
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDate(ds: string) {
  const [y, m, d] = ds.split('-');
  return `${d}.${m}.${y}`;
}

// Nav-Icons als View-Formen (statt Emojis) — Stil wie in src/components/BottomNav.tsx
const NAV_ACTIVE = '#1C2133';
const NAV_INACTIVE = '#9CA3AF';

function CalendarIcon({ color, size = 22 }: { color: string; size?: number }) {
  const bw = Math.max(1.8, size * 0.09);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: size, height: size * 0.92, borderWidth: bw, borderColor: color, borderRadius: size * 0.16, overflow: 'hidden' }}>
        <View style={{ height: size * 0.26, backgroundColor: color }} />
      </View>
    </View>
  );
}

function VideoIcon({ color, size = 22 }: { color: string; size?: number }) {
  const bw = Math.max(1.8, size * 0.09);
  const t = size * 0.2;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: size, height: size * 0.74, borderWidth: bw, borderColor: color, borderRadius: size * 0.14, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 0, height: 0, borderTopWidth: t, borderBottomWidth: t, borderLeftWidth: t * 1.3, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: color, marginLeft: t * 0.5 }} />
      </View>
    </View>
  );
}

function PersonIcon({ color, size = 22 }: { color: string; size?: number }) {
  const bw = Math.max(1.8, size * 0.09);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: size * 0.42, height: size * 0.42, borderRadius: size * 0.21, borderWidth: bw, borderColor: color, marginBottom: size * 0.08 }} />
      <View style={{ width: size * 0.72, height: size * 0.34, borderWidth: bw, borderColor: color, borderTopLeftRadius: size * 0.36, borderTopRightRadius: size * 0.36, borderBottomWidth: 0 }} />
    </View>
  );
}

type TrainerAppointment = {
  id: string;
  date: string;
  time: string;
  status: string;
  program: string;
  player_id: string;
  location: string | null;
  players: { name: string; level: string | null; player_type: string | null } | null;
};

type SlotMember = { id: string; name: string; level: string | null };

type TrainerSlot = {
  key: string;
  date: string;
  time: string;
  program: string;
  location: string | null;
  members: SlotMember[];
};

// Termine zu Slots bündeln: gleicher Tag + Uhrzeit + Programm + Standort = ein
// Slot. Gruppentrainings zeigen so alle Teilnehmer in einer Karte. Eingabe ist
// bereits nach date/time sortiert, deshalb bleibt die Reihenfolge chronologisch.
function groupSlots(appts: TrainerAppointment[]): TrainerSlot[] {
  const map = new Map<string, TrainerSlot>();
  const order: string[] = [];
  for (const a of appts) {
    const key = `${a.date}|${a.time}|${a.program}|${a.location ?? ''}`;
    let slot = map.get(key);
    if (!slot) {
      slot = { key, date: a.date, time: a.time, program: a.program, location: a.location, members: [] };
      map.set(key, slot);
      order.push(key);
    }
    slot.members.push({ id: a.id, name: a.players?.name?.trim() || 'Unbekannt', level: a.players?.level ?? null });
  }
  return order.map(k => map.get(k)!);
}

type TrainerProfile = {
  full_name: string;
  email: string;
  trainer_specialty: string | null;
};

type TrainerVideo = {
  id: string;
  title: string;
  url: string;
  description: string | null;
};

interface Props {
  onLogout: () => void;
}

export function TrainerApp({ onLogout }: Props) {
  const [tab, setTab] = useState<'termine' | 'videos' | 'profil'>('termine');
  const [appointments, setAppointments] = useState<TrainerAppointment[]>([]);
  const [profile, setProfile] = useState<TrainerProfile | null>(null);
  const [videos, setVideos] = useState<TrainerVideo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [{ data: prof }, { data: appts }, { data: vids }] = await Promise.all([
        supabase.from('profiles').select('full_name, email, trainer_specialty').eq('id', user.id).single(),
        supabase.from('appointments')
          .select('id, date, time, status, program, player_id, location, players ( name, level, player_type )')
          .eq('trainer_id', user.id)
          .eq('status', 'confirmed')
          .gte('date', todayStr())
          .order('date')
          .order('time'),
        supabase.from('trainer_videos')
          .select('id, title, url, description')
          .eq('trainer_id', user.id)
          .order('created_at', { ascending: false }),
      ]);

      setProfile(prof as TrainerProfile ?? null);
      // Normalize time: PostgREST serializes native time type as "HH:MM:SS"
      // PostgREST liefert die eingebettete to-one-Relation als Objekt; der
      // generierte Typ sieht sie als Array, daher der Cast über unknown.
      setAppointments(((appts ?? []) as unknown as TrainerAppointment[]).map(a => ({ ...a, time: a.time?.slice(0, 5) ?? a.time })));
      setVideos((vids ?? []) as TrainerVideo[]);
      setLoading(false);
    };
    load();
  }, []);

  const ts = todayStr();
  const todaySlots = groupSlots(appointments.filter(a => a.date === ts));
  const upcomingSlots = groupSlots(appointments.filter(a => a.date > ts));

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerSub}>Trainer-Bereich</Text>
          <Text style={styles.headerTitle}>{profile?.full_name ?? 'Trainer'}</Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={onLogout} activeOpacity={0.7}>
          <Text style={styles.logoutText}>Abmelden</Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color="#4A7FD4" />
      ) : (
        <>
          <View style={styles.content}>
            {tab === 'termine' && (
              <ScrollView contentContainerStyle={styles.scrollContent}>
                <Text style={styles.sectionTitle}>Heute ({todaySlots.length})</Text>
                {todaySlots.length === 0 ? (
                  <Text style={styles.empty}>Keine Trainings heute.</Text>
                ) : (
                  todaySlots.map(s => <SlotCard key={s.key} slot={s} />)
                )}

                <Text style={[styles.sectionTitle, { marginTop: 24 }]}>
                  Bevorstehend ({upcomingSlots.length})
                </Text>
                {upcomingSlots.length === 0 ? (
                  <Text style={styles.empty}>Keine weiteren Trainings.</Text>
                ) : (
                  upcomingSlots.map(s => <SlotCard key={s.key} slot={s} />)
                )}
              </ScrollView>
            )}

            {tab === 'videos' && (
              <VideosTab videos={videos} />
            )}

            {tab === 'profil' && profile && (
              <ProfilTab profile={profile} />
            )}
          </View>

          {/* Bottom Nav */}
          <View style={styles.bottomNav}>
            <TouchableOpacity
              style={[styles.navItem, tab === 'termine' && styles.navItemActive]}
              onPress={() => setTab('termine')}
              activeOpacity={0.7}
            >
              <CalendarIcon color={tab === 'termine' ? NAV_ACTIVE : NAV_INACTIVE} />
              <Text style={[styles.navLabel, tab === 'termine' && styles.navLabelActive]}>Termine</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.navItem, tab === 'videos' && styles.navItemActive]}
              onPress={() => setTab('videos')}
              activeOpacity={0.7}
            >
              <VideoIcon color={tab === 'videos' ? NAV_ACTIVE : NAV_INACTIVE} />
              <Text style={[styles.navLabel, tab === 'videos' && styles.navLabelActive]}>Videos</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.navItem, tab === 'profil' && styles.navItemActive]}
              onPress={() => setTab('profil')}
              activeOpacity={0.7}
            >
              <PersonIcon color={tab === 'profil' ? NAV_ACTIVE : NAV_INACTIVE} />
              <Text style={[styles.navLabel, tab === 'profil' && styles.navLabelActive]}>Profil</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

function SlotCard({ slot }: { slot: TrainerSlot }) {
  const prog = PROGRAMS.find(p => p.id === slot.program);
  const color = PROGRAM_COLORS[slot.program] ?? '#5A8C6A';
  const capacity = PROGRAM_CAPACITY[slot.program as ProgramId] ?? slot.members.length;
  const isGroup = capacity > 1;

  return (
    <View style={[styles.card, { borderLeftColor: color }]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardBody}>
          <Text style={[styles.cardProgram, { color }]}>{prog?.name ?? slot.program}</Text>
          <Text style={styles.cardDate}>
            {fmtDate(slot.date)} · {slot.time} Uhr{slot.location ? ` · ${slot.location}` : ''}
          </Text>
        </View>
        {isGroup && (
          <View style={[styles.countBadge, { backgroundColor: color + '1A' }]}>
            <Text style={[styles.countText, { color }]}>{slot.members.length}/{capacity}</Text>
          </View>
        )}
      </View>

      <View style={styles.memberList}>
        {slot.members.map(m => (
          <View key={m.id} style={styles.memberRow}>
            <View style={[styles.levelDot, { backgroundColor: m.level ? (LEVEL_COLORS[m.level] ?? '#D1D5DB') : '#D1D5DB' }]} />
            <Text style={styles.memberName}>{m.name}</Text>
            {m.level && <Text style={styles.memberLevel}>{LEVEL_LABELS[m.level] ?? m.level}</Text>}
          </View>
        ))}
      </View>
    </View>
  );
}

function VideosTab({ videos }: { videos: TrainerVideo[] }) {
  if (videos.length === 0) {
    return (
      <ScrollView contentContainerStyle={[styles.scrollContent, { alignItems: 'center', paddingTop: 60 }]}>
        <View style={{ marginBottom: 16 }}>
          <VideoIcon color="#C4C9D2" size={48} />
        </View>
        <Text style={[styles.sectionTitle, { textAlign: 'center' }]}>Noch keine Videos vorhanden.</Text>
        <Text style={[styles.empty, { textAlign: 'center' }]}>Der Admin kann Videos für dich hinterlegen.</Text>
      </ScrollView>
    );
  }
  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <Text style={styles.sectionTitle}>Meine Videos ({videos.length})</Text>
      {videos.map(v => (
        <View key={v.id} style={styles.videoCard}>
          <View style={styles.videoCardBody}>
            <Text style={styles.videoTitle}>{v.title}</Text>
            {v.description ? <Text style={styles.videoDesc}>{v.description}</Text> : null}
          </View>
          <TouchableOpacity
            style={styles.videoOpenBtn}
            onPress={() => Linking.openURL(v.url)}
            activeOpacity={0.7}
          >
            <Text style={styles.videoOpenBtnText}>Öffnen</Text>
          </TouchableOpacity>
        </View>
      ))}
    </ScrollView>
  );
}

function ProfilTab({ profile }: { profile: TrainerProfile }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);

  const handlePasswordChange = async () => {
    setPwError(null);
    setPwSuccess(false);

    if (newPassword.length < 8) {
      setPwError('Passwort muss mindestens 8 Zeichen lang sein.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError('Passwörter stimmen nicht überein.');
      return;
    }

    setPwLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPwLoading(false);

    if (error) {
      setPwError(error.message);
    } else {
      setPwSuccess(true);
      setNewPassword('');
      setConfirmPassword('');
    }
  };

  const specialty = profile.trainer_specialty === 'torwart' ? 'Torwart-Trainer' :
                    profile.trainer_specialty === 'spieler' ? 'Spieler-Trainer' : null;

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      {/* Profil-Info */}
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {profile.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
          </Text>
        </View>
        <Text style={styles.profileName}>{profile.full_name}</Text>
        {specialty && (
          <View style={styles.specialtyBadge}>
            <Text style={styles.specialtyText}>{specialty}</Text>
          </View>
        )}
        <Text style={styles.profileEmail}>{profile.email}</Text>
      </View>

      {/* Passwort ändern */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Passwort ändern</Text>

        {pwSuccess && (
          <View style={styles.successBox}>
            <Text style={styles.successText}>✓ Passwort erfolgreich geändert.</Text>
          </View>
        )}

        <Text style={styles.fieldLabel}>Neues Passwort</Text>
        <TextInput
          style={styles.input}
          value={newPassword}
          onChangeText={v => { setNewPassword(v); setPwError(null); setPwSuccess(false); }}
          placeholder="Mindestens 8 Zeichen"
          placeholderTextColor="#9CA3AF"
          secureTextEntry
        />

        <Text style={styles.fieldLabel}>Passwort bestätigen</Text>
        <TextInput
          style={styles.input}
          value={confirmPassword}
          onChangeText={v => { setConfirmPassword(v); setPwError(null); setPwSuccess(false); }}
          placeholder="Passwort wiederholen"
          placeholderTextColor="#9CA3AF"
          secureTextEntry
        />

        {pwError && <Text style={styles.errorText}>{pwError}</Text>}

        <TouchableOpacity
          style={[styles.saveBtn, (pwLoading || !newPassword) && { opacity: 0.5 }]}
          onPress={handlePasswordChange}
          activeOpacity={0.7}
          disabled={pwLoading || !newPassword}
        >
          <Text style={styles.saveBtnText}>{pwLoading ? 'Speichern...' : 'Passwort speichern'}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F6F9' },
  header: {
    backgroundColor: '#1C2133',
    paddingHorizontal: 24,
    paddingTop: 52,
    paddingBottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: '600', marginBottom: 2 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#fff' },
  logoutBtn: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
  logoutText: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.7)' },
  content: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 40 },

  // Termine
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  empty: { fontSize: 14, color: '#9CA3AF', paddingVertical: 12 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardBody: { flex: 1 },
  cardProgram: { fontSize: 15, fontWeight: '700', marginBottom: 3 },
  cardDate: { fontSize: 13, color: '#6B7280' },
  countBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, flexShrink: 0 },
  countText: { fontSize: 13, fontWeight: '800' },

  // Slot-Mitglieder
  memberList: { marginTop: 12, borderTopWidth: 1, borderTopColor: '#F1F3F7', paddingTop: 10, gap: 8 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  levelDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  memberName: { fontSize: 14, fontWeight: '600', color: '#1F2937', flex: 1 },
  memberLevel: { fontSize: 11, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.3 },

  // Profil
  profileCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#1C2133',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText: { fontSize: 26, fontWeight: '800', color: '#fff' },
  profileName: { fontSize: 20, fontWeight: '800', color: '#111827', marginBottom: 6 },
  specialtyBadge: { backgroundColor: '#EEF2FF', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4, marginBottom: 8 },
  specialtyText: { fontSize: 13, fontWeight: '700', color: '#4A7FD4' },
  profileEmail: { fontSize: 13, color: '#9CA3AF' },

  section: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 14, marginBottom: 6 },
  input: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: '#111827', outlineWidth: 0 } as any,
  successBox: { backgroundColor: '#F0FDF4', borderRadius: 8, padding: 12, marginBottom: 4 },
  successText: { fontSize: 13, fontWeight: '700', color: '#15803D' },
  errorText: { fontSize: 13, color: '#EF4444', fontWeight: '600', marginTop: 10 },
  saveBtn: { backgroundColor: '#4A7FD4', borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 18 },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // Videos
  videoCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6, elevation: 2 },
  videoCardBody: { flex: 1, minWidth: 0 },
  videoTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 4 },
  videoDesc: { fontSize: 13, color: '#6B7280' },
  videoOpenBtn: { backgroundColor: 'rgba(74,127,212,0.1)', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, flexShrink: 0 },
  videoOpenBtnText: { fontSize: 13, fontWeight: '700', color: '#4A7FD4' },

  // Bottom Nav
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingBottom: 20,
    paddingTop: 8,
  },
  navItem: { flex: 1, alignItems: 'center', paddingVertical: 6, gap: 3 },
  navItemActive: {},
  navLabel: { fontSize: 11, fontWeight: '600', color: '#9CA3AF' },
  navLabelActive: { color: '#1C2133' },
});
