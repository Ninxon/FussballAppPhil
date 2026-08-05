import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Linking } from 'react-native';
import { AdminVideoPackage, PackageAssignment, VideoAsset } from '../../../types';
import { TrainerProfile } from '../../hooks/useAdminData';
import { resolvePlaybackUrl } from '../../../services/videoService';
import { formatBytes } from '../../services/videoValidation';
import { VideoRow } from './VideoRow';
import { VideoUploadForm } from './VideoUploadForm';
import { TrainerAssignPanel } from './TrainerAssignPanel';
import { ConfirmBox } from './ConfirmBox';
import { styles } from './styles';

interface Props {
  pkg: AdminVideoPackage;
  trainers: TrainerProfile[];
  library: VideoAsset[];
  packageCounts: Record<string, number>;
  onRename: (title: string, description: string | null) => Promise<{ error: string | null }>;
  onDeletePackage: () => Promise<{ error: string | null }>;
  onUpload: (p: { title: string; description: string | null; file: File }) => Promise<{ error: string | null }>;
  onCreateLink: (p: { title: string; description: string | null; url: string }) => Promise<{ error: string | null }>;
  onAddFromLibrary: (videoId: string) => Promise<{ error: string | null }>;
  onRemoveVideo: (videoId: string) => Promise<{ error: string | null }>;
  onDeleteVideo: (video: VideoAsset) => Promise<{ error: string | null }>;
  onMoveVideo: (videoId: string, direction: -1 | 1) => Promise<{ error: string | null }>;
  onAssign: (assignments: PackageAssignment[]) => Promise<{ error: string | null }>;
}

type Pending =
  | { kind: 'deletePackage' }
  | { kind: 'deleteVideo'; video: VideoAsset }
  | null;

