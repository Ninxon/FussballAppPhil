import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Linking, ActivityIndicator, Platform,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { TrainerProfile } from '../hooks/useAdminData';
import { webInputReset } from '../../styles/webInput';

type TrainerVideo = {
  id: string;
  trainer_id: string;
  title: string;
  url: string;
  description: string | null;
  storage_path: string | null;
  created_at: string;
};

interface Props {
  trainers: TrainerProfile[];
}

export function TrainerVideosScreen({ trainers }: Props) {
  const [selectedTrainerId, setSelectedTrainerId] = useState<string | null>(
    trainers.length > 0 ? trainers[0].id : null,
  );
  const [videos, setVideos] = useState<TrainerVideo[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(false);

  // Formular
  const [showForm, setShowForm] = useState(false);
  const [uploadMode, setUploadMode] = useState<'file' | 'url'>('file');
  const [formTitle, setFormTitle] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Löschen
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!selectedTrainerId) return;
    setLoadingVideos(true);
    supabase
      .from('trainer_videos')
      .select('id, trainer_id, title, url, description, storage_path, created_at')
      .eq('trainer_id', selectedTrainerId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setVideos((data ?? []) as TrainerVideo[]);
        setLoadingVideos(false);
      });
  }, [selectedTrainerId]);

  const resetForm = () => {
    setFormTitle('');
    setFormUrl('');
    setFormDesc('');
    setSelectedFile(null);
    setFormError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAddVideo = async () => {
    setFormError(null);
    if (!formTitle.trim()) { setFormError('Bitte einen Titel eingeben.'); return; }
    if (uploadMode === 'url' && !formUrl.trim()) { setFormError('Bitte eine URL eingeben.'); return; }
    if (uploadMode === 'file' && !selectedFile) { setFormError('Bitte eine Videodatei auswählen.'); return; }
    if (!selectedTrainerId) return;

    setUploading(true);
    const { data: { user } } = await supabase.auth.getUser();

    let videoUrl = formUrl.trim();
    let storagePath: string | null = null;

    if (uploadMode === 'file' && selectedFile) {
      const ext = selectedFile.name.split('.').pop() ?? 'mp4';
      storagePath = `${selectedTrainerId}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('trainer-videos')
        .upload(storagePath, selectedFile, { contentType: selectedFile.type, upsert: false });
      if (uploadError) {
        setFormError(`Upload fehlgeschlagen: ${uploadError.message}`);
        setUploading(false);
        return;
      }
      const { data: urlData } = supabase.storage.from('trainer-videos').getPublicUrl(storagePath);
      videoUrl = urlData.publicUrl;
    }

    const { data, error } = await supabase
      .from('trainer_videos')
      .insert({
        trainer_id: selectedTrainerId,
        title: formTitle.trim(),
        url: videoUrl,
        description: formDesc.trim() || null,
        storage_path: storagePath,
        created_by: user?.id ?? null,
      })
      .select('id, trainer_id, title, url, description, storage_path, created_at')
      .single();

    setUploading(false);

    if (error) { setFormError(error.message); return; }
    if (data) {
      setVideos(prev => [data as TrainerVideo, ...prev]);
      resetForm();
      setShowForm(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleteError(null);
    setDeletingId(id);
    const video = videos.find(v => v.id === id);

    // Datei aus Storage löschen (falls vorhanden)
    if (video?.storage_path) {
      const { error: storageError } = await supabase.storage
        .from('trainer-videos')
        .remove([video.storage_path]);
      if (storageError) {
        setDeleteError(`Speicher-Fehler: ${storageError.message}`);
        setDeletingId(null);
        return;
      }
    }

    const { error } = await supabase.from('trainer_videos').delete().eq('id', id);
    setDeletingId(null);
    if (error) { setDeleteError(error.message); return; }
    setVideos(prev => prev.filter(v => v.id !== id));
  };

  const selectedTrainer = trainers.find(t => t.id === selectedTrainerId);

  return (
    <View style={styles.root}>
      {/* Verstecktes File-Input (nur Web) */}
      {Platform.OS === 'web' && (
        <input
          ref={fileInputRef as any}
          type="file"
          accept="video/mp4,video/webm,video/quicktime,video/x-msvideo,video/x-matroska"
          style={{ display: 'none' }}
          onChange={(e: any) => {
            const file = e.target.files?.[0] ?? null;
            setSelectedFile(file);
            setFormError(null);
          }}
        />
      )}

      {/* Trainer-Sidebar */}
      <View style={styles.trainerList}>
        <Text style={styles.trainerListTitle}>Trainer</Text>
        {trainers.length === 0 && (
          <Text style={styles.emptyTrainers}>Keine Trainer vorhanden.</Text>
        )}
        {trainers.map(t => (
          <TouchableOpacity
            key={t.id}
            style={[styles.trainerItem, selectedTrainerId === t.id && styles.trainerItemActive]}
            onPress={() => {
              setSelectedTrainerId(t.id);
              setShowForm(false);
              resetForm();
              setDeleteError(null);
            }}
            activeOpacity={0.7}
          >
            <View style={styles.trainerAvatar}>
              <Text style={styles.trainerAvatarText}>
                {t.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
              </Text>
            </View>
            <Text
              style={[styles.trainerName, selectedTrainerId === t.id && styles.trainerNameActive]}
              numberOfLines={1}
            >
              {t.full_name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Video-Bereich */}
      <ScrollView style={styles.main} contentContainerStyle={styles.mainContent}>
        {selectedTrainer ? (
          <>
            <View style={styles.mainHeader}>
              <View>
                <Text style={styles.mainTitle}>Videos – {selectedTrainer.full_name}</Text>
                <Text style={styles.mainSub}>{videos.length} {videos.length === 1 ? 'Video' : 'Videos'}</Text>
              </View>
              <TouchableOpacity
                style={styles.addBtn}
                onPress={() => { setShowForm(v => !v); resetForm(); }}
                activeOpacity={0.7}
              >
                <Text style={styles.addBtnText}>{showForm ? '✕ Abbrechen' : '+ Video hinzufügen'}</Text>
              </TouchableOpacity>
            </View>

            {showForm && (
              <View style={styles.form}>
                {/* Modus-Toggle */}
                <View style={styles.modeRow}>
                  <TouchableOpacity
                    style={[styles.modeChip, uploadMode === 'file' && styles.modeChipActive]}
                    onPress={() => { setUploadMode('file'); setFormError(null); }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.modeChipText, uploadMode === 'file' && styles.modeChipTextActive]}>
                      Datei hochladen
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modeChip, uploadMode === 'url' && styles.modeChipActive]}
                    onPress={() => { setUploadMode('url'); setFormError(null); }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.modeChipText, uploadMode === 'url' && styles.modeChipTextActive]}>
                      URL eingeben
                    </Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.fieldLabel}>Titel *</Text>
                <TextInput
                  style={styles.input}
                  value={formTitle}
                  onChangeText={setFormTitle}
                  placeholder="z.B. Dribbling-Übung"
                  placeholderTextColor="#7A90AE"
                />

                {uploadMode === 'file' ? (
                  <>
                    <Text style={styles.fieldLabel}>Videodatei * (max. 50 MB)</Text>
                    <TouchableOpacity
                      style={styles.filePickerBtn}
                      onPress={() => (fileInputRef.current as any)?.click()}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.filePickerText} numberOfLines={1}>
                        {selectedFile ? selectedFile.name : 'Datei auswählen...'}
                      </Text>
                      {selectedFile && (
                        <Text style={styles.filePickerSize}>
                          ({(selectedFile.size / 1024 / 1024).toFixed(1)} MB)
                        </Text>
                      )}
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Text style={styles.fieldLabel}>URL * (YouTube, Vimeo, Direktlink)</Text>
                    <TextInput
                      style={styles.input}
                      value={formUrl}
                      onChangeText={setFormUrl}
                      placeholder="https://..."
                      placeholderTextColor="#7A90AE"
                      autoCapitalize="none"
                    />
                  </>
                )}

                <Text style={styles.fieldLabel}>Beschreibung (optional)</Text>
                <TextInput
                  style={[styles.input, styles.inputMulti]}
                  value={formDesc}
                  onChangeText={setFormDesc}
                  placeholder="Kurze Beschreibung..."
                  placeholderTextColor="#7A90AE"
                  multiline
                  numberOfLines={3}
                />

                {formError && <Text style={styles.fieldError}>{formError}</Text>}

                <TouchableOpacity
                  style={[styles.saveBtn, uploading && { opacity: 0.6 }]}
                  onPress={handleAddVideo}
                  disabled={uploading}
                  activeOpacity={0.7}
                >
                  <Text style={styles.saveBtnText}>
                    {uploading
                      ? (uploadMode === 'file' ? 'Wird hochgeladen...' : 'Hinzufügen...')
                      : 'Video hinzufügen'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {deleteError && <Text style={styles.fieldError}>{deleteError}</Text>}

            {loadingVideos ? (
              <ActivityIndicator color="#4A8FE8" style={{ marginTop: 40 }} />
            ) : videos.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>Noch keine Videos für diesen Trainer.</Text>
                <Text style={styles.emptyHint}>Klicke auf „+ Video hinzufügen" um loszulegen.</Text>
              </View>
            ) : (
              videos.map(v => (
                <View key={v.id} style={styles.videoCard}>
                  <View style={styles.videoInfo}>
                    <View style={styles.videoTitleRow}>
                      <Text style={styles.videoTitle}>{v.title}</Text>
                      {v.storage_path && (
                        <View style={styles.uploadedBadge}>
                          <Text style={styles.uploadedBadgeText}>Hochgeladen</Text>
                        </View>
                      )}
                    </View>
                    {v.description && <Text style={styles.videoDesc}>{v.description}</Text>}
                    {!v.storage_path && (
                      <Text style={styles.videoUrl} numberOfLines={1}>{v.url}</Text>
                    )}
                  </View>
                  <View style={styles.videoActions}>
                    <TouchableOpacity
                      style={styles.openBtn}
                      onPress={() => Linking.openURL(v.url)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.openBtnText}>Öffnen</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.deleteBtn, deletingId === v.id && { opacity: 0.5 }]}
                      onPress={() => handleDelete(v.id)}
                      disabled={deletingId === v.id}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.deleteBtnText}>
                        {deletingId === v.id ? '...' : 'Löschen'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </>
        ) : (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>Bitte links einen Trainer auswählen.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: '#EEF3FB' },

  trainerList: {
    width: 220, backgroundColor: '#fff',
    borderRightWidth: 1, borderRightColor: 'rgba(21,34,56,0.08)', padding: 16,
  },
  trainerListTitle: { fontSize: 11, fontWeight: '700', color: '#7A90AE', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },
  emptyTrainers: { fontSize: 13, color: '#7A90AE', fontStyle: 'italic' },
  trainerItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 10, marginBottom: 4 },
  trainerItemActive: { backgroundColor: 'rgba(74,143,232,0.1)' },
  trainerAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#152238', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  trainerAvatarText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  trainerName: { fontSize: 14, fontWeight: '600', color: '#374151', flex: 1, minWidth: 0 },
  trainerNameActive: { color: '#4A8FE8', fontWeight: '700' },

  main: { flex: 1 },
  mainContent: { padding: 32, paddingBottom: 60 },
  mainHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 },
  mainTitle: { fontSize: 20, fontWeight: '800', color: '#152238' },
  mainSub: { fontSize: 13, color: '#7A90AE', marginTop: 4 },
  addBtn: { backgroundColor: 'rgba(74,143,232,0.08)', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(74,143,232,0.2)' },
  addBtnText: { fontSize: 13, fontWeight: '700', color: '#4A8FE8' },

  form: {
    backgroundColor: '#fff', borderRadius: 14, padding: 20, marginBottom: 20,
    shadowColor: '#152238', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6, elevation: 2,
    borderWidth: 1, borderColor: 'rgba(21,34,56,0.08)',
  },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  modeChip: { flex: 1, paddingVertical: 9, borderRadius: 8, borderWidth: 1.5, borderColor: 'rgba(21,34,56,0.08)', backgroundColor: '#F4F8FF', alignItems: 'center' },
  modeChipActive: { borderColor: '#4A8FE8', backgroundColor: 'rgba(74,143,232,0.08)' },
  modeChipText: { fontSize: 13, fontWeight: '700', color: '#7A90AE' },
  modeChipTextActive: { color: '#4A8FE8' },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#4A6080', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: '#F4F8FF', borderWidth: 1, borderColor: 'rgba(21,34,56,0.08)',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#152238', ...webInputReset,
  },
  inputMulti: { minHeight: 72, textAlignVertical: 'top' },
  filePickerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#F4F8FF', borderWidth: 1.5, borderColor: 'rgba(21,34,56,0.08)',
    borderRadius: 8, borderStyle: 'dashed', paddingHorizontal: 14, paddingVertical: 14,
  } as any,
  filePickerText: { flex: 1, fontSize: 14, color: '#374151', fontWeight: '500', minWidth: 0 },
  filePickerSize: { fontSize: 12, color: '#7A90AE', flexShrink: 0 },
  fieldError: { fontSize: 13, color: '#EF4444', fontWeight: '600', marginTop: 10 },
  saveBtn: {
    backgroundColor: '#152238', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 16,
    shadowColor: '#152238', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18, shadowRadius: 12, elevation: 6,
  },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  emptyBox: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 16, fontWeight: '700', color: '#374151', marginBottom: 8 },
  emptyHint: { fontSize: 13, color: '#7A90AE' },

  videoCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 18, marginBottom: 12,
    flexDirection: 'row', alignItems: 'center', gap: 16,
    shadowColor: '#152238', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6, elevation: 2,
    borderWidth: 1, borderColor: 'rgba(21,34,56,0.08)',
  },
  videoInfo: { flex: 1, minWidth: 0 },
  videoTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' },
  videoTitle: { fontSize: 15, fontWeight: '700', color: '#152238' },
  uploadedBadge: { backgroundColor: 'rgba(34,197,94,0.1)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  uploadedBadgeText: { fontSize: 11, fontWeight: '700', color: '#16A34A' },
  videoDesc: { fontSize: 13, color: '#4A6080', marginBottom: 4 },
  videoUrl: { fontSize: 12, color: '#7A90AE' },
  videoActions: { flexDirection: 'row', gap: 8, flexShrink: 0 },
  openBtn: { backgroundColor: 'rgba(74,143,232,0.08)', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(74,143,232,0.2)' },
  openBtnText: { fontSize: 13, fontWeight: '700', color: '#4A8FE8' },
  deleteBtn: { backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  deleteBtnText: { fontSize: 13, fontWeight: '700', color: '#EF4444' },
});
