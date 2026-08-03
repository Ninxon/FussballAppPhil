import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Switch } from 'react-native';
import { CustomerProfile, MutationResult } from '../../hooks/useAdminData';
import { PlayerType } from '../../../types';
import { LOCATIONS, Location } from '../../../constants/studio';
import { PlayerTypeChips } from '../../components/PlayerTypeChips';
import { InfoRow, SectionCard } from './ui';
import { styles } from './styles';

interface Props {
  customer: CustomerProfile;
  onSaveProfile: (customerId: string, fields: Partial<Pick<CustomerProfile, 'full_name' | 'player_type' | 'parent_name' | 'location' | 'birth_date' | 'phone' | 'address'>>) => Promise<MutationResult>;
  onSaveEmail: (customerId: string, email: string) => Promise<MutationResult>;
  onToggleActive: (customerId: string, isActive: boolean) => Promise<MutationResult>;
}

// Kontaktdaten: Anzeige, Aktiv-Schalter und das Bearbeitungsformular.
export function ContactSection({ customer, onSaveProfile, onSaveEmail, onToggleActive }: Props) {
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(customer.full_name ?? '');
  const [email, setEmail] = useState(customer.email ?? '');
  const [phone, setPhone] = useState(customer.phone ?? '');
  const [address, setAddress] = useState(customer.address ?? '');
  const [playerType, setPlayerType] = useState<PlayerType | null>(customer.player_type);
  const [parentName, setParentName] = useState(customer.parent_name ?? '');
  const [location, setLocation] = useState<Location | null>((customer.location as Location) ?? null);
  const [birthDate, setBirthDate] = useState(customer.birth_date ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeLoading, setActiveLoading] = useState(false);

  const isTorwart = customer.player_type === 'torwart';
  const birthYear = customer.birth_date ? parseInt(customer.birth_date.slice(0, 4)) : null;

  const startEditing = () => {
    setFullName(customer.full_name ?? '');
    setEmail(customer.email ?? '');
    setPhone(customer.phone ?? '');
    setAddress(customer.address ?? '');
    setPlayerType(customer.player_type);
    setParentName(customer.parent_name ?? '');
    setLocation((customer.location as Location) ?? null);
    setBirthDate(customer.birth_date ?? '');
    setError(null);
    setEditing(true);
  };

  const doToggleActive = async (value: boolean) => {
    setActiveLoading(true);
    await onToggleActive(customer.id, value);
    setActiveLoading(false);
  };

  const doSave = async () => {
    if (!fullName.trim()) { setError('Name ist ein Pflichtfeld.'); return; }
    const emailTrimmed = email.trim();
    if (!emailTrimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
      setError('Bitte eine gültige E-Mail-Adresse eingeben.');
      return;
    }
    if (!location) { setError('Bitte einen Standort auswählen.'); return; }
    if (birthDate.trim()) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      const d = new Date(birthDate.trim());
      if (!dateRegex.test(birthDate.trim()) || isNaN(d.getTime()) || d > new Date()) {
        setError('Geburtsdatum muss im Format YYYY-MM-DD und in der Vergangenheit liegen.');
        return;
      }
    }
    setLoading(true);
    setError(null);
    const { error: saveErr } = await onSaveProfile(customer.id, {
      full_name: fullName.trim(),
      player_type: playerType,
      parent_name: parentName.trim() || null,
      location,
      birth_date: birthDate.trim() || null,
      phone: phone.trim(),
      address: address.trim() || null,
    });
    if (saveErr) {
      setLoading(false);
      setError(saveErr);
      return;
    }
    // E-Mail nur bei Änderung — zieht den Auth-User über die Edge Function mit.
    if (emailTrimmed.toLowerCase() !== (customer.email ?? '').toLowerCase()) {
      const { error: mailErr } = await onSaveEmail(customer.id, emailTrimmed);
      if (mailErr) {
        setLoading(false);
        setError(`Profil gespeichert, aber E-Mail-Änderung fehlgeschlagen: ${mailErr}`);
        return;
      }
    }
    setLoading(false);
    setEditing(false);
  };

  return (
    <SectionCard title="Kontaktdaten">
      {editing ? (
        <View style={styles.editSection}>
          <Text style={styles.fieldLabel}>Name *</Text>
          <TextInput style={styles.editInput} value={fullName} onChangeText={setFullName} placeholder="Max Mustermann" placeholderTextColor="#7A90AE" />
          <Text style={styles.fieldLabel}>E-Mail *</Text>
          <TextInput style={styles.editInput} value={email} onChangeText={setEmail} placeholder="max@beispiel.de" placeholderTextColor="#7A90AE" keyboardType="email-address" autoCapitalize="none" />
          <Text style={styles.fieldLabel}>Spielertyp</Text>
          <PlayerTypeChips value={playerType} onSelect={setPlayerType} compact />
          <Text style={styles.fieldLabel}>Elternname</Text>
          <TextInput style={styles.editInput} value={parentName} onChangeText={setParentName} placeholder="Elternname" placeholderTextColor="#7A90AE" />
          <Text style={styles.fieldLabel}>Telefon</Text>
          <TextInput style={styles.editInput} value={phone} onChangeText={setPhone} placeholder="0170 1234567" placeholderTextColor="#7A90AE" keyboardType="phone-pad" />
          <Text style={styles.fieldLabel}>Adresse</Text>
          <TextInput style={styles.editInput} value={address} onChangeText={setAddress} placeholder="Musterstr. 1, 12345 Stadt" placeholderTextColor="#7A90AE" />
          <Text style={styles.fieldLabel}>Standort *</Text>
          <View style={styles.typeRow}>
            {LOCATIONS.map(loc => (
              <TouchableOpacity
                key={loc}
                style={[styles.typeChip, location === loc && styles.typeChipActive]}
                onPress={() => setLocation(loc)}
                activeOpacity={0.7}
              >
                <Text style={[styles.typeChipText, location === loc && styles.typeChipTextActive]}>{loc}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.fieldLabel}>Geburtsdatum (YYYY-MM-DD)</Text>
          <TextInput style={styles.editInput} value={birthDate} onChangeText={setBirthDate} placeholder="2010-05-15" placeholderTextColor="#7A90AE" />
          {error && <Text style={styles.fieldError}>{error}</Text>}
          <View style={styles.editBtns}>
            <TouchableOpacity style={[styles.saveBtn, { flex: 1 }, loading && { opacity: 0.6 }]} onPress={doSave} disabled={loading} activeOpacity={0.7}>
              <Text style={styles.saveBtnText}>{loading ? 'Speichern...' : 'Speichern'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.cancelEditBtn, { flex: 1 }]} onPress={() => setEditing(false)} activeOpacity={0.7}>
              <Text style={styles.cancelEditText}>Abbrechen</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <>
          <View style={styles.activeRow}>
            <View style={styles.activeRowLeft}>
              <View style={[styles.statusDot, { backgroundColor: customer.is_active ? '#22C55E' : '#9CA3AF' }]} />
              <Text style={styles.activeLabel}>{customer.is_active ? 'Aktiv' : 'Inaktiv'}</Text>
            </View>
            <Switch
              value={customer.is_active}
              onValueChange={doToggleActive}
              disabled={activeLoading}
              trackColor={{ false: '#E5E7EB', true: '#22C55E' }}
              thumbColor="#fff"
            />
          </View>
          <InfoRow label="E-Mail" value={customer.email} />
          <InfoRow label="Telefon" value={customer.phone} />
          {customer.parent_name && <InfoRow label="Elternname" value={customer.parent_name} />}
          <InfoRow label="Geburtsdatum" value={customer.birth_date} />
          {birthYear && <InfoRow label="Jahrgang" value={String(birthYear)} />}
          {customer.location && <InfoRow label="Standort" value={customer.location} />}
          <InfoRow label="Spielertyp" value={isTorwart ? 'Torwart' : customer.player_type === 'feldspieler' ? 'Feldspieler' : '—'} />
          <TouchableOpacity style={styles.editProfileBtn} onPress={startEditing} activeOpacity={0.7}>
            <Text style={styles.editProfileBtnText}>Bearbeiten</Text>
          </TouchableOpacity>
        </>
      )}
    </SectionCard>
  );
}
