import { StyleSheet } from 'react-native';
import { webInputReset } from '../../../styles/webInput';
import { C } from './theme';

// Styles des Terminkalenders, unveraendert uebernommen:
//   s  = Seiten-Chrome (Header, Panels, Buchungsformular)
//   dg = Tagesansicht-Raster
//   wg = Wochenansicht-Raster
export const s = StyleSheet.create({
  root:           { flex: 1, backgroundColor: C.bg },
  scroll:         { flex: 1 },
  scrollContent:  { padding: 16, paddingTop: 0, paddingBottom: 48 },

  // Page header
  pageHeader: {
    paddingHorizontal: 28, paddingVertical: 20,
    backgroundColor: C.surface,
    borderBottomWidth: 1, borderBottomColor: C.border,
    flexDirection: 'row', alignItems: 'center',
    flexWrap: 'wrap', gap: 14,
  },
  pageHeaderLeft:  { flex: 1, minWidth: 200 },
  pageHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  pageTitle:    { fontSize: 22, fontWeight: '800', color: C.text, letterSpacing: -0.4 },
  pageSubtitle: { fontSize: 13, fontWeight: '500', color: C.textLight, marginTop: 2 },

  // Navigation
  navGroup:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  navBtn: {
    width: 34, height: 34, borderRadius: 9,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },
  navBtnText:  { fontSize: 18, fontWeight: '600', color: C.textMid, lineHeight: 20 },
  todayBtn: {
    paddingHorizontal: 13, height: 34, borderRadius: 9,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },
  todayBtnText: { fontSize: 13, fontWeight: '700', color: C.textMid },

  // View toggle
  viewToggle:      { flexDirection: 'row', backgroundColor: C.bg, borderRadius: 9, padding: 3, gap: 2 },
  viewBtn:         { paddingHorizontal: 13, paddingVertical: 6, borderRadius: 7 },
  viewBtnActive:   { backgroundColor: C.surface, shadowColor: '#000', shadowOpacity: 0.07, shadowOffset: { width: 0, height: 1 }, shadowRadius: 3, elevation: 1 },
  viewBtnText:     { fontSize: 13, fontWeight: '600', color: C.textLight },
  viewBtnTextActive:{ color: C.text },

  // Calendar grid card
  gridCard: {
    backgroundColor: C.surface,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 14,
    shadowColor: '#152238',
    shadowOpacity: 0.07,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: C.border,
  },

  // Day view top bar
  dayTopBar:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' },
  todayBadge:    { backgroundColor: C.accent, borderRadius: 7, paddingHorizontal: 10, paddingVertical: 4 },
  todayBadgeText:{ fontSize: 12, fontWeight: '700', color: '#fff' },
  addBtn:        { backgroundColor: 'rgba(74,143,232,0.09)', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(74,143,232,0.2)' },
  addBtnText:    { fontSize: 13, fontWeight: '700', color: '#4A8FE8' },

  // Empty state
  emptyState:    { backgroundColor: C.surface, borderRadius: 14, padding: 48, alignItems: 'center', gap: 10 },
  emptyText:     { fontSize: 15, color: C.textFaint, fontWeight: '500' },

  // Detail panel (selected appointment)
  detailPanel: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: C.surface,
    borderRadius: 12, padding: 16, marginBottom: 14,
    gap: 14,
    shadowColor: '#000', shadowOpacity: 0.06, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6, elevation: 2,
    borderWidth: 1, borderColor: C.border,
  },
  detailAccent:  { width: 4, alignSelf: 'stretch', borderRadius: 2, minHeight: 48 },
  detailBody:    { flex: 1, gap: 3 },
  detailProgram: { fontSize: 13, fontWeight: '700', color: C.textLight },
  detailName:    { fontSize: 17, fontWeight: '800', color: C.text },
  detailMeta:    { fontSize: 13, color: C.textLight },
  detailClose:   { padding: 4 },
  detailCloseText:{ fontSize: 17, color: C.textFaint, fontWeight: '700' },

  // Participant list (group)
  participantList: { gap: 6, marginTop: 10 },
  participantRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  participantDot:  { width: 7, height: 7, borderRadius: 4, flexShrink: 0 },
  participantName: { flex: 1, fontSize: 13, fontWeight: '600', color: C.textMid },

  miniStornBtn:     { backgroundColor: C.danger, borderRadius: 6, paddingHorizontal: 9, paddingVertical: 4 },
  miniStornBtnText: { fontSize: 11, fontWeight: '700', color: '#fff' },

  stornBtn:     { backgroundColor: C.danger, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16, alignSelf: 'flex-start', marginTop: 8 },
  stornBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  errorText:    { fontSize: 12, color: C.danger, fontWeight: '600', marginTop: 6 },
  cancelReasonInput: {
    backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 8,
    paddingHorizontal: 11, paddingVertical: 8, fontSize: 13, color: C.text,
    marginTop: 10, minHeight: 52, textAlignVertical: 'top', ...webInputReset,
  },

  // ── Booking panel ──────────────────────────────────────────────────────────
  bookPanel: {
    backgroundColor: C.surface, borderRadius: 14, padding: 22, marginBottom: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowOffset: { width: 0, height: 2 }, shadowRadius: 8, elevation: 2,
    borderWidth: 1, borderColor: C.border,
  },
  bookPanelHead:      { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 },
  bookPanelTitle:     { fontSize: 17, fontWeight: '800', color: C.text },
  bookPanelDate:      { fontSize: 13, color: C.textLight, marginTop: 2 },
  bookPanelClose:     { padding: 4 },
  bookPanelCloseText: { fontSize: 17, color: C.textFaint, fontWeight: '700' },

  successBanner: { backgroundColor: C.successBg, borderRadius: 8, padding: 12, marginBottom: 14 },
  successBannerText: { fontSize: 13, fontWeight: '700', color: C.successText },

  fieldLabel: { fontSize: 11, fontWeight: '700', color: C.textFaint, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 8 },

  // Customer search
  selectedCustomer: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.accentLight, borderRadius: 9,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  selectedCustomerAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  selectedCustomerInitial:{ fontSize: 13, fontWeight: '800', color: C.accent },
  selectedCustomerName:   { flex: 1, fontSize: 14, fontWeight: '700', color: C.text },
  selectedCustomerNum:    { fontSize: 12, color: C.textLight },
  clearBtn:               { fontSize: 15, color: C.textFaint, fontWeight: '700', padding: 2 },
  input: {
    backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 9,
    paddingHorizontal: 13, paddingVertical: 10, fontSize: 14, color: C.text,
    ...webInputReset,
  },
  suggestion: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.bg, borderRadius: 8,
    paddingHorizontal: 13, paddingVertical: 10, marginTop: 4,
  },
  suggestionName: { flex: 1, fontSize: 14, color: C.text, fontWeight: '600' },
  suggestionNum:  { fontSize: 12, color: C.textLight },

  // Program chips
  programGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  programChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9,
    borderWidth: 1.5, backgroundColor: C.surface,
  },
  programChipEmoji: { fontSize: 14 },
  programChipText:  { fontSize: 12, fontWeight: '700', color: C.textMid },

  // Time / trainer chips
  bookRow:  { flexDirection: 'row', gap: 20, marginTop: 16, flexWrap: 'wrap' },
  chipRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 2 },
  chip:     { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 8, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface },
  chipActive:    { borderColor: C.accent, backgroundColor: C.accentLight },
  chipText:      { fontSize: 12, fontWeight: '600', color: C.textLight },
  chipTextActive:{ color: C.accent },

  bookActions: { marginTop: 18 },
  bookBtn: {
    backgroundColor: C.accent, borderRadius: 10,
    paddingVertical: 13, alignItems: 'center',
  },
  bookBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});

