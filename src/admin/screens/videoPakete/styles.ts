import { StyleSheet } from 'react-native';
import { webInputReset } from '../../../styles/webInput';
import { C, LIST_W } from './theme';

export const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: C.bg },

  // ── Paketliste (links) ───────────────────────────────────────────────────
  list: {
    width: LIST_W, backgroundColor: C.surface,
    borderRightWidth: 1, borderRightColor: C.border,
  },
  listInner: { padding: 16, paddingBottom: 40 },
  listTitle: {
    fontSize: 11, fontWeight: '700', color: C.textFaint,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12,
  },
  newBtn: {
    backgroundColor: C.navy, borderRadius: 10, paddingVertical: 11,
    alignItems: 'center', marginBottom: 16,
  },
  newBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  pkgItem: {
    paddingHorizontal: 12, paddingVertical: 11, borderRadius: 10, marginBottom: 6,
    borderWidth: 1, borderColor: 'transparent',
  },
  pkgItemActive: { backgroundColor: C.accentBg, borderColor: C.accentBorder },
  pkgItemTitle: { fontSize: 14, fontWeight: '700', color: C.textMid },
  pkgItemTitleActive: { color: C.accent },
  pkgItemMeta: { fontSize: 12, color: C.textFaint, marginTop: 3 },
  pkgItemActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  pkgItemAction: { fontSize: 12, fontWeight: '700', color: C.accent },
  listEmpty: { fontSize: 13, color: C.textFaint, fontStyle: 'italic', paddingVertical: 12 },

  // ── Detailbereich (rechts) ───────────────────────────────────────────────
  main: { flex: 1 },
  mainContent: { padding: 32, paddingBottom: 60 },
  pageTitle: { fontSize: 20, fontWeight: '800', color: C.text },
  pageSub: { fontSize: 13, color: C.textFaint, marginTop: 4 },

  card: {
    backgroundColor: C.surface, borderRadius: 14, padding: 20, marginBottom: 16,
    shadowColor: C.navy, shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6, elevation: 2, borderWidth: 1, borderColor: C.border,
  },
  cardTitleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 14, gap: 12,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  cardHint: { fontSize: 12, color: C.textFaint, marginTop: -8, marginBottom: 14, lineHeight: 17 },

  // ── Formularelemente ─────────────────────────────────────────────────────
  fieldLabel: {
    fontSize: 12, fontWeight: '700', color: C.textLight, textTransform: 'uppercase',
    letterSpacing: 0.5, marginBottom: 6, marginTop: 12,
  },
  input: {
    backgroundColor: C.fieldBg, borderWidth: 1, borderColor: C.border,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: C.text, ...webInputReset,
  },
  inputMulti: { minHeight: 72, textAlignVertical: 'top' },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  modeChip: {
    flex: 1, paddingVertical: 9, borderRadius: 8, borderWidth: 1.5,
    borderColor: C.border, backgroundColor: C.fieldBg, alignItems: 'center',
  },
  modeChipActive: { borderColor: C.accent, backgroundColor: C.accentBg },
  modeChipText: { fontSize: 13, fontWeight: '700', color: C.textFaint },
  modeChipTextActive: { color: C.accent },
  filePickerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.fieldBg, borderWidth: 1.5, borderColor: C.border,
    borderRadius: 8, borderStyle: 'dashed', paddingHorizontal: 14, paddingVertical: 14,
  },
  filePickerText: { flex: 1, fontSize: 14, color: C.textMid, fontWeight: '500', minWidth: 0 },
  filePickerSize: { fontSize: 12, color: C.textFaint, flexShrink: 0 },
  hint: { fontSize: 12, color: C.textFaint, marginTop: 8, lineHeight: 17 },
  errorText: { fontSize: 13, color: C.danger, fontWeight: '600', marginTop: 10 },
  successText: { fontSize: 13, color: C.success, fontWeight: '600', marginTop: 10 },

  primaryBtn: {
    backgroundColor: C.navy, borderRadius: 10, paddingVertical: 12,
    alignItems: 'center', marginTop: 16,
  },
  primaryBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  ghostBtn: {
    backgroundColor: C.accentBg, borderRadius: 8, paddingHorizontal: 16,
    paddingVertical: 8, borderWidth: 1, borderColor: C.accentBorder,
  },
  ghostBtnText: { fontSize: 13, fontWeight: '700', color: C.accent },
  neutralBtn: {
    backgroundColor: 'rgba(21,34,56,0.06)', borderRadius: 10,
    paddingVertical: 11, paddingHorizontal: 18, alignItems: 'center',
  },
  neutralBtnText: { fontSize: 13, fontWeight: '600', color: C.textLight },
  dangerBtn: {
    backgroundColor: C.dangerBg, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8,
  },
  dangerBtnText: { fontSize: 13, fontWeight: '700', color: C.danger },

  // ── Videozeile ───────────────────────────────────────────────────────────
  videoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.bg,
  },
  videoPos: { fontSize: 12, fontWeight: '700', color: C.textFaint, width: 22 },
  videoInfo: { flex: 1, minWidth: 0 },
  videoTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  videoTitle: { fontSize: 14, fontWeight: '700', color: C.text },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  badgeUpload: { backgroundColor: C.successBg },
  badgeUploadText: { fontSize: 11, fontWeight: '700', color: C.success },
  badgeLink: { backgroundColor: C.accentBg },
  badgeLinkText: { fontSize: 11, fontWeight: '700', color: C.accent },
  videoMeta: { fontSize: 12, color: C.textFaint, marginTop: 3 },
  videoActions: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  iconBtn: {
    width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.fieldBg, borderWidth: 1, borderColor: C.border,
  },
  iconBtnText: { fontSize: 14, fontWeight: '700', color: C.textLight },
  linkAction: { fontSize: 12, fontWeight: '700', color: C.accent, paddingHorizontal: 4 },
  linkActionDanger: { fontSize: 12, fontWeight: '700', color: C.danger, paddingHorizontal: 4 },

  // ── Trainer-Zuweisung ────────────────────────────────────────────────────
  trainerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.bg,
  },
  checkbox: {
    width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface,
  },
  checkboxOn: { borderColor: C.accent, backgroundColor: C.accent },
  checkboxMark: { fontSize: 12, fontWeight: '800', color: '#fff' },
  trainerName: { flex: 1, fontSize: 14, fontWeight: '600', color: C.textMid },
  trainerSpec: { fontSize: 12, color: C.textFaint },

  // ── Bestaetigung ─────────────────────────────────────────────────────────
  confirmBox: {
    backgroundColor: '#FEF2F2', borderWidth: 1.5, borderColor: '#FECACA',
    borderRadius: 12, padding: 16, marginTop: 12,
  },
  confirmTitle: { fontSize: 14, fontWeight: '800', color: '#991B1B', marginBottom: 6 },
  confirmText: { fontSize: 13, color: '#7F1D1D', lineHeight: 19, marginBottom: 14 },
  confirmBtns: { flexDirection: 'row', gap: 10 },
  confirmYes: { flex: 1, backgroundColor: C.danger, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  confirmYesText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  // ── Speicheranzeige ──────────────────────────────────────────────────────
  meterHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  meterValue: { fontSize: 15, fontWeight: '800', color: C.text },
  meterFiles: { fontSize: 12, color: C.textFaint },
  meterTrack: { height: 8, borderRadius: 4, backgroundColor: C.bg, marginTop: 10, overflow: 'hidden' },
  meterFill: { height: '100%', borderRadius: 4 },
  meterOrphan: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: 12, marginTop: 12, backgroundColor: C.warnBg, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  meterOrphanText: { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 17 },

  // ── Leerzustaende ────────────────────────────────────────────────────────
  emptyBox: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: C.textMid, marginBottom: 8, textAlign: 'center' },
  emptyHint: { fontSize: 13, color: C.textFaint, textAlign: 'center', lineHeight: 19 },
});
