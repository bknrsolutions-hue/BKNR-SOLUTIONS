import { StyleSheet } from 'react-native';

export const TABLE_TOKENS = Object.freeze({
  shellRadius: 10,
  headerHeight: 30,
  rowMinHeight: 30,
  contentRowMinHeight: 44,
  attendanceRowMinHeight: 50,
  headerFontSize: 9,
  headerLineHeight: 11,
  bodyFontSize: 10,
  bodyLineHeight: 12,
  cellPaddingHorizontal: 5,
  cellPaddingVertical: 3,
  border: '#cbd5e1',
  divider: '#dbe3ef',
  headBackground: '#eaf1fb',
  headText: '#1e3a5f',
  rowBackground: '#ffffff',
  alternateBackground: '#f8fafc',
  bodyText: '#334155',
  subtotalBackground: '#eff6ff',
  subtotalBorder: '#93c5fd',
  subtotalText: '#1d4ed8',
  grandBackground: '#0b2345',
  grandText: '#ffffff',
  grandAccent: '#67e8f9',
});

const indexKeys = new Set(['id', 'serial', 'sl_no', 'row_id']);
const compactKeys = new Set([
  'count', 'hoso_count', 'hlso_count', 'in_count', 'graded_count', 'grade', 'glaze',
  'freezer', 'source', 'no_of_mc', 'loose', 'material_boxes', 'no_of_material_boxes',
  'no_of_empty_boxes', 'no_of_ice_boxes', 'packages',
]);
const dateTimeKeys = new Set([
  'date', 'time', 'timer', 'movement_date', 'movement_time', 'shipment_date',
  'rent_start_date', 'expected_return_date',
]);
const numericKeys = new Set([
  'amount', 'available_qty', 'balance', 'chemical_percent', 'chemical_qty', 'dc_qty',
  'exchange_rate', 'g1_qty', 'g2_qty', 'glaze', 'grade_1_qty', 'grade_2_qty',
  'hl_count_calc', 'hlso_qty', 'hoso_count_calc', 'hoso_qty', 'in_qty', 'loose',
  'material_boxes', 'net_count_calc', 'no_of_empty_boxes', 'no_of_ice_boxes',
  'no_of_material_boxes', 'no_of_mc', 'no_of_pieces', 'ordered_qty', 'packages',
  'peeled_qty', 'pending_production', 'prod_pending_mc', 'production_qty', 'quantity',
  'rate', 'rate_per_kg', 'received_qty', 'ref_opt_stock', 'rejection_qty',
  'req_hlso_qty', 'req_hoso_qty', 'salt_percent', 'salt_qty', 'selling_price',
  'stock_mc', 'storage_rate_per_mc', 'total_amount', 'total_hlso', 'total_hlso_qty',
  'total_hoso_req', 'total_kg', 'total_packages', 'total_quantity', 'total_weight',
  'yield_percent',
]);
const centeredKeys = new Set([
  'action', 'cargo_movement_type', 'movement_type', 'return_status', 'status', 'type',
]);
const longKeys = new Set([
  'address', 'agent_name', 'authorized_received_by', 'buyer', 'cold_storage_name',
  'company_name', 'contractor', 'contractor_name', 'description', 'driver_name',
  'email', 'item_name', 'item_summary', 'packing_style', 'party_name',
  'plant_location', 'product_description', 'production_at', 'production_for',
  'progress_steps', 'purchasing_location', 'receiving_center', 'rejection_for',
  'remarks', 'source_destination', 'species_variety', 'supplier_name',
]);
const descriptionKeys = new Set(['description', 'item_summary', 'progress_steps', 'remarks']);

const displayText = value => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return '';
  return String(value);
};

export const isNumericColumn = key => numericKeys.has(String(key));

export function columnAlignment(key) {
  const normalized = String(key);
  if (numericKeys.has(normalized)) return 'right';
  if (centeredKeys.has(normalized) || indexKeys.has(normalized) || dateTimeKeys.has(normalized)) return 'center';
  return 'left';
}

export const columnAlignmentStyle = key => ({ textAlign: columnAlignment(key) });