// Detailansicht eines Pakets: oben der Kopf, dann INHALT (welche Videos),
// darunter VERTEILUNG (welche Trainer) — die beiden Vorgaenge sind bewusst
// voneinander getrennt.
export function PackageDetail({
  pkg, trainers, library, packageCounts,
  onRename, onDeletePackage, onUpload, onCreateLink, onAddFromLibrary,
  onRemoveVideo, onDeleteVideo, onMoveVideo, onAssign,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(pkg.title);
  const [description, setDescription] = useState(pkg.description ?? '');
  const [showAdd, setShowAdd] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Paketwechsel: lokale Bearbeitung verwerfen.
  useEffect(() => {
    setEditing(false); setShowAdd(false); setPending(null); setError(null);
    setTitle(pkg.title); setDescription(pkg.description ?? '');
  }, [pkg.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalBytes = pkg.videos.reduce((sum, v) => sum + (v.size_bytes ?? 0), 0);
  const withTime = pkg.assignments.filter(a => a.scheduledTime).length;

  const doRename = async () => {
    if (!title.trim()) { setError('Bitte einen Namen eingeben.'); return; }
    setBusy(true); setError(null);
    const res = await onRename(title, description.trim() || null);
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    setEditing(false);
  };

  const openVideo = async (video: VideoAsset) => {
    setError(null);
    const { url, error: err } = await resolvePlaybackUrl(video);
    if (err || !url) { setError(err ?? 'Video konnte nicht geöffnet werden.'); return; }
    Linking.openURL(url);
  };

  const runPending = async () => {
    if (!pending) return;
    setBusy(true); setError(null);
    const res = pending.kind === 'deletePackage'
      ? await onDeletePackage()
      : await onDeleteVideo(pending.video);
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    setPending(null);
  };

  return (
    <>
      {/* ── Kopf ── */}
      <View style={styles.card}>
        {editing ? (
          <>
            <Text style={styles.fieldLabel}>Name des Pakets *</Text>
            <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholderTextColor="#7A90AE" />
            <Text style={styles.fieldLabel}>Beschreibung</Text>
            <TextInput
              style={[styles.input, styles.inputMulti]}
              value={description}
              onChangeText={setDescription}
              placeholder="Wofür ist dieses Paket gedacht?"
              placeholderTextColor="#7A90AE"
              multiline
            />
            {error && <Text style={styles.errorText}>{error}</Text>}
            <TouchableOpacity
              style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
              onPress={doRename}
              disabled={busy}
              activeOpacity={0.7}
            >
              <Text style={styles.primaryBtnText}>{busy ? 'Wird gespeichert…' : 'Speichern'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.neutralBtn, { marginTop: 8 }]}
              onPress={() => {
                setEditing(false); setError(null);
                setTitle(pkg.title); setDescription(pkg.description ?? '');
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.neutralBtnText}>Abbrechen</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.cardTitleRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.pageTitle}>{pkg.title}</Text>
                <Text style={styles.pageSub}>
                  {pkg.videos.length} {pkg.videos.length === 1 ? 'Video' : 'Videos'}
                  {totalBytes > 0 ? ` · ${formatBytes(totalBytes)}` : ''}
                  {' · '}
                  {pkg.assignments.length === 0
                    ? 'noch nicht verteilt'
                    : `an ${pkg.assignments.length} Trainer verteilt`}
                  {withTime > 0 ? ` · ${withTime} mit Uhrzeit` : ''}
                </Text>
                {pkg.description ? <Text style={[styles.hint, { marginTop: 8 }]}>{pkg.description}</Text> : null}
              </View>
              <View style={{ flexDirection: 'row', gap: 8, flexShrink: 0 }}>
                <TouchableOpacity style={styles.ghostBtn} onPress={() => setEditing(true)} activeOpacity={0.7}>
                  <Text style={styles.ghostBtnText}>Bearbeiten</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.dangerBtn}
                  onPress={() => { setPending({ kind: 'deletePackage' }); setError(null); }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.dangerBtnText}>Paket löschen</Text>
                </TouchableOpacity>
              </View>
            </View>
            {error && !pending && <Text style={styles.errorText}>{error}</Text>}
          </>
        )}

        {pending?.kind === 'deletePackage' && (
          <ConfirmBox
            title="Paket löschen?"
            text={
              pkg.assignments.length > 0
                ? `${pkg.assignments.length} ${pkg.assignments.length === 1 ? 'Trainer verliert' : 'Trainer verlieren'} den Zugriff. `
                  + 'Die Videos bleiben in der Bibliothek erhalten und können weiter verwendet werden.'
                : 'Die Videos bleiben in der Bibliothek erhalten und können weiter verwendet werden.'
            }
            confirmLabel="Ja, Paket löschen"
            loading={busy}
            error={error}
            onConfirm={runPending}
            onCancel={() => { setPending(null); setError(null); }}
          />
        )}
      </View>

      {/* ── Inhalt ── */}
      <View style={styles.card}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitle}>Inhalt</Text>
          <TouchableOpacity style={styles.ghostBtn} onPress={() => setShowAdd(v => !v)} activeOpacity={0.7}>
            <Text style={styles.ghostBtnText}>{showAdd ? '✕ Abbrechen' : '+ Video hinzufügen'}</Text>
          </TouchableOpacity>
        </View>

        {pkg.videos.length === 0 && !showAdd && (
          <Text style={styles.emptyHint}>Noch keine Videos in diesem Paket.</Text>
        )}

        {pkg.videos.map((v, i) => (
          <VideoRow
            key={v.id}
            video={v}
            position={i}
            isFirst={i === 0}
            isLast={i === pkg.videos.length - 1}
            packageCount={packageCounts[v.id] ?? 1}
            onMove={dir => onMoveVideo(v.id, dir)}
            onOpen={() => openVideo(v)}
            onRemoveFromPackage={() => onRemoveVideo(v.id)}
            onDeleteForever={() => { setPending({ kind: 'deleteVideo', video: v }); setError(null); }}
          />
        ))}

        {pending?.kind === 'deleteVideo' && (
          <ConfirmBox
            title={`„${pending.video.title}" endgültig löschen?`}
            text={
              (packageCounts[pending.video.id] ?? 1) > 1
                ? `Das Video wird aus ${packageCounts[pending.video.id]} Paketen entfernt`
                  + (pending.video.storage_path
                    ? ` und die Datei (${formatBytes(pending.video.size_bytes ?? 0)}) unwiderruflich gelöscht.`
                    : ' und der Bibliothekseintrag gelöscht.')
                : pending.video.storage_path
                  ? `Die Datei (${formatBytes(pending.video.size_bytes ?? 0)}) wird unwiderruflich gelöscht.`
                  : 'Der Bibliothekseintrag wird gelöscht. Soll das Video nur aus diesem Paket verschwinden, „Entfernen" verwenden.'
            }
            confirmLabel="Ja, endgültig löschen"
            loading={busy}
            error={error}
            onConfirm={runPending}
            onCancel={() => { setPending(null); setError(null); }}
          />
        )}
      </View>

      {showAdd && (
        <VideoUploadForm
          library={library}
          alreadyInPackage={pkg.videos.map(v => v.id)}
          onUpload={onUpload}
          onCreateLink={onCreateLink}
          onAddFromLibrary={onAddFromLibrary}
          onClose={() => setShowAdd(false)}
        />
      )}

      {/* ── Verteilung ── */}
      <TrainerAssignPanel trainers={trainers} assigned={pkg.assignments} onSave={onAssign} />
    </>
  );
}
