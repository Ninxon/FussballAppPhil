import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { VideoAsset } from '../../../types';
import { formatBytes } from '../../services/videoValidation';
import { styles } from './styles';

interface Props {
  video: VideoAsset;
  position: number;
  isFirst: boolean;
  isLast: boolean;
  /** In wie vielen Paketen liegt das Video insgesamt? */
  packageCount: number;
  onMove: (direction: -1 | 1) => void;
  onOpen: () => void;
  onRemoveFromPackage: () => void;
  onDeleteForever: () => void;
}

// Eine Videozeile im Paket. Zwei klar getrennte Loeschwege: aus dem Paket
// nehmen (Datei bleibt) oder endgueltig loeschen (Datei weg).
export function VideoRow({
  video, position, isFirst, isLast, packageCount,
  onMove, onOpen, onRemoveFromPackage, onDeleteForever,
}: Props) {
  const isUpload = !!video.storage_path;

  return (
    <View style={styles.videoRow}>
      <Text style={styles.videoPos}>{position + 1}.</Text>

      <View style={styles.videoInfo}>
        <View style={styles.videoTitleRow}>
          <Text style={styles.videoTitle} numberOfLines={1}>{video.title}</Text>
          <View style={[styles.badge, isUpload ? styles.badgeUpload : styles.badgeLink]}>
            <Text style={isUpload ? styles.badgeUploadText : styles.badgeLinkText}>
              {isUpload ? 'Hochgeladen' : 'Link'}
            </Text>
          </View>
        </View>
        <Text style={styles.videoMeta} numberOfLines={1}>
          {isUpload && video.size_bytes ? formatBytes(video.size_bytes) : video.url ?? ''}
          {packageCount > 1 ? ` · in ${packageCount} Paketen` : ''}
        </Text>
      </View>

      <View style={styles.videoActions}>
        <TouchableOpacity
          style={[styles.iconBtn, isFirst && { opacity: 0.35 }]}
          onPress={() => onMove(-1)}
          disabled={isFirst}
          activeOpacity={0.7}
        >
          <Text style={styles.iconBtnText}>↑</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.iconBtn, isLast && { opacity: 0.35 }]}
          onPress={() => onMove(1)}
          disabled={isLast}
          activeOpacity={0.7}
        >
          <Text style={styles.iconBtnText}>↓</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onOpen} activeOpacity={0.7}>
          <Text style={styles.linkAction}>Öffnen</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onRemoveFromPackage} activeOpacity={0.7}>
          <Text style={styles.linkAction}>Entfernen</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onDeleteForever} activeOpacity={0.7}>
          <Text style={styles.linkActionDanger}>Löschen</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