// ─── Styles: Day grid ─────────────────────────────────────────────────────────
export const dg = StyleSheet.create({
  row:       { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.borderLight, minHeight: 60 },
  rowAlt:    { backgroundColor: '#FAFBFE' },
  headRow:   { backgroundColor: C.navy, borderBottomWidth: 0, minHeight: 52 },
  timeCell:  { justifyContent: 'center', alignItems: 'center', paddingVertical: 10, borderRightWidth: 1, borderRightColor: C.border },
  trainerCell:{ justifyContent: 'center', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 8, borderRightWidth: 1, borderRightColor: '#2D3548', gap: 5 },
  headLabel: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.5 },
  trainerName:{ fontSize: 13, fontWeight: '700', color: '#fff', textAlign: 'center' },
  specialtyPill:{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
  specialtyText:{ fontSize: 10, fontWeight: '700', color: '#fff' },
  timeText:  { fontSize: 13, fontWeight: '600', color: C.textLight },
  cell:      { paddingHorizontal: 5, paddingVertical: 5, gap: 4, borderRightWidth: 1, borderRightColor: C.borderLight, justifyContent: 'center' },
  apptTag: {
    borderLeftWidth: 3, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 5,
    flexDirection: 'row', alignItems: 'center', gap: 5,
  },
  apptTagText: { fontSize: 12, fontWeight: '700', flex: 1 },

  // Nachholtermin-Marker (NT) in der Tagesansicht-Zelle
  ntPill:     { backgroundColor: '#7C3AED', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 },
  ntPillText: { fontSize: 9, fontWeight: '800', color: '#fff', letterSpacing: 0.3 },

  // Kurzfrist-Storno-Marker in der Tagesansicht-Zelle
  cancelTag: {
    borderLeftWidth: 3, borderLeftColor: C.danger, borderRadius: 6,
    backgroundColor: 'rgba(239,68,68,0.07)',
    paddingHorizontal: 8, paddingVertical: 5, gap: 1,
  },
  cancelTagLabel: { fontSize: 9, fontWeight: '800', color: C.danger },
  cancelTagName:  { fontSize: 12, fontWeight: '700', color: C.textMid, textDecorationLine: 'line-through' },
});

