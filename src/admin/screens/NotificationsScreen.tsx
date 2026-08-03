import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { supabase } from '../../lib/supabase';
import { AppNotification } from '../../types';
import { LOCATIONS, Location } from '../../constants/studio';

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function NotificationsScreen() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formBody, setFormBody] = useState('');
  const [formLocation, setFormLocation] = useState<Location | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => { loadNotifications(); }, []);

  const loadNotifications = async () => {
    setLoading(true);
    setLoadError(false);
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      setLoadError(true);
    } else {
      setNotifications((data ?? []) as AppNotification[]);
    }
    setLoading(false);
  };

  const doCreate = async () => {
    if (!formTitle.trim() || !formBody.trim()) {
      setSaveError('Titel und Text sind Pflichtfelder.');
      return;
    }
    if (!formLocation) {
      setSaveError('Bitte einen Standort auswählen.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('notifications').insert({
      title: formTitle.trim(),
      body: formBody.trim(),
      location: formLocation,
      is_global: true,
      created_by: user?.id,
    });
    setSaving(false);
    if (error) {
      setSaveError(error.message);
    } else {
      setFormTitle(''); setFormBody(''); setFormLocation(null);
      setShowForm(false);
      await loadNotifications();
    }
  };

  const doDelete = async (id: string) => {
    setDeleteError(null);
    const { error } = await supabase.from('notifications').delete().eq('id', id);
    if (error) {
      setDeleteError('Löschen fehlgeschlagen: ' + error.message);
      return;
    }
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#4A8FE8" />;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Infos & Benachrichtigungen</Text>
      <Text style={styles.sub}>Hier erstellst du Nachrichten, die Kunden in der App sehen.</Text>

      <TouchableOpacity
        style={styles.newBtn}
        onPress={() => { setShowForm(v => !v); setSaveError(null); }}
        activeOpacity={0.7}
      >
        <Text style={styles.newBtnText}>{showForm ? '✕ Abbrechen' : '+ Neue Info erstellen'}</Text>
      </TouchableOpacity>

      {showForm && (
        <View style={styles.form}>
          <Text style={styles.formTitle}>Neue Info</Text>
          <Text style={styles.fieldLabel}>Titel *</Text>
          <TextInput
            style={styles.input}
            value={formTitle}
            onChangeText={setFormTitle}
            placeholder="z.B. Neuer Standort ab Juni"
            placeholderTextColor="#7A90AE"
          />
          <Text style={styles.fieldLabel}>Text *</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={formBody}
            onChangeText={setFormBody}
            placeholder="Beschreibung der Info..."
            placeholderTextColor="#7A90AE"
            multiline
            numberOfLines={4}
          />
          <Text style={styles.fieldLabel}>Standort *</Text>
          <View style={styles.chipRow}>
            {LOCATIONS.map(loc => (
              <TouchableOpacity
                key={loc}
                style={[styles.locationChip, formLocation === loc && styles.locationChipActive]}
                onPress={() => setFormLocation(loc)}
                activeOpacity={0.7}
              >
                <Text style={[styles.locationChipText, formLocation === loc && styles.locationChipTextActive]}>
                  {loc}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {saveError && <Text style={styles.errorText}>{saveError}</Text>}
          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={doCreate}
            disabled={saving}
            activeOpacity={0.7}
          >
            <Text style={styles.saveBtnText}>{saving ? 'Wird gespeichert...' : 'Veröffentlichen'}</Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={styles.sectionTitle}>Veröffentlichte Infos ({notifications.length})</Text>

      {deleteError && <Text style={styles.errorText}>{deleteError}</Text>}

      {loadError ? (
        <View>
          <Text style={styles.empty}>Infos konnten nicht geladen werden.</Text>
          <TouchableOpacity onPress={loadNotifications} activeOpacity={0.7}>
            <Text style={styles.retryText}>Erneut versuchen</Text>
          </TouchableOpacity>
        </View>
      ) : notifications.length === 0 ? (
        <Text style={styles.empty}>Noch keine Infos veröffentlicht.</Text>
      ) : (
        notifications.map(n => (
          <View key={n.id} style={styles.notifCard}>
            <View style={styles.notifHeader}>
              <Text style={styles.notifDate}>{fmtDate(n.created_at)}</Text>
              {n.location && (
                <View style={styles.locationBadge}>
                  <Text style={styles.locationText}>{n.location}</Text>
                </View>
              )}
              <TouchableOpacity onPress={() => doDelete(n.id)} activeOpacity={0.7} style={styles.deleteBtn}>
                <Text style={styles.deleteBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.notifTitle}>{n.title}</Text>
            <Text style={styles.notifBody}>{n.body}</Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#EEF3FB' },
  content: { padding: 32 },
  title: { fontSize: 26, fontWeight: '800', color: '#152238', marginBottom: 6 },
  sub: { fontSize: 14, color: '#4A6080', marginBottom: 24 },
  newBtn: {
    backgroundColor: '#152238', borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginBottom: 20,
    shadowColor: '#152238', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18, shadowRadius: 12, elevation: 6,
  },
  newBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  form: {
    backgroundColor: '#fff', borderRadius: 14, padding: 20, marginBottom: 24,
    shadowColor: '#152238', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6, elevation: 2,
    borderWidth: 1, borderColor: 'rgba(21,34,56,0.08)',
  },
  formTitle: { fontSize: 15, fontWeight: '700', color: '#152238', marginBottom: 12 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#4A6080', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6, marginTop: 10 },
  input: {
    backgroundColor: '#F4F8FF', borderWidth: 1, borderColor: 'rgba(21,34,56,0.08)',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#152238', outlineWidth: 0,
  } as any,
  textArea: { minHeight: 90, textAlignVertical: 'top' },
  errorText: { fontSize: 13, color: '#EF4444', fontWeight: '600', marginTop: 10 },
  saveBtn: {
    backgroundColor: '#152238', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 16,
    shadowColor: '#152238', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18, shadowRadius: 12, elevation: 6,
  },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#152238', marginBottom: 14 },
  empty: { color: '#7A90AE', fontSize: 14, textAlign: 'center', paddingVertical: 24 },
  retryText: { color: '#4A8FE8', fontSize: 14, fontWeight: '700', textAlign: 'center', paddingBottom: 16 },
  notifCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 18, marginBottom: 12,
    shadowColor: '#152238', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 1 }, shadowRadius: 4, elevation: 1,
    borderWidth: 1, borderColor: 'rgba(21,34,56,0.08)',
  },
  notifHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  notifDate: { fontSize: 12, color: '#7A90AE', flex: 1 },
  locationBadge: { backgroundColor: 'rgba(74,143,232,0.1)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  locationText: { fontSize: 11, fontWeight: '700', color: '#4A8FE8' },
  deleteBtn: { padding: 4 },
  deleteBtnText: { fontSize: 14, color: '#7A90AE', fontWeight: '700' },
  notifTitle: { fontSize: 15, fontWeight: '700', color: '#152238', marginBottom: 6 },
  notifBody: { fontSize: 13, color: '#4A6080', lineHeight: 20 },
  chipRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  locationChip: {
    flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 2,
    borderColor: 'rgba(21,34,56,0.08)', backgroundColor: '#F4F8FF', alignItems: 'center',
  },
  locationChipActive: { borderColor: '#4A8FE8', backgroundColor: 'rgba(74,143,232,0.08)' },
  locationChipText: { fontSize: 14, fontWeight: '700', color: '#4A6080' },
  locationChipTextActive: { color: '#4A8FE8' },
});
