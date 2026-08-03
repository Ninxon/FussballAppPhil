import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Platform, ScrollView } from 'react-native';
import { VideoAsset } from '../../../types';
import {
  validateVideoUpload, formatBytes, MAX_UPLOAD_BYTES, ALLOWED_VIDEO_MIME, UploadMode,
} from '../../services/videoValidation';
import { styles } from './styles';

interface Props {
  /** Bibliothek für den Modus „Aus Bibliothek" (kostet keinen Speicher). */
  library: VideoAsset[];
  /** Ids, die bereits im Paket liegen — werden ausgeblendet. */
  alreadyInPackage: string[];
  onUpload: (p: { title: string; description: string | null; file: File }) => Promise<{ error: string | null }>;
  onCreateLink: (p: { title: string; description: string | null; url: string }) => Promise<{ error: string | null }>;
  onAddFromLibrary: (videoId: string) => Promise<{ error: string | null }>;
  onClose: () => void;
}

const isWeb = Platform.OS === 'web';

// Fügt dem Paket ein Video hinzu: neu hochladen, als externen Link anlegen
// oder ein vorhandenes aus der Bibliothek übernehmen.
export function VideoUploadForm({
  library, alreadyInPackage, onUpload, onCreateLink, onAddFromLibrary, onClose,
}: Props) {
  const [mode, setMode] = useState<UploadMode>(isWeb ? 'file' : 'url');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const available = library.filter(v => !alreadyInPackage.includes(v.id));

  const reset = () => {
    setTitle(''); setDescription(''); setUrl(''); setFile(null); setError(null);
  };

  const submit = async () => {
    const problem = validateVideoUpload({
      title, mode,
      file: file ? { name: file.name, size: file.size, type: file.type } : null,
      url,
    });
    if (problem) { setError(problem); return; }

    setBusy(true);
    setError(null);
    const desc = description.trim() || null;
    const res = mode === 'file'
      ? await onUpload({ title, description: desc, file: file! })
      : await onCreateLink({ title, description: desc, url });
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    reset();
    onClose();
  };

  const addExisting = async (videoId: string) => {
    setBusy(true);
    setError(null);
    const res = await onAddFromLibrary(videoId);
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    onClose();
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Video hinzufügen</Text>

      <View style={styles.modeRow}>
        {([
          ['file', 'Datei hochladen'],
          ['url', 'Externer Link'],
          ['library', 'Aus Bibliothek'],
        ] as [UploadMode, string][]).map(([id, label]) => (
          <TouchableOpacity
            key={id}
            style={[styles.modeChip, mode === id && styles.modeChipActive]}
            onPress={() => { setMode(id); setError(null); }}
            activeOpacity={0.7}
          >
            <Text style={[styles.modeChipText, mode === id && styles.modeChipTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {mode === 'library' ? (
        <>
          <Text style={styles.cardHint}>
            Ein bereits hochgeladenes Video zusätzlich in dieses Paket legen — das belegt keinen weiteren Speicher.
          </Text>
          {available.length === 0 ? (
            <Text style={styles.emptyHint}>
              {library.length === 0
                ? 'Die Bibliothek ist noch leer.'
                : 'Alle vorhandenen Videos liegen bereits in diesem Paket.'}
            </Text>
          ) : (
            <ScrollView style={{ maxHeight: 260 }}>
              {available.map(v => (
                <View key={v.id} style={styles.videoRow}>
                  <View style={styles.videoInfo}>
                    <View style={styles.videoTitleRow}>
                      <Text style={styles.videoTitle} numberOfLines={1}>{v.title}</Text>
                      <View style={[styles.badge, v.storage_path ? styles.badgeUpload : styles.badgeLink]}>
                        <Text style={v.storage_path ? styles.badgeUploadText : styles.badgeLinkText}>
                          {v.storage_path ? 'Hochgeladen' : 'Link'}
                        </Text>
                      </View>
                    </View>
                    {v.storage_path && v.size_bytes ? (
                      <Text style={styles.videoMeta}>{formatBytes(v.size_bytes)}</Text>
                    ) : null}
                  </View>
                  <TouchableOpacity
                    style={[styles.ghostBtn, busy && { opacity: 0.6 }]}
                    onPress={() => addExisting(v.id)}
                    disabled={busy}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.ghostBtnText}>Hinzufügen</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}
        </>
      ) : (
        <>
          <Text style={styles.fieldLabel}>Titel *</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={t => { setTitle(t); setError(null); }}
            placeholder="z. B. Innenseitstoß"
            placeholderTextColor="#7A90AE"
          />

          <Text style={styles.fieldLabel}>Beschreibung</Text>
          <TextInput
            style={[styles.input, styles.inputMulti]}
            value={description}
            onChangeText={setDescription}
            placeholder="Worauf soll der Trainer achten?"
            placeholderTextColor="#7A90AE"
            multiline
          />

          {mode === 'url' ? (
            <>
              <Text style={styles.fieldLabel}>Video-URL *</Text>
              <TextInput
                style={styles.input}
                value={url}
                onChangeText={u => { setUrl(u); setError(null); }}
                placeholder="https://…"
                placeholderTextColor="#7A90AE"
                autoCapitalize="none"
              />
            </>
          ) : (
            <>
              <Text style={styles.fieldLabel}>Videodatei * (max. {formatBytes(MAX_UPLOAD_BYTES)})</Text>
              {isWeb ? (
                <>
                  {/* @ts-ignore Web-only: RN kennt kein <input> */}
                  <input
                    ref={fileInputRef as never}
                    type="file"
                    accept={ALLOWED_VIDEO_MIME.join(',')}
                    style={{ display: 'none' }}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      setFile(e.target.files?.[0] ?? null);
                      setError(null);
                    }}
                  />
                  <TouchableOpacity
                    style={styles.filePickerBtn}
                    onPress={() => fileInputRef.current?.click()}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.filePickerText} numberOfLines={1}>
                      {file ? file.name : 'Datei auswählen…'}
                    </Text>
                    {file && <Text style={styles.filePickerSize}>{formatBytes(file.size)}</Text>}
                  </TouchableOpacity>
                  <Text style={styles.hint}>
                    Vor dem Hochladen auf 1080p (ca. 5 Mbit/s) exportieren — Handy-Rohmaterial ist
                    schnell zehnmal so groß und belastet Speicher und Datenvolumen der Trainer.
                  </Text>
                </>
              ) : (
                // Der Datei-Dialog existiert nur im Browser. Frueher tat der
                // Button auf Mobilgeraeten stillschweigend nichts.
                <Text style={styles.emptyHint}>
                  Das Hochladen von Dateien ist nur in der Web-Ansicht des Admin-Bereichs möglich.
                  Auf dem Handy stattdessen „Externer Link" verwenden.
                </Text>
              )}
            </>
          )}

          {error && <Text style={styles.errorText}>{error}</Text>}

          {(mode === 'url' || isWeb) && (
            <TouchableOpacity
              style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
              onPress={submit}
              disabled={busy}
              activeOpacity={0.7}
            >
              <Text style={styles.primaryBtnText}>
                {busy ? (mode === 'file' ? 'Wird hochgeladen…' : 'Wird gespeichert…') : 'Zum Paket hinzufügen'}
              </Text>
            </TouchableOpacity>
          )}
        </>
      )}

      <TouchableOpacity style={[styles.neutralBtn, { marginTop: 10 }]} onPress={onClose} activeOpacity={0.7}>
        <Text style={styles.neutralBtnText}>Schließen</Text>
      </TouchableOpacity>
    </View>
  );
}