export function resolveColumnWidth(key, label = '', rows = [], explicitWidth) {
  const normalized = String(key);
  let base = 88;
  let cap = 144;

  if (indexKeys.has(normalized)) {
    base = 44;
    cap = 64;
  } else if (compactKeys.has(normalized)) {
    base = 56;
    cap = 88;
  } else if (dateTimeKeys.has(normalized)) {
    base = 76;
    cap = 100;
  } else if (numericKeys.has(normalized)) {
    base = 74;
    cap = 108;
  } else if (descriptionKeys.has(normalized)) {
    base = 180;
    cap = 220;
  } else if (longKeys.has(normalized) || String(label).length > 14) {
    base = 112;
    cap = 168;
  }

  const samples = Array.isArray(rows) ? rows.slice(0, 100) : [];
  const longest = samples.reduce(
    (length, row) => Math.max(length, displayText(row?.[normalized]).length),
    String(label || normalized).length,
  );
  const estimated = Math.ceil(longest * 5.4 + (TABLE_TOKENS.cellPaddingHorizontal * 2) + 4);
  const minimum = Number.isFinite(Number(explicitWidth)) ? Number(explicitWidth) : 0;
  return Math.round(Math.max(minimum, base, Math.min(cap, estimated)));
}

export function resolveColumns(columns = [], rows = []) {
  return columns.map(column => {
    const [key, label, explicitWidth] = Array.isArray(column)
      ? column
      : [column.key, column.label, column.width];
    return {
      key,
      label: label || String(key).replaceAll('_', ' '),
      width: resolveColumnWidth(key, label, rows, explicitWidth),
      align: columnAlignment(key),
    };
  });
}

export const tableWidth = (columns = [], trailingWidth = 0) => (
  columns.reduce((total, column) => total + Number(column.width || 0), 0) + Number(trailingWidth || 0)
);

export const nativeTableStyles = StyleSheet.create({
  shell: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: TABLE_TOKENS.border,
    borderRadius: TABLE_TOKENS.shellRadius,
    backgroundColor: TABLE_TOKENS.rowBackground,
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  header: {
    minHeight: TABLE_TOKENS.headerHeight,
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: 1,
    borderBottomColor: TABLE_TOKENS.border,
    backgroundColor: TABLE_TOKENS.headBackground,
  },
  row: {
    minHeight: TABLE_TOKENS.rowMinHeight,
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: TABLE_TOKENS.divider,
    backgroundColor: TABLE_TOKENS.rowBackground,
  },
  contentRow: {
    minHeight: TABLE_TOKENS.contentRowMinHeight,
  },
  attendanceRow: {
    minHeight: TABLE_TOKENS.attendanceRowMinHeight,
  },
  headerCell: {
    minHeight: TABLE_TOKENS.headerHeight,
    paddingHorizontal: TABLE_TOKENS.cellPaddingHorizontal,
    paddingVertical: TABLE_TOKENS.cellPaddingVertical,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: TABLE_TOKENS.border,
    color: TABLE_TOKENS.headText,
    fontSize: TABLE_TOKENS.headerFontSize,
    lineHeight: TABLE_TOKENS.headerLineHeight,
    fontWeight: '900',
    textAlignVertical: 'center',
    textTransform: 'uppercase',
  },
  cell: {
    minHeight: TABLE_TOKENS.rowMinHeight,
    paddingHorizontal: TABLE_TOKENS.cellPaddingHorizontal,
    paddingVertical: TABLE_TOKENS.cellPaddingVertical,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: TABLE_TOKENS.divider,
    color: TABLE_TOKENS.bodyText,
    fontSize: TABLE_TOKENS.bodyFontSize,
    lineHeight: TABLE_TOKENS.bodyLineHeight,
    fontWeight: '600',
    textAlignVertical: 'center',
  },
  contentCell: {
    minHeight: TABLE_TOKENS.contentRowMinHeight,
    justifyContent: 'center',
    paddingHorizontal: TABLE_TOKENS.cellPaddingHorizontal,
    paddingVertical: TABLE_TOKENS.cellPaddingVertical,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: TABLE_TOKENS.divider,
  },
  partition: {
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: TABLE_TOKENS.divider,
  },
  subtotalRow: {
    borderTopWidth: 1,
    borderTopColor: TABLE_TOKENS.subtotalBorder,
    borderBottomWidth: 1,
    borderBottomColor: TABLE_TOKENS.subtotalBorder,
    backgroundColor: TABLE_TOKENS.subtotalBackground,
  },
  subtotalCell: {
    color: TABLE_TOKENS.subtotalText,
    fontWeight: '900',
  },
  grandRow: {
    minHeight: 36,
    borderTopWidth: 2,
    borderTopColor: TABLE_TOKENS.grandAccent,
    backgroundColor: TABLE_TOKENS.grandBackground,
  },
  grandLabel: {
    color: TABLE_TOKENS.grandText,
    fontSize: TABLE_TOKENS.headerFontSize,
    fontWeight: '900',
  },
  grandValue: {
    color: TABLE_TOKENS.grandAccent,
    fontSize: 10.5,
    fontWeight: '900',
  },
  empty: {
    padding: 20,
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
});
