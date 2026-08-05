import React, { useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { TrainerProfile } from '../hooks/useAdminData';
import { useVideoPackages } from '../hooks/useVideoPackages';
import { PackageList } from './videoPakete/PackageList';
import { PackageDetail } from './videoPakete/PackageDetail';
import { StorageMeter } from './videoPakete/StorageMeter';
import { C } from './videoPakete/theme';
import { styles } from './videoPakete/styles';

interface Props {
  trainers: TrainerProfile[];
}

// Video-Pakete: links der dauerhafte Paketkatalog, rechts das gewaehlte
// Paket. Ein Paket wird einmal gebaut und beliebig oft an Trainer verteilt —
// deshalb sind Inhalt und Verteilung in der Detailansicht getrennt.
export function VideoPaketeScreen({ trainers }: Props) {
  const vp = useVideoPackages();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = vp.packages.find(p => p.id === selectedId)
    ?? (selectedId === null ? vp.packages[0] : undefined);

  if (vp.loading) {
    return <ActivityIndicator style={{ flex: 1 }} color={C.accent} size="large" />;
  }

  return (
    <View style={styles.root}>
      <PackageList
        packages={vp.packages}
        selectedId={selected?.id ?? null}
        onSelect={setSelectedId}
        onCreate={async title => {
          const res = await vp.createPackage(title, null);
          if (!res.error && res.id) setSelectedId(res.id);
          return { error: res.error };
        }}
        onDuplicate={async pkg => {
          const res = await vp.duplicatePackage(pkg);
          if (!res.error && res.id) setSelectedId(res.id);
          return { error: res.error };
        }}
      />

      <ScrollView style={styles.main} contentContainerStyle={styles.mainContent}>
        {vp.loadError && <Text style={styles.errorText}>{vp.loadError}</Text>}

        <StorageMeter usage={vp.usage} onCleanupOrphans={vp.cleanupOrphans} />

        {!selected ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>Noch kein Paket ausgewählt</Text>
            <Text style={styles.emptyHint}>
              Links ein Paket anlegen oder auswählen. Ein Paket wird einmal zusammengestellt und
              bleibt dauerhaft bestehen — es lässt sich jederzeit an weitere Trainer verteilen,
              ohne die Videos erneut hochzuladen.
            </Text>
          </View>
        ) : (
          <PackageDetail
            pkg={selected}
            trainers={trainers}
            library={vp.library}
            packageCounts={vp.packageCounts}
            onRename={(title, description) => vp.updatePackage(selected.id, { title, description })}
            onDeletePackage={async () => {
              const res = await vp.deletePackage(selected.id);
              if (!res.error) setSelectedId(null);
              return res;
            }}
            onUpload={p => vp.uploadVideo({ ...p, packageId: selected.id })}
            onCreateLink={p => vp.createLinkVideo({ ...p, packageId: selected.id })}
            onAddFromLibrary={videoId => vp.addVideoToPackage(selected.id, videoId)}
            onRemoveVideo={videoId => vp.removeVideoFromPackage(selected.id, videoId)}
            onDeleteVideo={video => vp.deleteVideo(video)}
            onMoveVideo={(videoId, dir) => vp.moveVideo(selected.id, videoId, dir)}
            onAssign={assignments => vp.setPackageTrainers(selected.id, assignments)}
          />
        )}
      </ScrollView>
    </View>
  );
}