// ─── Styles: Week grid ────────────────────────────────────────────────────────
export const wg = StyleSheet.create({
  // Day header row (dark navy)
  headRow: {
    flexDirection: 'row',
    backgroundColor: C.navy,
    borderBottomWidth: 2, borderBottomColor: C.navyMid,
  },
  dayHead: {
    alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, gap: 3,
    borderRightWidth: 1, borderRightColor: '#2A3147',
  },
  dayHeadToday:   { backgroundColor: C.accent },
  dayHeadWeekend: { backgroundColor: 'rgba(0,0,0,0.18)' },
  dayName: {
    fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.55)',
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  dayNameToday: { color: 'rgba(255,255,255,0.85)' },
  dayNum:       { fontSize: 20, fontWeight: '800', color: '#fff' },
  dayNumToday:  { color: '#fff' },
  faded:        { opacity: 0.4 },

  // Appointment count badge
  countBadge: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10, paddingHorizontal: 7, paddingVertical: 1, marginTop: 2,
  },
  countBadgeToday: { backgroundColor: 'rgba(255,255,255,0.25)' },
  countText:       { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.8)' },
  countTextToday:  { color: '#fff' },

  // Kurzfrist-Storno-Marker im Tageskopf
  cancelBadge:     { backgroundColor: 'rgba(239,68,68,0.92)', borderRadius: 9, paddingHorizontal: 6, paddingVertical: 1, marginTop: 3 },
  cancelBadgeText: { fontSize: 9, fontWeight: '800', color: '#fff' },

  // Add button in day header
  addBtn: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center', marginTop: 3,
  },
  addBtnToday:     { backgroundColor: 'rgba(255,255,255,0.25)' },
  addBtnText:      { fontSize: 13, fontWeight: '800', color: 'rgba(255,255,255,0.7)', lineHeight: 16 },
  addBtnTextToday: { color: '#fff' },

  // Slot rows
  slotRow:    { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.borderLight, minHeight: 96 },
  slotRowAlt: { backgroundColor: '#FAFBFE' },

  // Time column cell
  timeCell: {
    justifyContent: 'center', alignItems: 'center',
    paddingVertical: 8, borderRightWidth: 1, borderRightColor: C.border,
  },
  timeText: { fontSize: 12, fontWeight: '600', color: C.textFaint },

  // Day cells
  cell: {
    paddingHorizontal: 5, paddingVertical: 6, gap: 5,
    borderRightWidth: 1, borderRightColor: C.borderLight,
    justifyContent: 'flex-start',
  },
  cellToday:   { backgroundColor: C.todayCol },
  cellWeekend: { backgroundColor: C.weekendBg },
  cellPast:    { opacity: C.pastOpacity },

  // Appointment block
  apptBlock: {
    borderLeftWidth: 3, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 9,
    gap: 3, alignSelf: 'stretch', minWidth: 0,
  },
  apptBlockTop: { flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 0 },
  apptProg:     { fontSize: 12, fontWeight: '800', flexShrink: 1, minWidth: 0 },
  apptMeta:     { fontSize: 12, fontWeight: '600', color: C.textMid, flexShrink: 1, minWidth: 0 },
  apptMetaSel:  { color: 'rgba(255,255,255,0.85)' },
  apptTrainer:  { fontSize: 11, color: C.textFaint, flexShrink: 1, minWidth: 0 },
  apptTrainerSel:{ color: 'rgba(255,255,255,0.65)' },

  // Nachholtermin-Marker (NT) im Terminblock
  ntPill:     { backgroundColor: '#7C3AED', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1, flexShrink: 0 },
  ntPillText: { fontSize: 9, fontWeight: '800', color: '#fff', letterSpacing: 0.3 },

  // Kurzfrist-Storno-Marker in der Zelle
  cancelBlock: {
    borderLeftWidth: 3, borderLeftColor: C.danger, borderRadius: 8,
    backgroundColor: 'rgba(239,68,68,0.07)',
    paddingHorizontal: 10, paddingVertical: 7, gap: 2, alignSelf: 'stretch',
  },
  cancelLabel: { fontSize: 10, fontWeight: '800', color: C.danger, letterSpacing: 0.2 },
  cancelName:  { fontSize: 12, fontWeight: '600', color: C.textMid, textDecorationLine: 'line-through' },
});
