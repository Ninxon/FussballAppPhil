import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { supabase } from '../../lib/supabase';
import { TrainerProfile } from '../types';
import { styles } from '../styles';

export function ProfilTab({ profile }: { profile: TrainerProfile }) {
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
