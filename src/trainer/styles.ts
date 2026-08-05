import { StyleSheet } from 'react-native';
import { webInputReset } from '../styles/webInput';

// Styles des Trainer-Bereichs, unveraendert aus TrainerApp.tsx uebernommen.
export const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F6F9' },
  header: {
    backgroundColor: '#1C2133',
    paddingHorizontal: 24,
    paddingTop: 52,
    paddingBottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: '600', marginBottom: 2 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#fff' },
  logoutBtn: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
  logoutText: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.7)' },
  content: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 40 },

  // Termine
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  empty: { fontSize: 14, color: '#9CA3AF', paddingVertical: 12 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardBody: { flex: 1 },
  cardProgram: { fontSize: 15, fontWeight: '700', marginBottom: 3 },
  cardDate: { fontSize: 13, color: '#6B7280' },
  countBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, flexShrink: 0 },
  countText: { fontSize: 13, fontWeight: '800' },

  // Slot-Mitglieder
  memberList: { marginTop: 12, borderTopWidth: 1, borderTopColor: '#F1F3F7', paddingTop: 10, gap: 8 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  levelDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  memberName: { fontSize: 14, fontWeight: '600', color: '#1F2937', flex: 1 },
  memberLevel: { fontSize: 11, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.3 },

  // Profil
  profileCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#1C2133',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText: { fontSize: 26, fontWeight: '800', color: '#fff' },
  profileName: { fontSize: 20, fontWeight: '800', color: '#111827', marginBottom: 6 },
  specialtyBadge: { backgroundColor: '#EEF2FF', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4, marginBottom: 8 },
  specialtyText: { fontSize: 13, fontWeight: '700', color: '#4A7FD4' },
  profileEmail: { fontSize: 13, color: '#9CA3AF' },

  section: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 14, marginBottom: 6 },
  input: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: '#111827', ...webInputReset },
  successBox: { backgroundColor: '#F0FDF4', borderRadius: 8, padding: 12, marginBottom: 4 },
  successText: { fontSize: 13, fontWeight: '700', color: '#15803D' },
  errorText: { fontSize: 13, color: '#EF4444', fontWeight: '600', marginTop: 10 },
  saveBtn: { backgroundColor: '#4A7FD4', borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 18 },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // Videos
  videoCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6, elevation: 2 },
  videoCardBody: { flex: 1, minWidth: 0 },
  videoTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 4 },
  videoDesc: { fontSize: 13, color: '#6B7280' },
  videoOpenBtn: { backgroundColor: 'rgba(74,127,212,0.1)', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, flexShrink: 0 },
  videoOpenBtnText: { fontSize: 13, fontWeight: '700', color: '#4A7FD4' },

  // Video-Pakete
  packageChevron: { fontSize: 22, color: '#9CA3AF', fontWeight: '300', paddingLeft: 8 },
  backLink: { fontSize: 14, fontWeight: '700', color: '#4A7FD4' },
  packageDetailTitle: { fontSize: 20, fontWeight: '800', color: '#111827', marginBottom: 6 },
  packageDetailDesc: { fontSize: 14, color: '#6B7280', lineHeight: 20, marginBottom: 14 },
  // Uhrzeit der Einheit — als Badge, damit sie nicht in der grauen Metazeile untergeht.
  timeBadge: { backgroundColor: 'rgba(74,127,212,0.1)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, flexShrink: 0 },
  timeBadgeText: { fontSize: 13, fontWeight: '700', color: '#4A7FD4' },
  packageDetailTime: { fontSize: 14, fontWeight: '700', color: '#4A7FD4', marginBottom: 10 },
  // Inline-Player
  // aspectRatio setzt der Player selbst, sobald das Video seine Masse meldet.
  // maxWidth ist noetig, weil die Trainer-App im Web als Vollbild laeuft: ohne
  // Deckel wuerde ein Querformat-Video auf einem breiten Monitor ueber 1000 px
  // hoch und man muesste zum Abspielen scrollen.
  player: { width: '100%', maxWidth: 640, backgroundColor: '#000', borderRadius: 10, marginBottom: 10 },
  playerBox: { backgroundColor: '#fff', borderRadius: 10, padding: 20, marginBottom: 10, alignItems: 'center', gap: 10 },

  // Bottom Nav
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingBottom: 20,
    paddingTop: 8,
  },
  navItem: { flex: 1, alignItems: 'center', paddingVertical: 6, gap: 3 },
  navLabel: { fontSize: 11, fontWeight: '600', color: '#9CA3AF' },
  navLabelActive: { color: '#1C2133' },
});
