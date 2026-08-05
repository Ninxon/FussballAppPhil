import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { AdminVideoPackage } from '../../../types';
import { styles } from './styles';

interface Props {
  packages: AdminVideoPackage[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: (title: string) => Promise<{ error: string | null }>;
  onDuplicate: (pkg: AdminVideoPackage) => Promise<{ error: string | null }>;
}

// Dauerhafter Paketkatalog. Ein Paket bleibt hier stehen, unabhaengig davon,
// ob ihm gerade Trainer zugewiesen sind.
export function PackageList({ packages, selectedId, onSelect, onCreate, onDuplicate }: Props) {
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doCreate = async () => {
    if (!title.trim()) { setError('Bitte einen Namen eingeben.'); return; }
    setBusy(true);
    setError(null);
    const { error: err } = await onCreate(title);
    setBusy(false);
    if (err) { setError(err); return; }
    setTitle('');
    setCreating(false);
  };

  const doDuplicate = async (pkg: AdminVideoPackage) => {
    setBusy(true);
    setError(null);
    const { error: err } = await onDuplicate(pkg);
    setBusy(false);
    if (err) setError(err);
  };

  return (
    <ScrollView style={styles.list} contentContainerStyle={styles.listInner}>
      <Text style={styles.listTitle}>Pakete ({packages.length})</Text>

      {creating ? (
        <View style={{ marginBottom: 16 }}>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="z. B. Aufwärmen Grundlagen"
            placeholderTextColor="#7A90AE"
            autoFocus
          />
          {error && <Text style={styles.errorText}>{error}</Text>}
          <TouchableOpacity
            style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
            onPress={doCreate}
            disabled={busy}
            activeOpacity={0.7}
          >
            <Text style={styles.primaryBtnText}>{busy ? 'Wird angelegt…' : 'Paket anlegen'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.neutralBtn, { marginTop: 8 }]}
            onPress={() => { setCreating(false); setTitle(''); setError(null); }}
            activeOpacity={0.7}
          >
            <Text style={styles.neutralBtnText}>Abbrechen</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.newBtn} onPress={() => setCreating(true)} activeOpacity={0.7}>
          <Text style={styles.newBtnText}>+ Neues Paket</Text>
        </TouchableOpacity>
      )}

      {!creating && error && <Text style={styles.errorText}>{error}</Text>}

      {packages.length === 0 && !creating && (
        <Text style={styles.listEmpty}>Noch keine Pakete angelegt.</Text>
      )}

      {packages.map(pkg => {
        const active = pkg.id === selectedId;
        return (
          <TouchableOpacity
            key={pkg.id}
            style={[styles.pkgItem, active && styles.pkgItemActive]}
            onPress={() => onSelect(pkg.id)}
            activeOpacity={0.75}
          >
            <Text style={[styles.pkgItemTitle, active && styles.pkgItemTitleActive]} numberOfLines={2}>
              {pkg.title}
            </Text>
            <Text style={styles.pkgItemMeta}>
              {pkg.videos.length} {pkg.videos.length === 1 ? 'Video' : 'Videos'}
              {' · '}
              {pkg.assignments.length === 0
                ? 'nicht verteilt'
                : `an ${pkg.assignments.length} ${pkg.assignments.length === 1 ? 'Trainer' : 'Trainer'} verteilt`}
            </Text>
            {active && (
              <View style={styles.pkgItemActions}>
                <TouchableOpacity onPress={() => doDuplicate(pkg)} disabled={busy} activeOpacity={0.7}>
                  <Text style={styles.pkgItemAction}>Duplizieren</Text>
                </TouchableOpacity>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}
