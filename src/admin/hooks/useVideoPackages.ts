import { useState, useEffect, useCallback } from 'react';
import { AdminVideoPackage, PackageAssignment, VideoAsset, VideoStorageUsage } from '../../types';
import { MutationResult } from './useAdminData';
import * as svc from '../services/videoPackageService';

/**
 * Zustandsverwaltung der Video-Pakete. Alle Mutationen liefern den im Admin
 * einheitlichen Vertrag `MutationResult = { error: string | null }` und laden
 * anschließend den betroffenen Ausschnitt neu.
 */
export function useVideoPackages() {
  const [packages, setPackages] = useState<AdminVideoPackage[]>([]);
  const [library, setLibrary] = useState<VideoAsset[]>([]);
  const [usage, setUsage] = useState<VideoStorageUsage | null>(null);
  const [packageCounts, setPackageCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [pkgs, lib, counts] = await Promise.all([
        svc.fetchPackages(),
        svc.fetchLibrary(),
        svc.fetchPackageCountsByVideo(),
      ]);
      if (!pkgs.ok || !lib.ok || !counts.ok) {
        setLoadError(
          (!pkgs.ok && pkgs.error) || (!lib.ok && lib.error) || (!counts.ok && counts.error) || null,
        );
      }
      if (pkgs.ok) setPackages(pkgs.data);
      if (lib.ok) setLibrary(lib.data);
      if (counts.ok) setPackageCounts(counts.data);
    } catch (e) {
      setLoadError((e as { message?: string })?.message ?? 'Daten konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Die Speicherbelegung kommt getrennt: sie darf fehlschlagen (z. B. wenn die
  // RPC noch nicht deployt ist), ohne die Paketliste mitzureißen.
  const refreshUsage = useCallback(async () => {
    const res = await svc.fetchStorageUsage();
    if (res.ok) setUsage(res.data);
  }, []);

  useEffect(() => { load(); refreshUsage(); }, [load, refreshUsage]);

  // ── Pakete ───────────────────────────────────────────────────────────────

  const createPackage = async (title: string, description: string | null): Promise<MutationResult & { id?: string }> => {
    const res = await svc.createPackage(title, description);
    if (!res.ok) return { error: res.error };
    await load();
    return { error: null, id: res.data };
  };

  const updatePackage = async (
    packageId: string, fields: { title?: string; description?: string | null },
  ): Promise<MutationResult> => {
    const { error } = await svc.updatePackage(packageId, fields);
    if (error) return { error };
    setPackages(prev => prev.map(p => p.id === packageId ? { ...p, ...fields } as AdminVideoPackage : p));
    return { error: null };
  };

  const deletePackage = async (packageId: string): Promise<MutationResult> => {
    const { error } = await svc.deletePackage(packageId);
    if (error) return { error };
    setPackages(prev => prev.filter(p => p.id !== packageId));
    await load();
    return { error: null };
  };

  const duplicatePackage = async (source: AdminVideoPackage): Promise<MutationResult & { id?: string }> => {
    const res = await svc.duplicatePackage(source);
    if (!res.ok) return { error: res.error };
    await load();
    return { error: null, id: res.data };
  };

  // ── Paketinhalt ──────────────────────────────────────────────────────────

  const addVideoToPackage = async (packageId: string, videoId: string): Promise<MutationResult> => {
    const pkg = packages.find(p => p.id === packageId);
    const { error } = await svc.addVideoToPackage(packageId, videoId, pkg?.videos.length ?? 0);
    if (error) return { error };
    await load();
    return { error: null };
  };

  const removeVideoFromPackage = async (packageId: string, videoId: string): Promise<MutationResult> => {
    const { error } = await svc.removeVideoFromPackage(packageId, videoId);
    if (error) return { error };
    await load();
    return { error: null };
  };

  const moveVideo = async (packageId: string, videoId: string, direction: -1 | 1): Promise<MutationResult> => {
    const pkg = packages.find(p => p.id === packageId);
    if (!pkg) return { error: 'Paket nicht gefunden.' };
    const ids = pkg.videos.map(v => v.id);
    const from = ids.indexOf(videoId);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= ids.length) return { error: null };
    ids.splice(to, 0, ids.splice(from, 1)[0]);

    // Optimistisch umsortieren, damit die Liste sofort reagiert.
    setPackages(prev => prev.map(p => p.id === packageId
      ? { ...p, videos: ids.map(id => p.videos.find(v => v.id === id)!).filter(Boolean) }
      : p));

    const { error } = await svc.reorderPackageVideos(packageId, ids);
    if (error) { await load(); return { error }; }
    return { error: null };
  };

  // ── Verteilung ───────────────────────────────────────────────────────────

  const setPackageTrainers = async (
    packageId: string, assignments: PackageAssignment[],
  ): Promise<MutationResult> => {
    const current = packages.find(p => p.id === packageId)?.assignments ?? [];
    const { error } = await svc.setPackageTrainers(packageId, assignments, current);
    if (error) {
      // Upsert und Delete laufen ohne Transaktionsklammer: das erste kann
      // geglückt und das zweite gescheitert sein. Ohne diesen Reload zeigte
      // die Oberfläche danach einen Zustand, den es in der Datenbank nicht gibt.
      await load();
      return { error };
    }
    setPackages(prev => prev.map(p => p.id === packageId ? { ...p, assignments } : p));
    return { error: null };
  };

  // ── Bibliothek ───────────────────────────────────────────────────────────

  const uploadVideo = async (params: {
    title: string; description: string | null; file: File; packageId?: string;
  }): Promise<MutationResult> => {
    const res = await svc.uploadVideo(params);
    if (!res.ok) return { error: res.error };
    if (params.packageId) {
      const pkg = packages.find(p => p.id === params.packageId);
      const add = await svc.addVideoToPackage(params.packageId, res.data.id, pkg?.videos.length ?? 0);
      if (add.error) { await load(); await refreshUsage(); return { error: add.error }; }
    }
    await load();
    await refreshUsage();
    return { error: null };
  };

  const createLinkVideo = async (params: {
    title: string; description: string | null; url: string; packageId?: string;
  }): Promise<MutationResult> => {
    const res = await svc.createLinkVideo(params);
    if (!res.ok) return { error: res.error };
    if (params.packageId) {
      const pkg = packages.find(p => p.id === params.packageId);
      const add = await svc.addVideoToPackage(params.packageId, res.data.id, pkg?.videos.length ?? 0);
      if (add.error) { await load(); return { error: add.error }; }
    }
    await load();
    return { error: null };
  };

  const deleteVideo = async (video: VideoAsset): Promise<MutationResult> => {
    const { error } = await svc.deleteVideo(video);
    if (error) return { error };
    await load();
    await refreshUsage();
    return { error: null };
  };

  const cleanupOrphans = async (): Promise<MutationResult & { removed?: number }> => {
    const res = await svc.cleanupOrphans();
    if (!res.ok) return { error: res.error };
    await refreshUsage();
    return { error: null, removed: res.data };
  };

  return {
    packages, library, usage, packageCounts, loading, loadError,
    createPackage, updatePackage, deletePackage, duplicatePackage,
    addVideoToPackage, removeVideoFromPackage, moveVideo,
    setPackageTrainers,
    uploadVideo, createLinkVideo, deleteVideo, cleanupOrphans,
    reload: load,
  };
}
