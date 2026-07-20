import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import NativeDropdown from '../components/NativeDropdown';
import { Loading, number, Screen, SectionTitle } from '../components/NativeScreenKit';
import { nativeTableStyles, resolveColumns, tableWidth as resolvedTableWidth } from '../components/NativeTableKit';
import { apiRequest } from '../services/api';
import { useERPTheme } from '../theme/ERPThemeContext';
import NativeGoodsGateMovements from './NativeGoodsGateMovements';

const text = (name, label, keyboardType, readOnly = false) => ({ name, label, keyboardType, readOnly });
const select = (name, label, source, values) => ({ name, label, source, values, select: true });

const modules = {
  gate_entry: {
    title: 'Gate Entry', icon: '🚪', route: '/processing/gate_entry',
    fields: [select('production_for', 'Production For', 'companies'), select('receiving_center', 'Factory Name', 'receivingCenters'), text('gate_pass_number', 'Gate Pass Number'), text('batch_number', 'Batch Number'), text('challan_number', 'Challan Number'), select('supplier_name', 'Supplier Name', 'suppliers'), select('purchasing_location', 'Location', 'locations'), select('vehicle_number', 'Vehicle Number', 'vehicleNumbers'), text('driver_name', 'Driver Name'), text('no_of_material_boxes', 'Material Boxes', 'numeric'), text('no_of_empty_boxes', 'Empty Boxes', 'numeric'), text('no_of_ice_boxes', 'Ice Boxes', 'numeric')],
  },
  raw_material_purchasing: {
    title: 'RM Purchasing', icon: '🚚', route: '/processing/raw_material_purchasing',
    fields: [select('production_for', 'Production For', 'companies'), select('peeling_at', 'Receiving At', 'locations'), select('batch_number', 'Batch Number', 'batches'), text('supplier_name', 'Supplier Name', 'default', true), select('product_description', 'Product', 'products'), text('hsn_code', 'HSN Code', 'default', true), select('variety_name', 'Variety', 'varieties'), select('species', 'Species', 'species'), text('count', 'Count / Grade'), text('material_boxes', 'Material Boxes', 'numeric'), text('g1_qty', 'Grade 1 Weight (KG)', 'decimal-pad'), text('g2_qty', 'Grade 2 Weight (KG)', 'decimal-pad'), text('dc_qty', 'Drained Weight (KG)', 'decimal-pad'), text('received_qty', 'Total Weight (KG)', 'decimal-pad', true), text('rate_per_kg', 'Rate per KG', 'decimal-pad'), text('amount', 'Total Amount', 'decimal-pad', true), text('remarks', 'Remarks')],
  },
  de_heading: {
    title: 'De-Heading', icon: '✂️', route: '/processing/de_heading',
    fields: [select('production_for', 'Production For', 'companies'), select('deheading_at', 'Location', 'locations'), select('species', 'Species', 'species'), select('batch_number', 'Batch Number', 'batches'), select('hoso_count', 'HOSO Count', 'counts'), text('hoso_qty', 'HOSO Qty (In)', 'decimal-pad'), text('hlso_qty', 'HLSO Qty (Out)', 'decimal-pad'), text('yield_percent', 'Yield %', 'decimal-pad', true), select('contractor', 'Contractor', 'contractors'), text('rate_per_kg', 'Rate / KG', 'decimal-pad', true), text('amount', 'Total Amount', 'decimal-pad', true)],
  },
  grading: {
    title: 'Grading', icon: '⚖️', route: '/processing/grading',
    fields: [select('production_for', 'Production For', 'companies'), select('peeling_at', 'Grading At', 'locations'), select('batch_number', 'Batch Number', 'batches'), select('hoso_count', 'HOSO Count (In)', 'counts'), select('species_val', 'Species', 'species'), select('variety_name', 'Variety', 'varieties'), text('graded_count', 'Graded Count (Out)'), text('quantity', 'Quantity (KG)', 'decimal-pad')],
  },
  peeling: {
    title: 'Peeling', icon: '🧤', route: '/processing/peeling',
    fields: [select('production_for', 'Company', 'companies'), select('location', 'Location (Processing At)', 'locations'), select('batch_number', 'Batch', 'batches'), select('in_count', 'Count (In)', 'counts'), select('species', 'Species', 'species'), text('hlso_qty', 'HLSO In (Qty)', 'decimal-pad'), select('variety', 'Peeled Variety (Out)', 'varieties'), text('peeled_qty', 'Peeled Out (Qty)', 'decimal-pad'), select('contractor_name', 'Contractor', 'contractors'), text('rate', 'Rate / KG', 'decimal-pad', true), text('yield_percent', 'Yield %', 'decimal-pad', true), text('amount', 'Total Amount', 'decimal-pad', true)],
  },
  soaking: {
    title: 'Soaking', icon: '💧', route: '/processing/soaking',
    fields: [text('sintex_number', 'Sintex'), select('production_for', 'Production For', 'companies'), select('production_at', 'Location (Processing At)', 'locations'), select('batch_number', 'Batch', 'batches'), select('in_count', 'Count', 'counts'), select('variety_name', 'Variety', 'varieties'), select('species_name', 'Species', 'species'), text('in_qty', 'Input Qty (KG)', 'decimal-pad'), select('chemical_name', 'Chemical', 'chemicals'), text('chemical_percent', 'Chemical %', 'decimal-pad'), text('chemical_qty', 'Chemical Qty', 'decimal-pad', true), text('salt_percent', 'Salt %', 'decimal-pad'), text('salt_qty', 'Salt Qty', 'decimal-pad', true), text('rejection_qty', 'Rejection Qty', 'decimal-pad'), text('rejection_for', 'Rejection For')],
  },
  production: {
    title: 'Production', icon: '🏭', route: '/processing/production',
    fields: [select('production_for', 'Production For', 'companies'), select('production_at', 'Location (Production At)', 'locations'), select('batch_number', 'Batch / PO Number', 'batches'), select('species', 'Species', 'species'), select('variety_name', 'Variety', 'varieties'), select('brand', 'Brand', 'brands'), select('grade', 'Grade', 'grades'), select('glaze', 'Glaze (%)', 'glazes'), select('freezer', 'Freezer', 'freezers'), select('production_type', 'Production Type', 'productionTypes'), select('packing_style', 'Packing Style', 'packingStyles'), text('no_of_mc', 'No of MC', 'numeric'), text('loose', 'Loose', 'numeric'), text('production_qty', 'Total KG', 'decimal-pad')],
  },
  stock_entry: {
    title: 'Stock Entry', icon: '📦', route: '/inventory/stock_entry',
    fields: [select('cargo_movement_type', 'Cargo Movement Type', null, ['IN', 'OUT']), select('production_for', 'Production For', 'companies'), select('production_at', 'Production At', 'locations'), select('batch_number', 'Batch', 'batches'), select('type_of_production', 'Type of Production', 'productionTypes'), select('location', 'Location (Stock)', 'stockLocations'), select('brand', 'Brand', 'brands'), select('freezer', 'Freezer', 'freezers'), select('packing_style', 'Packing Style', 'packingStyles'), select('glaze', 'Glaze', 'glazes'), select('species', 'Species', 'species'), select('variety', 'Variety', 'varieties'), select('grade', 'Grade', 'grades'), text('no_of_mc', 'No of MC', 'numeric'), text('loose', 'Loose', 'numeric'), text('quantity', 'Total Qty (KG)', 'decimal-pad', true), select('purpose', 'Purpose', 'purposes'), select('po_number', 'PO Number', 'poNumbers')],
  },
  pending_orders: {
    title: 'Pending Orders', icon: '🕘', route: '/inventory/pending_orders',
    fields: [text('sl_no', 'Sl No', 'numeric'), text('shipment_date', 'Shipment Schedule (YYYY-MM-DD)'), select('company_name', 'Company Context', 'companies'), text('po_number', 'PO Number Reference'), select('production_at', 'Location (Processing At)', 'locations'), text('exchange_rate', 'Exchange Rate', 'decimal-pad'), select('buyer', 'Buyer Profile', 'buyers'), select('agent', 'Agent Link', 'agents'), select('country', 'Target Country', 'countries')],
  },
  cold_storage_holding: {
    title: 'Cold Storage Holding', icon: '❄️', route: '/inventory/cold_storage_holding/save',
    fields: [select('cold_storage_name', 'Facility Name', 'coldStorages'), text('address', 'Full Address'), text('rent_start_date', 'Rent Start Date'), text('storage_rate_per_mc', 'Holding Cost (Per MC)', 'decimal-pad'), select('production_for', 'Production For', 'companies'), select('batch_number', 'Batch Number', 'batches'), select('cargo_movement_type', 'Movement Type', null, ['IN', 'OUT']), select('species', 'Species', 'species'), select('variety', 'Variety', 'varieties'), select('grade', 'Grade', 'grades'), select('brand', 'Brand', 'brands'), select('packing_style', 'Packing Style', 'packingStyles'), select('glaze', 'Glaze', 'glazes'), select('freezer', 'Freezer', 'freezers'), text('po_number', 'PO Number'), select('purpose', 'Purpose', 'purposes'), text('no_of_mc', 'No of MC', 'numeric'), text('loose', 'Loose (Slabs)', 'numeric'), text('quantity', 'Total Quantity (KG)', 'decimal-pad'), text('remarks', 'Remarks')],
  },
};

const unique = values => [...new Set((values || []).filter(Boolean).map(String))].sort();
const lookupValues = (payload, keys) => unique((payload?.data || []).map(row => keys.map(key => row[key]).find(Boolean)));
const operationMeta = {
  gate_entry: { dataRoute: '/processing/gate_entry?format=json', rowsKey: 'today_data', cancel: id => `/processing/gate_entry/delete/${id}`, label: 'supplier_name', metric: 'no_of_material_boxes', columns: [['id', 'ID'], ['time', 'Time'], ['production_for', 'Company'], ['receiving_center', 'Factory'], ['gate_pass_number', 'Gate Pass'], ['batch_number', 'Batch Number'], ['challan_number', 'Challan Number'], ['supplier_name', 'Supplier'], ['purchasing_location', 'Location'], ['vehicle_number', 'Vehicle'], ['driver_name', 'Driver Name'], ['no_of_material_boxes', 'Material Boxes'], ['no_of_empty_boxes', 'Empty Boxes'], ['no_of_ice_boxes', 'Ice Boxes'], ['email', 'Registered By']] },
  raw_material_purchasing: { dataRoute: '/processing/raw_material_purchasing?format=json', rowsKey: 'today_data', cancel: id => `/processing/raw_material_purchasing/delete/${id}`, label: 'variety_name', metric: 'received_qty', columns: [['id', 'ID'], ['date', 'Date'], ['time', 'Time'], ['batch_number', 'Batch Number'], ['production_for', 'Company'], ['peeling_at', 'Location'], ['hsn_code', 'HSN Code'], ['supplier_name', 'Supplier Name'], ['variety_name', 'Variety'], ['species', 'Species'], ['count', 'Count'], ['material_boxes', 'Material Boxes'], ['g1_qty', 'Grade 1 Qty'], ['g2_qty', 'Grade 2 Qty'], ['dc_qty', 'Drained Qty'], ['received_qty', 'Total Weight'], ['rate_per_kg', 'Rate per KG'], ['amount', 'Total Amount'], ['remarks', 'Remarks'], ['email', 'Registered By']] },
  de_heading: { dataRoute: '/processing/de_heading?format=json', rowsKey: 'today_data', cancel: id => `/processing/de_heading/delete/${id}`, label: 'hoso_count', metric: 'hlso_qty', columns: [['peeling_at', 'Location'], ['production_for', 'Production For'], ['batch_number', 'Batch'], ['hoso_count', 'Count'], ['species', 'Species'], ['hoso_qty', 'HOSO In'], ['hlso_qty', 'HLSO Out'], ['yield_percent', 'Yield %'], ['contractor', 'Contractor'], ['amount', 'Amount']] },
  grading: { dataRoute: '/processing/grading?format=json', rowsKey: 'today_data', cancel: id => `/processing/grading/delete/${id}`, label: 'graded_count', metric: 'quantity', columns: [['batch_number', 'Batch #'], ['production_for', 'Production For'], ['hoso_count', 'In HOSO'], ['graded_count', 'Out Graded'], ['species_variety', 'Species | Variety'], ['quantity', 'Qty KG'], ['time', 'Time']] },
  peeling: { dataRoute: '/processing/peeling?format=json', rowsKey: 'today_data', cancel: id => `/processing/peeling/delete/${id}`, label: 'variety_name', metric: 'peeled_qty', columns: [['batch_number', 'Batch'], ['production_for', 'Company'], ['species', 'Species'], ['variety_name', 'Variety'], ['hlso_count', 'Count'], ['hlso_qty', 'HLSO In'], ['peeled_qty', 'Peeled Out'], ['yield_percent', 'Yield %'], ['peeling_at', 'Location'], ['contractor_name', 'Contractor'], ['amount', 'Amount']] },
  soaking: { dataRoute: '/processing/soaking?format=json', rowsKey: 'today_data', cancel: id => `/processing/soaking/delete/${id}`, label: 'variety_name', metric: 'in_qty', columns: [['sintex_number', 'Sintex'], ['batch_number', 'Batch'], ['production_for', 'Company'], ['in_count', 'Count'], ['variety_name', 'Variety'], ['production_at', 'Location'], ['species', 'Species'], ['in_qty', 'Input'], ['chemical_name', 'Chem'], ['chemical_percent', 'Chem %'], ['chemical_qty', 'Chem Qty'], ['salt_percent', 'Salt %'], ['salt_qty', 'Salt Qty'], ['rejection_qty', 'Rej Qty'], ['rejection_for', 'Rej For'], ['time', 'Time']] },
  production: { dataRoute: '/processing/production?format=json', rowsKey: 'today_data', cancel: id => `/processing/production/delete/${id}`, label: 'variety_name', metric: 'production_qty', columns: [['id', 'ID'], ['production_for', 'Company'], ['batch_number', 'Batch'], ['production_type', 'Type'], ['production_at', 'Location'], ['species', 'Species'], ['brand', 'Brand'], ['variety_name', 'Variety'], ['glaze', 'Glaze'], ['freezer', 'Freezer'], ['grade', 'Grade'], ['packing_style', 'Style'], ['no_of_mc', 'MC'], ['loose', 'Loose'], ['production_qty', 'Total KG']] },
  stock_entry: { dataRoute: '/inventory/stock_entry?format=json', rowsKey: 'table_data', cancel: id => `/inventory/stock_entry/delete/${id}`, label: 'cargo_movement_type', metric: 'quantity', columns: [['id', 'ID'], ['date', 'Date'], ['time', 'Time'], ['cargo_movement_type', 'Type'], ['batch_number', 'Batch'], ['location', 'Stock Loc'], ['production_for', 'Prod For'], ['production_at', 'Prod At'], ['purpose', 'Purpose'], ['po_number', 'PO'], ['brand', 'Brand'], ['species', 'Species'], ['variety', 'Variety'], ['grade', 'Grade'], ['no_of_mc', 'MC'], ['loose', 'Loose'], ['quantity', 'Total Qty'], ['email', 'User']] },
  pending_orders: { dataRoute: '/inventory/pending_orders?format=json', rowsKey: 'active_rows', cancel: row => `/inventory/pending_orders/delete_po/${encodeURIComponent(row.po_number)}`, label: 'brand', metric: 'no_of_mc', columns: [['sl_no', 'Sl'], ['company_name', 'Company'], ['production_at', 'Location'], ['po_number', 'PO'], ['buyer', 'Buyer'], ['agent_name', 'Agent'], ['shipment_date', 'Ship Date'], ['brand', 'Brand'], ['packing_style', 'Packing'], ['freezer', 'Freezer'], ['count_glaze', 'C.G'], ['weight_glaze', 'W.G'], ['species', 'Species'], ['variety', 'Variety'], ['grade', 'Grade'], ['no_of_pieces', 'Pieces'], ['no_of_mc', 'MC Box'], ['selling_price', 'Price'], ['exchange_rate', 'Exchange Rate'], ['progress_steps', 'Workflow Architecture']] },
  cold_storage_holding: { dataRoute: '/inventory/cold_storage_holding?format=json', rowsKey: 'current_holdings', cancel: id => `/inventory/cold_storage_holding/delete/${id}`, label: 'cold_storage_name', metric: 'quantity', columns: [['status', 'Status'], ['cold_storage_name', 'Facility'], ['production_for', 'Production For'], ['batch_number', 'Batch'], ['cargo_movement_type', 'Movement'], ['species', 'Species'], ['variety', 'Variety'], ['grade', 'Grade'], ['no_of_mc', 'MC'], ['loose', 'Loose'], ['quantity', 'Total Qty'], ['rent_start_date', 'In Date']] },
};
const auxiliaryMeta = {
  raw_material_purchasing: [['hoso_summary', 'Pending HOSO Status', ['species', 'variety', 'hoso_count', 'total_hoso_req', 'received_today', 'balance']]],
  de_heading: [['hoso_floor_balance', 'HOSO Floor Balance', ['production_for', 'peeling_at', 'batch', 'count', 'species', 'available_qty']]],
  grading: [['hlso_summary', 'HLSO Summary', ['species', 'variety', 'count', 'total_kg']], ['hoso_summary', 'HOSO Summary', ['species', 'variety', 'count', 'total_kg']], ['deheading_pending', 'De-Heading Pending Pool', ['batch_number', 'production_for', 'peeling_at', 'species', 'hoso_count', 'total_hlso_qty', 'graded_qty', 'available_qty', 'status']]],
  peeling: [['hlso_floor_balance', 'HLSO Floor Balance', ['production_for', 'location', 'batch', 'count', 'species', 'variety', 'available_qty']], ['hlso_summary', 'Required Peeling', ['species', 'variety', 'count', 'total_kg']], ['variety_summary', 'Variety Summary', ['variety_name', 'total_hlso']]],
  soaking: [['rows_batch', 'Floor Balance', ['production_for', 'location', 'batch', 'source', 'count', 'species', 'variety', 'available_qty']]],
  production: [['pending_orders', 'Production Requirements', ['sl_no', 'company_name', 'po_number', 'buyer', 'shipment_date', 'packing_style', 'brand', 'species', 'variety', 'count_glaze', 'weight_glaze', 'grade', 'nw_grade', 'no_of_pieces', 'no_of_mc', 'stock_mc', 'prod_pending_mc', 'net_count_calc', 'hl_count_calc', 'hoso_count_calc', 'ordered_qty', 'available_stock', 'existed_stock_util', 'ref_opt_stock', 'pending_production', 'req_hlso_qty', 'req_hoso_qty']], ['soaking_data', 'Active Soaking Lines', ['sintex_number', 'batch_number', 'production_for', 'production_at', 'variety_name', 'in_count', 'in_qty', 'timer', 'status']], ['rejection_data', 'Rejection Stock Floor', ['batch_number', 'production_for', 'production_at', 'variety_name', 'in_count', 'rejection_qty', 'rejection_for']]],
  cold_storage_holding: [['storage_masters', 'Cold Storage Masters', ['cold_storage_name', 'address', 'storage_rate_per_mc']]],
};
const stockOutFields = [
  select('cargo_movement_type', 'Cargo Movement Type', null, ['IN', 'OUT']),
  select('production_for', 'Production For', 'companies'),
  select('production_at', 'Production At', 'locations'),
  select('brand', 'Brand', 'brands'),
  select('freezer', 'Freezer', 'freezers'),
  select('packing_style', 'Packing Style', 'packingStyles'),
  select('glaze', 'Glaze', 'glazes'),
  select('species', 'Species', 'species'),
  select('variety', 'Variety', 'varieties'),
  select('grade', 'Grade', 'grades'),
  select('purpose', 'Purpose', 'purposes'),
  select('po_number', 'PO Number', 'poNumbers'),
];
const pendingItemFields = [
  select('brand', 'Brand', 'brands'),
  select('packing_style', 'Packing Style', 'packingStyles'),
  select('freezer', 'Freezer', 'freezers'),
  select('count_glaze', 'Count Glaze', 'glazes'),
  select('weight_glaze', 'Weight Glaze', 'glazes'),
  select('species', 'Species', 'species'),
  select('variety', 'Variety', 'varieties'),
  select('grade', 'Grade', 'grades'),
  text('no_of_pieces', 'No of Pieces', 'numeric'),
  text('no_of_mc', 'No of MC', 'numeric'),
  text('selling_price', 'Selling Price', 'decimal-pad'),
];
const emptyPendingItem = () => ({ brand: '', packing_style: '', freezer: '', count_glaze: '', weight_glaze: '', species: '', variety: '', grade: '', no_of_pieces: '', no_of_mc: '', selling_price: '' });
const formDefaults = {
  gate_entry: { no_of_material_boxes: '0', no_of_empty_boxes: '0', no_of_ice_boxes: '0' },
  raw_material_purchasing: { material_boxes: '0', g1_qty: '0', g2_qty: '0', dc_qty: '0', received_qty: '0.00', rate_per_kg: '0', amount: '0.00' },
  de_heading: { yield_percent: '0.00', rate_per_kg: '0', amount: '0.00' },
  grading: {},
  peeling: { rate: '0', yield_percent: '0.00', amount: '0.00' },
  soaking: { sintex_number: 'AUTO', in_qty: '0', chemical_percent: '0', chemical_qty: '0.00', salt_percent: '0', salt_qty: '0.00', rejection_qty: '0' },
  production: { no_of_mc: '0', loose: '0', production_qty: '0.00' },
  stock_entry: { cargo_movement_type: 'IN', no_of_mc: '0', loose: '0', quantity: '0' },
  pending_orders: { sl_no: '', exchange_rate: '' },
  cold_storage_holding: { cargo_movement_type: 'IN', purpose: 'Storing', no_of_mc: '0', loose: '0', quantity: '0' },
};

export default function NativeOperationWorkspace({ moduleKey, filters = {}, onBack }) {
  const { theme } = useERPTheme();
  const { height: windowHeight } = useWindowDimensions();
  const module = modules[moduleKey] || modules.gate_entry;
  const [form, setForm] = useState({
    ...(formDefaults[moduleKey] || {}),
    production_for: filters.productionFor || '',
    production_at: filters.location || '',
    deheading_at: filters.location || '',
    peeling_at: filters.location || '',
    receiving_center: filters.location || '',
    location: filters.location || '',
  });
  const [masters, setMasters] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [operationData, setOperationData] = useState({});
  const [dataLoading, setDataLoading] = useState(true);
  const [view, setView] = useState('form');
  const [cancelRow, setCancelRow] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [availableQty, setAvailableQty] = useState(null);
  const [availableLoading, setAvailableLoading] = useState(false);
  const [stockOutRows, setStockOutRows] = useState([]);
  const [stockOutLoading, setStockOutLoading] = useState(false);
  const [pendingItems, setPendingItems] = useState([emptyPendingItem()]);
  const [statusBusy, setStatusBusy] = useState('');
  const [gateSection, setGateSection] = useState('raw');
  const activeFields = moduleKey === 'stock_entry' && form.cargo_movement_type === 'OUT' ? stockOutFields : module.fields;
  const meta = operationMeta[moduleKey] || operationMeta.gate_entry;
  const rows = operationData[meta.rowsKey] || [];
  const workspaceTabs = [
    { key: 'form', label: 'ENTRY' },
    { key: 'report', label: 'REGISTER' },
    ...(auxiliaryMeta[moduleKey] || []).map(([key, title]) => ({
      key: `table:${key}`,
      label: title.toUpperCase(),
    })),
  ];
  const activeAuxiliaryKey = view.startsWith('table:') ? view.slice(6) : '';
  const tableViewportHeight = Math.max(340, Math.min(640, windowHeight - ((filters.companies?.length || filters.locations?.length) ? 300 : 250)));

  const resetEntryForm = () => {
    setForm({
      ...(formDefaults[moduleKey] || {}),
      production_for: filters.productionFor || '',
      production_at: filters.location || '',
      deheading_at: filters.location || '',
      peeling_at: filters.location || '',
      receiving_center: filters.location || '',
      location: filters.location || '',
    });
    setAvailableQty(null);
    setStockOutRows([]);
    setPendingItems([emptyPendingItem()]);
  };

  const loadOperation = async () => {
    setDataLoading(true);
    try {
      const query = new URLSearchParams();
      if (filters.productionFor) query.set('production_for', filters.productionFor);
      if (filters.location) {
        query.set('location', filters.location);
        query.set('peeling_at', filters.location);
        query.set('production_at', filters.location);
      }
      const payload = await apiRequest(`${meta.dataRoute}${query.toString() ? `&${query.toString()}` : ''}`);
      setOperationData(payload || {});
      setMasters(current => ({
        ...current,
        companies: payload.unique_companies || payload.prod_for_list || payload.production_for_list?.map(item => item.production_for || item) || current.companies || [],
        locations: (moduleKey === 'stock_entry' ? payload.production_places : null) || payload.production_locations || payload.peeling_locations || payload.production_places || payload.prod_at_list || payload.locations || current.locations || [],
        receivingCenters: payload.peeling_ats || current.receivingCenters || [],
        batches: unique([
          ...(current.batches || []),
          ...(payload.today_data || []).map(row => row.batch_number),
          ...(payload.table_data || []).map(row => row.batch_number),
          ...(payload.rows_batch || []).map(row => row.batch_number || row.batch),
          ...(payload.batches_with_company || []).map(row => row.batch_number || row.batch),
          ...(payload.batch_data_list || []).map(row => row.batch_number || row.batch),
        ]),
        suppliers: payload.suppliers || payload.supplier_list || current.suppliers || [],
        products: payload.hsn_list || current.products || [],
        vehicleNumbers: payload.vehicles || current.vehicleNumbers || [],
        contractors: payload.contractors || current.contractors || [],
        chemicals: payload.chemicals || current.chemicals || [],
        species: payload.species_list || payload.species || current.species || [],
        varieties: payload.variety_list || payload.varieties || current.varieties || [],
        brands: payload.brands || current.brands || [],
        grades: payload.grades || current.grades || [],
        glazes: payload.glazes || current.glazes || [],
        freezers: payload.freezers || current.freezers || [],
        packingStyles: (payload.packing_styles || payload.packing || current.packingStyles || []).map(item => item.packing_style || item),
        packingStyleRecords: payload.packing_styles || current.packingStyleRecords || [],
        productionTypes: payload.production_types || payload.prod_types_list || current.productionTypes || [],
        stockLocations: (moduleKey === 'stock_entry' ? payload.locations : null) || current.stockLocations || [],
        purposes: payload.purposes || current.purposes || [],
        poNumbers: payload.po_numbers || payload.pending_orders?.map(item => item.po_number || item) || current.poNumbers || [],
        buyers: payload.buyers || current.buyers || [],
        agents: payload.agents || current.agents || [],
        countries: payload.countries || current.countries || [],
        coldStorages: payload.storage_masters?.map(item => item.cold_storage_name) || current.coldStorages || [],
      }));
      setForm(current => {
        const next = { ...current };
        if (moduleKey === 'pending_orders' && !next.sl_no && payload.next_sl != null) next.sl_no = String(payload.next_sl);
        if (moduleKey === 'cold_storage_holding' && !next.rent_start_date && payload.today_date) next.rent_start_date = String(payload.today_date);
        return next;
      });
    } catch (error) { setMessage(error.message || 'Unable to load operation data.'); }
    finally { setDataLoading(false); }
  };

  useEffect(() => {
    resetEntryForm();
    void loadOperation();
  }, [moduleKey, filters.location, filters.productionFor]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    Promise.all([
      apiRequest('/auth/global-dropdowns').catch(() => ({})),
      apiRequest('/inventory/stock_report?format=json').catch(() => ({})),
      apiRequest('/criteria/api/buyers').catch(() => ({})),
      apiRequest('/criteria/api/buyer_agents').catch(() => ({})),
      apiRequest('/criteria/api/countries').catch(() => ({})),
      apiRequest('/criteria/api/contractors').catch(() => ({})),
      apiRequest('/criteria/api/suppliers').catch(() => ({})),
      apiRequest('/criteria/api/chemicals').catch(() => ({})),
      apiRequest('/criteria/api/purposes').catch(() => ({})),
      apiRequest('/criteria/api/hsn_codes').catch(() => ({})),
      apiRequest('/criteria/api/vehicle_numbers').catch(() => ({})),
      apiRequest('/criteria/api/cold_storage').catch(() => ({})),
    ]).then(([global, stock, buyers, agents, countries, contractors, suppliers, chemicals, purposes, hsnCodes, vehicleNumbers, coldStorages]) => {
      const rows = stock.rows || [];
      setMasters(current => ({
        ...current,
        companies: current.companies?.length ? current.companies : (global.companies || stock.production_for_list || []),
        locations: current.locations?.length ? current.locations : (global.locations || stock.production_at_list || []),
        batches: current.batches?.length ? current.batches : unique(rows.map(row => row.batch_number)),
        brands: current.brands?.length ? current.brands : (stock.brands_list || unique(rows.map(row => row.brand))),
        species: current.species?.length ? current.species : (stock.species_list || unique(rows.map(row => row.species))),
        varieties: current.varieties?.length ? current.varieties : (stock.varieties_list || unique(rows.map(row => row.variety))),
        grades: current.grades?.length ? current.grades : (stock.grades_list || unique(rows.map(row => row.grade))),
        glazes: current.glazes?.length ? current.glazes : (stock.glazes_list || unique(rows.map(row => row.glaze))),
        freezers: current.freezers?.length ? current.freezers : (stock.freezers_list || unique(rows.map(row => row.freezer))),
        packingStyles: current.packingStyles?.length ? current.packingStyles : (stock.packing_styles_list || unique(rows.map(row => row.packing_style))),
        productionTypes: current.productionTypes?.length ? current.productionTypes : (stock.type_of_production_list || []),
        stockLocations: current.stockLocations?.length ? current.stockLocations : unique(rows.map(row => row.location)),
        purposes: current.purposes?.length ? current.purposes : lookupValues(purposes, ['purpose_name', 'purpose']),
        poNumbers: current.poNumbers?.length ? current.poNumbers : unique(rows.map(row => row.po_number)),
        buyers: current.buyers?.length ? current.buyers : lookupValues(buyers, ['buyer_name', 'name']),
        agents: current.agents?.length ? current.agents : lookupValues(agents, ['agent_name', 'name']),
        countries: current.countries?.length ? current.countries : lookupValues(countries, ['country_name', 'name']),
        contractors: current.contractors?.length ? current.contractors : lookupValues(contractors, ['contractor_name', 'name']),
        suppliers: current.suppliers?.length ? current.suppliers : lookupValues(suppliers, ['supplier_name', 'name']),
        chemicals: current.chemicals?.length ? current.chemicals : lookupValues(chemicals, ['chemical_name', 'name']),
        hsnCodes: current.hsnCodes?.length ? current.hsnCodes : lookupValues(hsnCodes, ['hsn_code', 'code']),
        vehicleNumbers: current.vehicleNumbers?.length ? current.vehicleNumbers : lookupValues(vehicleNumbers, ['vehicle_number', 'number']),
        coldStorages: current.coldStorages?.length ? current.coldStorages : lookupValues(coldStorages, ['storage_name', 'cold_storage_name', 'name']),
      }));
    });
  }, []);

  useEffect(() => {
    if (moduleKey !== 'raw_material_purchasing') return;
    const g1 = Number(form.g1_qty || 0); const g2 = Number(form.g2_qty || 0); const dc = Number(form.dc_qty || 0); const rate = Number(form.rate_per_kg || 0);
    setForm(current => ({ ...current, received_qty: (g1 + g2 + dc).toFixed(2), amount: ((g1 + (g2 / 2)) * rate).toFixed(2) }));
  }, [form.g1_qty, form.g2_qty, form.dc_qty, form.rate_per_kg, moduleKey]);
  useEffect(() => {
    if (!['de_heading', 'peeling'].includes(moduleKey)) return;
    const input = Number(moduleKey === 'de_heading' ? form.hoso_qty : form.hlso_qty) || 0;
    const output = Number(moduleKey === 'de_heading' ? form.hlso_qty : form.peeled_qty) || 0;
    const rate = Number(moduleKey === 'de_heading' ? form.rate_per_kg : form.rate) || 0;
    setForm(current => ({ ...current, yield_percent: input ? ((output / input) * 100).toFixed(2) : '0.00', amount: (output * rate).toFixed(2) }));
  }, [form.hoso_qty, form.hlso_qty, form.peeled_qty, form.rate_per_kg, form.rate, moduleKey]);
  useEffect(() => {
    if (moduleKey !== 'soaking') return;
    const input = Number(form.in_qty || 0);
    const chemicalPercent = Number(form.chemical_percent || 0);
    const saltPercent = Number(form.salt_percent || 0);
    setForm(current => ({
      ...current,
      chemical_qty: ((input * chemicalPercent) / 100).toFixed(2),
      salt_qty: ((input * saltPercent) / 100).toFixed(2),
    }));
  }, [form.in_qty, form.chemical_percent, form.salt_percent, moduleKey]);
  useEffect(() => {
    if (moduleKey !== 'soaking') return;
    const input = Number(form.in_qty || 0);
    const rejection = Number(form.rejection_qty || 0);
    if (input > 0 && rejection > 0) setForm(current => ({ ...current, rejection_qty: '0', rejection_for: '', sintex_number: 'AUTO' }));
    else if (rejection > 0 && input <= 0 && form.sintex_number) setForm(current => ({ ...current, sintex_number: '' }));
    else if (rejection <= 0 && !form.sintex_number) setForm(current => ({ ...current, sintex_number: 'AUTO' }));
  }, [form.in_qty, form.rejection_qty, form.sintex_number, moduleKey]);
  useEffect(() => {
    if (moduleKey !== 'production') return;
    const style = (masters.packingStyleRecords || []).find(item => item.packing_style === form.packing_style);
    const mcWeight = Number(style?.mc_weight || 0);
    const slabWeight = Number(style?.slab_weight || 0);
    const total = (Number(form.no_of_mc || 0) * mcWeight) + (Number(form.loose || 0) * slabWeight);
    setForm(current => ({ ...current, production_qty: total.toFixed(2) }));
  }, [form.loose, form.no_of_mc, form.packing_style, masters.packingStyleRecords, moduleKey]);
  useEffect(() => {
    if (moduleKey !== 'stock_entry' || form.cargo_movement_type !== 'IN') return;
    const style = (masters.packingStyleRecords || []).find(item => item.packing_style === form.packing_style);
    const total = (Number(form.no_of_mc || 0) * Number(style?.mc_weight || 0)) + (Number(form.loose || 0) * Number(style?.slab_weight || 0));
    setForm(current => ({ ...current, quantity: total.toFixed(2) }));
  }, [form.cargo_movement_type, form.loose, form.no_of_mc, form.packing_style, masters.packingStyleRecords, moduleKey]);
  useEffect(() => {
    if (!['de_heading', 'grading', 'peeling', 'soaking'].includes(moduleKey)) {
      setAvailableQty(null);
      return undefined;
    }
    let active = true;
    const loadAvailable = async () => {
      let endpoint = '';
      let poolAvailable = null;
      if (moduleKey === 'de_heading' && form.production_for && form.deheading_at && form.batch_number && form.hoso_count && form.species) {
        const params = new URLSearchParams({ location: form.deheading_at, production_for: form.production_for, batch: form.batch_number, count: form.hoso_count, species_name: form.species });
        endpoint = `/processing/get_available_qty?${params.toString()}`;
      }
      if (moduleKey === 'grading' && form.production_for && form.peeling_at && form.batch_number && form.hoso_count && form.species_val) {
        const matching = (operationData.deheading_pending || []).filter(row =>
          String(row.production_for || '').trim().toUpperCase() === String(form.production_for).trim().toUpperCase()
          && String(row.peeling_at || '').trim().toUpperCase() === String(form.peeling_at).trim().toUpperCase()
          && String(row.batch_number) === String(form.batch_number)
          && String(row.hoso_count) === String(form.hoso_count)
          && String(row.species || '').trim().toUpperCase() === String(form.species_val).trim().toUpperCase()
        );
        poolAvailable = matching.reduce((sum, row) => sum + Number(row.available_qty || 0), 0);
      }
      if (moduleKey === 'peeling' && form.production_for && form.location && form.batch_number && form.in_count && form.species) {
        const source = (operationData.hlso_floor_balance || []).find(row =>
          String(row.production_for || '').trim().toUpperCase() === String(form.production_for).trim().toUpperCase()
          && String(row.location || '').trim().toUpperCase() === String(form.location).trim().toUpperCase()
          && String(row.batch || row.batch_number) === String(form.batch_number)
          && String(row.count) === String(form.in_count)
          && String(row.species || '').trim().toUpperCase() === String(form.species).trim().toUpperCase()
        );
        const sourceVariety = source?.variety || masters.varietyMap?.[form.in_count] || 'HLSO';
        const params = new URLSearchParams({ location: form.location, batch: form.batch_number, count: form.in_count, species_name: form.species, variety_name: sourceVariety, production_for: form.production_for });
        endpoint = `/processing/peeling/get_available_qty?${params.toString()}`;
      }
      if (moduleKey === 'soaking' && form.production_for && form.production_at && form.batch_number && form.in_count && form.species_name && form.variety_name) {
        const params = new URLSearchParams({ location: form.production_at, batch: form.batch_number, count: form.in_count, species: form.species_name, variety: form.variety_name, production_for: form.production_for });
        endpoint = `/processing/soaking/get_available_qty?${params.toString()}`;
      }
      if (poolAvailable !== null) {
        setAvailableLoading(false);
        setAvailableQty(poolAvailable);
        return;
      }
      if (!endpoint) {
        setAvailableLoading(false);
        setAvailableQty(null);
        return;
      }
      setAvailableLoading(true);
      try {
        const result = await apiRequest(endpoint);
        if (active) setAvailableQty(Number(result.available_qty || 0));
      } catch {
        if (active) setAvailableQty(0);
      } finally {
        if (active) setAvailableLoading(false);
      }
    };
    void loadAvailable();
    return () => { active = false; };
  }, [
    form.production_for, form.deheading_at, form.peeling_at, form.production_at, form.location,
    form.batch_number, form.hoso_count, form.in_count, form.species, form.species_name,
    form.variety_name, masters.varietyMap, moduleKey, operationData.deheading_pending,
    operationData.hlso_floor_balance,
  ]);

  const nextSequence = value => {
    if (!value) return '';
    const parts = String(value).split('-'); const last = parts.at(-1); const number = Number(last);
    if (!Number.isFinite(number)) return `${value}-1`;
    parts[parts.length - 1] = String(number + 1).padStart(last.length, '0');
    return parts.join('-');
  };
  const changeField = async (name, value) => {
    setForm(current => {
      const next = { ...current, [name]: value };
      if (['production_for', 'deheading_at', 'peeling_at', 'production_at', 'location'].includes(name)) {
        next.batch_number = '';
        next.hoso_count = '';
        next.in_count = '';
      }
      if (name === 'batch_number') {
        next.hoso_count = '';
        next.in_count = '';
      }
      if (moduleKey === 'grading' && ['production_for', 'peeling_at', 'batch_number'].includes(name)) next.species_val = '';
      if (moduleKey === 'peeling' && ['production_for', 'location', 'batch_number'].includes(name)) next.species = '';
      if (moduleKey === 'soaking' && ['production_for', 'production_at', 'batch_number'].includes(name)) {
        next.species_name = '';
        next.variety_name = '';
      }
      if (moduleKey === 'production' && ['production_for', 'production_at'].includes(name)) {
        next.species = '';
        next.variety_name = '';
      }
      if (moduleKey === 'gate_entry' && ['production_for', 'receiving_center'].includes(name)) {
        const company = name === 'production_for' ? value : next.production_for;
        const location = String(name === 'receiving_center' ? value : next.receiving_center || '').trim().toUpperCase();
        if (company && location) {
          next.batch_number = nextSequence(operationData.last_batch_map?.[company] || '');
          next.challan_number = nextSequence(operationData.last_challan_map?.[company] || '');
          next.gate_pass_number = nextSequence(operationData.last_gp_combo_map?.[company]?.[location] || operationData.last_gp_value || '');
        }
      }
      if (moduleKey === 'raw_material_purchasing' && name === 'batch_number') {
        const batch = operationData.batch_supplier_map?.[value] || {};
        next.supplier_name = batch.supplier || next.supplier_name || '';
        next.production_for = batch.prod_for || next.production_for || '';
        next.peeling_at = batch.receiving_center || next.peeling_at || '';
      }
      if (moduleKey === 'raw_material_purchasing' && name === 'product_description') next.hsn_code = operationData.hsn_map?.[value] || '';
      if (moduleKey === 'peeling' && name === 'in_count') {
        const source = (operationData.hlso_floor_balance || []).find(row =>
          String(row.production_for || '').trim().toUpperCase() === String(next.production_for || '').trim().toUpperCase()
          && String(row.location || '').trim().toUpperCase() === String(next.location || '').trim().toUpperCase()
          && String(row.batch || row.batch_number) === String(next.batch_number)
          && String(row.count) === String(value)
        );
        next.species = source?.species || next.species || '';
      }
      if (moduleKey === 'grading' && name === 'hoso_count') {
        const matches = (operationData.deheading_pending || []).filter(row =>
          String(row.production_for || '').trim().toUpperCase() === String(next.production_for || '').trim().toUpperCase()
          && String(row.peeling_at || '').trim().toUpperCase() === String(next.peeling_at || '').trim().toUpperCase()
          && String(row.batch_number) === String(next.batch_number)
          && String(row.hoso_count) === String(value)
        );
        const speciesChoices = unique(matches.map(row => row.species));
        if (speciesChoices.length === 1) next.species_val = speciesChoices[0];
      }
      if (moduleKey === 'production' && name === 'batch_number') {
        const matches = (operationData.soaking_data || []).filter(row =>
          String(row.batch_number) === String(value)
          && String(row.production_for || '').trim().toUpperCase() === String(next.production_for || '').trim().toUpperCase()
          && String(row.production_at || '').trim().toUpperCase() === String(next.production_at || '').trim().toUpperCase()
        );
        const matchedSpecies = unique(matches.map(row => row.species));
        const matchedVarieties = unique(matches.map(row => row.variety_name));
        next.species = matchedSpecies[0] || '';
        next.variety_name = matchedVarieties[0] || '';
      }
      if (moduleKey === 'cold_storage_holding' && name === 'cold_storage_name') {
        const storage = (operationData.storage_masters || []).find(item => item.cold_storage_name === value);
        next.address = storage?.address || '';
        next.storage_rate_per_mc = String(storage?.rate_per_mc ?? 0);
      }
      if (moduleKey === 'stock_entry' && name === 'cargo_movement_type') setStockOutRows([]);
      return next;
    });
    try {
      if (['de_heading', 'grading'].includes(moduleKey) && ['production_for', 'deheading_at', 'peeling_at'].includes(name)) {
        const company = name === 'production_for' ? value : form.production_for;
        const location = name === 'deheading_at' || name === 'peeling_at' ? value : (moduleKey === 'de_heading' ? form.deheading_at : form.peeling_at);
        if (company && location) {
          const endpoint = moduleKey === 'de_heading'
            ? `/processing/get_valid_batches/${encodeURIComponent(company)}/${encodeURIComponent(location)}`
            : `/processing/grading/get_batches/${encodeURIComponent(company)}/${encodeURIComponent(location)}`;
          const result = await apiRequest(endpoint);
          setMasters(current => ({ ...current, batches: result.batches || [] }));
        }
      }
      if (['peeling', 'soaking'].includes(moduleKey) && name === 'production_for' && value) {
        const endpoint = moduleKey === 'peeling' ? `/processing/peeling/get_batches_by_company?prod_for=${encodeURIComponent(value)}` : `/processing/soaking/get_batches_by_company?prod_for=${encodeURIComponent(value)}`;
        const result = await apiRequest(endpoint);
        setMasters(current => ({ ...current, batches: result.batches || [] }));
      }
      if (moduleKey === 'de_heading' && name === 'contractor' && value) {
        const result = await apiRequest(`/processing/get_rate/${encodeURIComponent(value)}`);
        setForm(current => ({ ...current, rate_per_kg: String(result.rate || 0) }));
      }
      if (moduleKey === 'peeling' && name === 'contractor_name' && value && form.variety) {
        const result = await apiRequest(`/processing/peeling/get_rate?contractor=${encodeURIComponent(value)}&variety=${encodeURIComponent(form.variety)}`);
        setForm(current => ({ ...current, rate: String(result.rate || 0) }));
      }
      if (['de_heading', 'grading', 'peeling', 'soaking'].includes(moduleKey) && name === 'batch_number' && value) {
        let endpoint = '';
        if (moduleKey === 'de_heading' && form.production_for && form.deheading_at) endpoint = `/processing/get_hoso/${encodeURIComponent(form.production_for)}/${encodeURIComponent(form.deheading_at)}/${encodeURIComponent(value)}`;
        if (moduleKey === 'grading' && form.production_for && form.peeling_at) endpoint = `/processing/grading/get_hoso/${encodeURIComponent(form.production_for)}/${encodeURIComponent(form.peeling_at)}/${encodeURIComponent(value)}`;
        if (moduleKey === 'peeling') endpoint = `/processing/peeling/get_hlso/${encodeURIComponent(value)}`;
        if (moduleKey === 'soaking') endpoint = `/processing/soaking/get_count/${encodeURIComponent(value)}?production_for=${encodeURIComponent(form.production_for || '')}&location=${encodeURIComponent(form.production_at || '')}`;
        if (endpoint) {
          const result = await apiRequest(endpoint);
          setMasters(current => ({ ...current, counts: result.counts || [], speciesMap: result.species_map || {}, varietyMap: result.variety_map || {} }));
        }
      }
      if (moduleKey === 'stock_entry' && name === 'production_at' && value) {
        const result = await apiRequest(`/inventory/get_matched_coldstores?production_at=${encodeURIComponent(value)}`);
        setMasters(current => ({ ...current, stockLocations: result.locations || [] }));
      }
      if (moduleKey === 'cold_storage_holding' && ['production_for', 'purpose'].includes(name)) {
        const company = name === 'production_for' ? value : form.production_for;
        const purpose = name === 'purpose' ? value : (form.purpose || 'Storing');
        if (company && purpose) {
          const result = await apiRequest(`/inventory/get_storing_batches?production_for_val=${encodeURIComponent(company)}&purpose_val=${encodeURIComponent(purpose)}`);
          setMasters(current => ({ ...current, batches: result.batches || [] }));
        }
      }
    } catch { /* Keep manual entry available if an autofill lookup is unavailable. */ }
  };

  const searchStockOut = async () => {
    const needed = ['production_at', 'brand', 'freezer', 'packing_style', 'glaze', 'species', 'variety', 'grade'];
    const missing = needed.filter(name => !String(form[name] || '').trim());
    if (missing.length) { setMessage('Complete all stock specification filters before searching.'); return; }
    setStockOutLoading(true); setMessage('');
    try {
      const query = new URLSearchParams();
      ['production_for', 'production_at', 'brand', 'freezer', 'packing_style', 'glaze', 'species', 'variety', 'grade'].forEach(name => {
        if (form[name]) query.set(name, form[name]);
      });
      const result = await apiRequest(`/inventory/stock_out_report?${query.toString()}`);
      setStockOutRows((Array.isArray(result) ? result : []).map(row => ({ ...row, out_mc: '', out_loose: '' })));
      if (!result?.length) setMessage('No matching available stock found.');
    } catch (error) { setMessage(error.message || 'Unable to search available stock.'); }
    finally { setStockOutLoading(false); }
  };

  const changePendingItem = (index, name, value) => setPendingItems(items => items.map((item, itemIndex) => itemIndex === index ? { ...item, [name]: value } : item));

  useEffect(() => {
    if (moduleKey !== 'peeling' || !form.contractor_name || !form.variety) return;
    let active = true;
    apiRequest(`/processing/peeling/get_rate?contractor=${encodeURIComponent(form.contractor_name)}&variety=${encodeURIComponent(form.variety)}`)
      .then(result => { if (active) setForm(current => ({ ...current, rate: String(result.rate || 0) })); })
      .catch(() => {});
    return () => { active = false; };
  }, [form.contractor_name, form.variety, moduleKey]);

  const valuesForField = field => {
    if (field.values) return field.values;
    const base = masters[field.source] || [];
    if (moduleKey === 'stock_entry' && field.name === 'po_number') return unique(['N/A', ...base]);
    const company = String(form.production_for || '').trim().toUpperCase();
    const location = String(form.deheading_at || form.peeling_at || form.production_at || form.location || '').trim().toUpperCase();
    if (moduleKey === 'raw_material_purchasing' && field.name === 'batch_number') {
      const candidates = operationData.prod_batch_map?.[company] || [];
      return candidates.filter(batch => {
        const details = operationData.batch_supplier_map?.[batch] || {};
        return (!company || String(details.prod_for || '').trim().toUpperCase() === company)
          && (!location || String(details.receiving_center || '').trim().toUpperCase() === location);
      });
    }
    if (moduleKey === 'de_heading') {
      const pool = (operationData.hoso_floor_balance || []).filter(row =>
        (!company || String(row.production_for || '').trim().toUpperCase() === company)
        && (!location || String(row.peeling_at || '').trim().toUpperCase() === location)
        && (!form.batch_number || String(row.batch) === String(form.batch_number))
        && (!form.hoso_count || String(row.count) === String(form.hoso_count))
      );
      if (field.name === 'batch_number') return unique(pool.map(row => row.batch));
      if (field.name === 'hoso_count') return unique(pool.map(row => row.count));
      if (field.name === 'species') {
        const choices = unique(pool.map(row => row.species));
        return choices.length ? choices : base;
      }
    }
    if (moduleKey === 'grading') {
      const pool = (operationData.deheading_pending || []).filter(row =>
        (!company || String(row.production_for || '').trim().toUpperCase() === company)
        && (!location || String(row.peeling_at || '').trim().toUpperCase() === location)
        && (!form.batch_number || String(row.batch_number) === String(form.batch_number))
        && (!form.hoso_count || String(row.hoso_count) === String(form.hoso_count))
      );
      if (field.name === 'batch_number') return unique(pool.map(row => row.batch_number));
      if (field.name === 'hoso_count') return unique(pool.map(row => row.hoso_count));
      if (field.name === 'species_val') return unique(pool.map(row => row.species));
    }
    if (moduleKey === 'peeling') {
      const pool = (operationData.hlso_floor_balance || []).filter(row =>
        (!company || String(row.production_for || '').trim().toUpperCase() === company)
        && (!location || String(row.location || '').trim().toUpperCase() === location)
        && (!form.batch_number || String(row.batch || row.batch_number) === String(form.batch_number))
      );
      if (field.name === 'batch_number') return unique(pool.map(row => row.batch || row.batch_number));
      if (field.name === 'in_count') return unique(pool.map(row => row.count));
      if (field.name === 'species') return unique(pool.filter(row => !form.in_count || String(row.count) === String(form.in_count)).map(row => row.species));
    }
    if (moduleKey === 'soaking') {
      const pool = (operationData.rows_batch || []).filter(row =>
        (!company || String(row.production_for || '').trim().toUpperCase() === company)
        && (!location || String(row.location || '').trim().toUpperCase() === location)
        && (!form.batch_number || String(row.batch || row.batch_number) === String(form.batch_number))
      );
      if (field.name === 'batch_number') return unique(pool.map(row => row.batch || row.batch_number));
      if (field.name === 'in_count') return unique(pool.map(row => row.count));
      if (field.name === 'species_name') return unique(pool.filter(row => !form.in_count || String(row.count) === String(form.in_count)).map(row => row.species));
      if (field.name === 'variety_name') return unique(pool.filter(row => !form.in_count || String(row.count) === String(form.in_count)).map(row => row.variety));
    }
    if (moduleKey === 'production' && field.name === 'batch_number') {
      return unique((operationData.soaking_data || []).filter(row =>
        (!company || String(row.production_for || '').trim().toUpperCase() === company)
        && (!location || String(row.production_at || '').trim().toUpperCase() === location)
      ).map(row => row.batch_number));
    }
    if (moduleKey === 'stock_entry' && field.name === 'batch_number') {
      return unique((operationData.batch_data_list || []).filter(row =>
        (!company || String(row.production_for || '').trim().toUpperCase() === company)
        && (!location || String(row.production_at || '').trim().toUpperCase() === location)
      ).map(row => row.batch_number));
    }
    return base;
  };

  const requiredNames = {
    gate_entry: ['production_for', 'receiving_center', 'gate_pass_number', 'batch_number', 'challan_number', 'supplier_name', 'purchasing_location', 'vehicle_number'],
    raw_material_purchasing: ['production_for', 'peeling_at', 'batch_number', 'product_description', 'variety_name', 'species', 'rate_per_kg'],
    de_heading: ['production_for', 'deheading_at', 'species', 'batch_number', 'hoso_count', 'hoso_qty', 'hlso_qty', 'contractor'],
    grading: ['production_for', 'peeling_at', 'batch_number', 'hoso_count', 'species_val', 'variety_name', 'graded_count', 'quantity'],
    peeling: ['production_for', 'location', 'batch_number', 'in_count', 'species', 'hlso_qty', 'variety', 'peeled_qty', 'contractor_name'],
    soaking: ['production_for', 'production_at', 'batch_number', 'in_count', 'variety_name', 'species_name', 'chemical_name', 'chemical_percent', 'salt_percent'],
    production: ['production_for', 'production_at', 'batch_number', 'species', 'variety_name', 'brand', 'production_type', 'packing_style'],
    stock_entry: form.cargo_movement_type === 'OUT'
      ? ['production_at', 'brand', 'freezer', 'packing_style', 'glaze', 'species', 'variety', 'grade']
      : ['production_for', 'production_at', 'batch_number', 'type_of_production', 'location', 'brand', 'freezer', 'packing_style', 'glaze', 'species', 'variety', 'grade', 'no_of_mc', 'loose'],
    pending_orders: ['sl_no', 'shipment_date', 'company_name', 'po_number', 'production_at', 'exchange_rate', 'buyer', 'agent', 'country'],
    cold_storage_holding: ['cold_storage_name', 'address', 'rent_start_date', 'production_for', 'batch_number', 'cargo_movement_type', 'species', 'variety', 'grade', 'brand', 'packing_style'],
  }[moduleKey] || [];
  const requiredMissing = useMemo(() => activeFields.filter(field => requiredNames.includes(field.name) && !String(form[field.name] ?? '').trim()), [activeFields, form, requiredNames]);
  const save = async () => {
    if (requiredMissing.length) { setMessage(`Required: ${requiredMissing.map(item => item.label).join(', ')}`); return; }
    const requestedQty = Number(moduleKey === 'de_heading' ? form.hoso_qty : moduleKey === 'grading' ? form.quantity : moduleKey === 'peeling' ? form.hlso_qty : moduleKey === 'soaking' ? form.in_qty : 0);
    if (['de_heading', 'grading', 'peeling', 'soaking'].includes(moduleKey) && requestedQty > Number(availableQty || 0) + 0.1) {
      setMessage(`Quantity exceeds available floor balance (${number(availableQty)} KG).`);
      return;
    }
    if (moduleKey === 'soaking' && requestedQty <= 0 && Number(form.rejection_qty || 0) <= 0) {
      setMessage('Enter either Input Qty or Rejection Qty.');
      return;
    }
    if (moduleKey === 'stock_entry' && form.cargo_movement_type === 'OUT') {
      if (!stockOutRows.length) { setMessage('Search available stock first.'); return; }
      const invalid = stockOutRows.some(row => Number(row.out_mc || 0) > Number(row.mc || 0) || Number(row.out_loose || 0) > Number(row.loose || 0));
      const selected = stockOutRows.filter(row => Number(row.out_mc || 0) > 0 || Number(row.out_loose || 0) > 0);
      if (invalid) { setMessage('Stock-out quantity exceeds an available balance.'); return; }
      if (!selected.length) { setMessage('Enter MC or Loose quantity for at least one available batch.'); return; }
    }
    if (moduleKey === 'pending_orders') {
      const itemRequired = ['brand', 'packing_style', 'freezer', 'count_glaze', 'weight_glaze', 'species', 'variety', 'grade', 'no_of_pieces', 'no_of_mc', 'selling_price'];
      if (!pendingItems.length || pendingItems.some(item => itemRequired.some(name => !String(item[name] ?? '').trim()))) {
        setMessage('Complete every field in each order item line.');
        return;
      }
    }
    setSaving(true); setMessage('');
    const body = new FormData();
    activeFields.forEach(field => {
      if (moduleKey === 'stock_entry' && form.cargo_movement_type === 'OUT' && field.name === 'cargo_movement_type') return;
      const rawValue = form[field.name] || '';
      const value = ['de_heading', 'peeling'].includes(moduleKey) && field.name === 'yield_percent' && rawValue ? `${String(rawValue).replace('%', '')}%` : rawValue;
      body.append(field.name, value);
    });
    if (moduleKey === 'stock_entry' && form.cargo_movement_type === 'OUT') {
      stockOutRows.filter(row => Number(row.out_mc || 0) > 0 || Number(row.out_loose || 0) > 0).forEach(row => {
        body.append('out_batch', row.batch);
        body.append('out_location', row.location);
        body.append('out_mc', String(Number(row.out_mc || 0)));
        body.append('out_loose', String(Number(row.out_loose || 0)));
      });
    }
    if (moduleKey === 'pending_orders') {
      pendingItems.forEach(item => pendingItemFields.forEach(field => body.append(field.name, item[field.name] || '')));
    }
    try {
      const route = moduleKey === 'stock_entry' && form.cargo_movement_type === 'OUT' ? '/inventory/stock_out_save' : module.route;
      await apiRequest(route, { method: 'POST', body, parseResponse: false });
      const success = `${module.title} saved successfully.`;
      setMessage('');
      setSuccessMessage(success);
      resetEntryForm();
      await loadOperation();
    } catch (error) { setMessage(error.message || 'Unable to save entry.'); }
    finally { setSaving(false); }
  };

  const cancelEntry = async () => {
    if (!cancelRow) return;
    const body = new FormData();
    if (moduleKey !== 'pending_orders') body.append('cancel_reason', cancelReason.trim() || 'Cancelled from mobile app');
    try {
      const target = moduleKey === 'pending_orders' ? meta.cancel(cancelRow) : meta.cancel(cancelRow.id);
      await apiRequest(target, { method: 'POST', body, parseResponse: false });
      setMessage('Entry cancelled successfully.');
      setCancelRow(null); setCancelReason('');
      await loadOperation();
    } catch (error) { setMessage(error.message || 'Unable to cancel entry.'); }
  };

  const updateSoakingStatus = async (row, status) => {
    const busyKey = `soaking:${row.id}`;
    setStatusBusy(busyKey); setMessage('');
    try {
      const result = await apiRequest(`/processing/production/update_soaking_status/${row.id}`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      if (result.status !== 'ok') throw new Error(result.message || 'Unable to update soaking status.');
      await loadOperation();
      Alert.alert('Status Updated', result.message || `Soaking marked ${status}.`);
    } catch (error) {
      setMessage(error.message || 'Unable to update soaking status.');
    } finally {
      setStatusBusy('');
    }
  };

  const confirmSoakingStatus = (row, status) => {
    if (!row?.id || status === row.status) return;
    Alert.alert(
      status === 'Completed' ? 'Complete Soaking?' : 'Update Soaking Status?',
      status === 'Completed'
        ? 'This soaking line will be marked DONE and removed from active lines.'
        : `Change this soaking line to ${status}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: status === 'Completed' ? 'Complete' : 'Update', onPress: () => { void updateSoakingStatus(row, status); } },
      ],
    );
  };

  const completeRejection = async row => {
    const busyKey = `rejection:${row.id}`;
    setStatusBusy(busyKey); setMessage('');
    try {
      const result = await apiRequest(`/processing/production/complete_rejection/${row.id}`, { method: 'POST' });
      if (result.status !== 'ok') throw new Error(result.message || 'Unable to complete rejection.');
      await loadOperation();
      Alert.alert('Rejection Completed', result.message || 'Offset entry added successfully.');
    } catch (error) {
      setMessage(error.message || 'Unable to complete rejection.');
    } finally {
      setStatusBusy('');
    }
  };

  const confirmRejectionComplete = row => {
    if (!row?.id) return;
    Alert.alert(
      'Complete Rejection?',
      'This rejection row will be marked DONE and an offset entry will be added.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Complete', onPress: () => { void completeRejection(row); } },
      ],
    );
  };

  if (moduleKey === 'gate_entry' && gateSection === 'goods') {
    return <Screen title="Gate Entry" subtitle="Non-RMP Goods IN / OUT" globalFilters={filters} onBack={onBack}>
      <WorkspaceTabs tabs={[{ key: 'raw', label: 'RAW MATERIAL' }, { key: 'goods', label: 'GOODS IN / OUT' }]} value={gateSection} onChange={setGateSection} />
      <NativeGoodsGateMovements filters={filters} />
    </Screen>;
  }

  return <Screen title={module.title} subtitle={`${rows.length} register rows`} globalFilters={filters} onBack={onBack} onRefresh={loadOperation}>
    {moduleKey === 'gate_entry' ? <WorkspaceTabs tabs={[{ key: 'raw', label: 'RAW MATERIAL' }, { key: 'goods', label: 'GOODS IN / OUT' }]} value={gateSection} onChange={setGateSection} /> : null}
    <WorkspaceTabs tabs={workspaceTabs} value={view} onChange={setView} />
    {message ? <View style={styles.errorBanner}><Text style={styles.errorBannerText}>{message}</Text><Pressable accessibilityLabel="Dismiss error" onPress={() => setMessage('')} style={styles.errorClose}><Text style={styles.errorCloseText}>×</Text></Pressable></View> : null}
    {view === 'form' ? <>
      <SectionTitle>Entry Details</SectionTitle>
      <View style={styles.form}>
        {activeFields.map(field => field.select
          ? <NativeDropdown key={field.name} required={requiredNames.includes(field.name)} label={field.label} values={valuesForField(field)} value={form[field.name] || ''} onChange={value => changeField(field.name, value)} placeholder={`Select ${field.label.toLowerCase()}`} />
          : <View key={field.name} style={styles.field}><Text style={styles.label}>{field.label}{requiredNames.includes(field.name) ? <Text style={styles.required}> *</Text> : null}</Text><TextInput editable={!field.readOnly} value={form[field.name] || ''} onChangeText={value => changeField(field.name, value)} keyboardType={field.keyboardType || 'default'} placeholder={field.readOnly ? 'Auto' : `Enter ${field.label.toLowerCase()}`} placeholderTextColor="#94a3b8" style={[styles.input, field.readOnly && styles.readOnlyInput]} /></View>)}
        {moduleKey === 'stock_entry' && form.cargo_movement_type === 'OUT' ? <>
          <Pressable disabled={stockOutLoading} onPress={searchStockOut} style={[styles.searchButton, stockOutLoading && styles.disabled]}><Text style={styles.searchButtonText}>{stockOutLoading ? 'Searching…' : 'Search Available Stock'}</Text></Pressable>
          {stockOutRows.length ? <View style={styles.lineList}>{stockOutRows.map((row, index) => <View key={`${row.location}-${row.batch}`} style={styles.lineCard}>
            <View style={styles.lineHeader}><View style={styles.lineHeaderCopy}><Text style={styles.lineTitle}>{row.batch || 'No Batch'}</Text><Text style={styles.lineSub}>{row.location || 'No Location'}</Text></View><Text style={styles.lineBalance}>{number(row.mc)} MC • {number(row.loose)} Loose</Text></View>
            <View style={styles.lineInputs}><View style={styles.lineField}><Text style={styles.label}>OUT MC</Text><TextInput value={String(row.out_mc ?? '')} onChangeText={value => setStockOutRows(items => items.map((item, itemIndex) => itemIndex === index ? { ...item, out_mc: value } : item))} keyboardType="numeric" placeholder="0" placeholderTextColor="#94a3b8" style={styles.input} /></View><View style={styles.lineField}><Text style={styles.label}>OUT LOOSE</Text><TextInput value={String(row.out_loose ?? '')} onChangeText={value => setStockOutRows(items => items.map((item, itemIndex) => itemIndex === index ? { ...item, out_loose: value } : item))} keyboardType="numeric" placeholder="0" placeholderTextColor="#94a3b8" style={styles.input} /></View></View>
          </View>)}</View> : null}
        </> : null}
        {moduleKey === 'pending_orders' ? <>
          <SectionTitle>Order Item Lines</SectionTitle>
          <View style={styles.lineList}>{pendingItems.map((item, index) => <View key={`pending-item-${index}`} style={styles.lineCard}>
            <View style={styles.lineHeader}><Text style={styles.lineTitle}>Item {index + 1}</Text>{pendingItems.length > 1 ? <Pressable onPress={() => setPendingItems(items => items.filter((_, itemIndex) => itemIndex !== index))} style={styles.removeLine}><Text style={styles.removeLineText}>Remove</Text></Pressable> : null}</View>
            {pendingItemFields.map(field => field.select
              ? <NativeDropdown key={field.name} required label={field.label} values={field.values || masters[field.source] || []} value={item[field.name] || ''} onChange={value => changePendingItem(index, field.name, value)} placeholder={`Select ${field.label.toLowerCase()}`} />
              : <View key={field.name} style={styles.field}><Text style={styles.label}>{field.label}<Text style={styles.required}> *</Text></Text><TextInput value={item[field.name] || ''} onChangeText={value => changePendingItem(index, field.name, value)} keyboardType={field.keyboardType || 'default'} placeholder={`Enter ${field.label.toLowerCase()}`} placeholderTextColor="#94a3b8" style={styles.input} /></View>)}
          </View>)}</View>
          <Pressable onPress={() => setPendingItems(items => [...items, emptyPendingItem()])} style={styles.addLine}><Text style={styles.addLineText}>+ Add Entry Line</Text></Pressable>
        </> : null}
        {['de_heading', 'grading', 'peeling', 'soaking'].includes(moduleKey) ? <View style={[styles.availableCard, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}><Text style={[styles.availableLabel, { color: theme.muted }]}>AVAILABLE QUANTITY</Text><Text style={[styles.availableValue, { color: Number(availableQty || 0) > 0 ? '#0f766e' : theme.muted }]}>{availableLoading ? 'Checking…' : availableQty === null ? 'Complete the source selections' : `${number(availableQty)} KG`}</Text></View> : null}
      </View>
      <Pressable disabled={saving} onPress={save} style={[styles.save, saving && styles.disabled]}><Text style={styles.saveText}>{saving ? 'Saving…' : 'Save'}</Text></Pressable>
    </> : dataLoading ? <Loading text="Loading table…" /> : activeAuxiliaryKey
      ? <AuxiliaryTableTab
          moduleKey={moduleKey}
          dataKey={activeAuxiliaryKey}
          data={operationData}
          tableHeight={tableViewportHeight}
          statusBusy={statusBusy}
          onSoakingStatus={confirmSoakingStatus}
          onRejectionComplete={confirmRejectionComplete}
        />
      : <>
      <SectionTitle>Register Table</SectionTitle>
      <OperationTable rows={rows} columns={meta.columns} tableHeight={tableViewportHeight} groupByPo={moduleKey === 'pending_orders'} onCancel={row => { if (!row.is_cancelled) { setCancelRow(row); setCancelReason(''); } }} />
      {cancelRow ? <View style={styles.cancelPanel}><Text style={styles.cancelTitle}>Cancel selected entry</Text><Text style={styles.cancelSub}>{cancelRow.batch_number || cancelRow.po_number || `Record #${cancelRow.id}`}</Text>{moduleKey !== 'pending_orders' ? <TextInput value={cancelReason} onChangeText={setCancelReason} placeholder="Cancellation reason" placeholderTextColor="#94a3b8" style={styles.input} /> : null}<View style={styles.cancelActions}><Pressable onPress={() => setCancelRow(null)} style={styles.keepButton}><Text style={styles.keepText}>Keep Entry</Text></Pressable><Pressable onPress={cancelEntry} style={styles.cancelButton}><Text style={styles.cancelText}>Cancel Entry</Text></Pressable></View></View> : null}
    </>}
    <Modal visible={Boolean(successMessage)} transparent animationType="fade" onRequestClose={() => setSuccessMessage('')}>
      <View style={styles.successOverlay}><View style={styles.successCard}><View style={styles.successIcon}><Text style={styles.successIconText}>✓</Text></View><Text style={styles.successTitle}>Entry Saved</Text><Text style={styles.successCopy}>{successMessage}</Text><Pressable onPress={() => setSuccessMessage('')} style={styles.successButton}><Text style={styles.successButtonText}>Continue</Text></Pressable></View></View>
    </Modal>
  </Screen>;
}

function WorkspaceTabs({ tabs, value, onChange }) {
  const buttons = tabs.map(tab => (
    <Pressable key={tab.key} onPress={() => onChange(tab.key)} style={[styles.tab, value === tab.key && styles.tabActive]}>
      <Text numberOfLines={1} style={[styles.tabText, value === tab.key && styles.tabTextActive]}>{tab.label}</Text>
    </Pressable>
  ));
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>{buttons}</ScrollView>;
}

function OperationTable({ rows, columns, onCancel, groupByPo = false, tableHeight = 430 }) {
  const { theme } = useERPTheme();
  const { width: windowWidth } = useWindowDimensions();
  const resolved = useMemo(() => resolveColumns(columns, rows), [columns, rows]);
  const actionWidth = 58;
  const contentWidth = resolvedTableWidth(resolved, actionWidth);
  const availableWidth = Math.max(280, windowWidth - 22);
  const fixed = columns.length <= 3 && contentWidth <= availableWidth;
  const width = fixed ? availableWidth : contentWidth;
  const displayRows = useMemo(() => {
    if (!groupByPo) return rows.slice(0, 150).map((row, index) => ({ type: 'data', row, key: row.id || `${row.po_number}-${index}` }));
    const groups = new Map();
    rows.slice(0, 150).forEach(row => {
      const po = String(row.po_number || 'No PO');
      if (!groups.has(po)) groups.set(po, []);
      groups.get(po).push(row);
    });
    const output = [];
    groups.forEach((poRows, po) => {
      poRows.forEach((row, index) => output.push({ type: 'data', row, key: row.id || `${po}-${index}` }));
      const totalMc = poRows.reduce((sum, row) => sum + Number(row.no_of_mc || 0), 0);
      const totalPrice = poRows.reduce((sum, row) => sum + Number(row.selling_price || 0), 0);
      const averageExchange = poRows.length ? poRows.reduce((sum, row) => sum + Number(row.exchange_rate || 0), 0) / poRows.length : 0;
      output.push({ type: 'poSubtotal', po, totalMc, totalPrice, averageExchange, key: `subtotal-${po}` });
    });
    return output;
  }, [groupByPo, rows]);
  const subtotalValue = (item, key) => {
    if (key === 'po_number') return `SUBTOTAL (${item.po})`;
    if (key === 'no_of_mc') return number(item.totalMc);
    if (key === 'selling_price') return `$ ${number(item.totalPrice)}`;
    if (key === 'exchange_rate') return `₹ ${number(item.averageExchange)}`;
    return '';
  };
  const table = (
    <View style={[fixed && styles.fixedTable, { width }]}>
      <View style={[styles.tableHeader, nativeTableStyles.header, { backgroundColor: theme.tableHead }]}>
        {resolved.map(column => (
          <Text
            key={column.key}
            style={[
              styles.headerCell,
              nativeTableStyles.headerCell,
              fixed ? styles.flexCell : { width: column.width },
              { textAlign: column.align },
            ]}
          >
            {column.label}
          </Text>
        ))}
        <Text style={[styles.headerCell, nativeTableStyles.headerCell, fixed ? styles.actionFlexCell : { width: actionWidth }, { textAlign: 'center' }]}>Action</Text>
      </View>
      <ScrollView style={[styles.tableBody, { height: Math.max(260, tableHeight - 30) }]} nestedScrollEnabled>
        {displayRows.length ? displayRows.map(item => item.type === 'data' ? (
          <View key={item.key} style={[styles.tableRow, nativeTableStyles.row, item.row.is_cancelled && styles.cancelledRow]}>
            {resolved.map(column => (
              <Text
                numberOfLines={2}
                key={column.key}
                style={[
                  styles.tableCell,
                  nativeTableStyles.cell,
                  fixed ? styles.flexCell : { width: column.width },
                  { textAlign: column.align },
                ]}
              >
                {displayValue(item.row, column.key)}
              </Text>
            ))}
            <View style={[styles.actionCell, nativeTableStyles.partition, fixed ? styles.actionFlexCell : { width: actionWidth }]}>
              {item.row.is_cancelled
                ? <Text style={styles.cancelledText}>CANCELLED</Text>
                : <Pressable onPress={() => onCancel(item.row)} style={styles.rowCancel}><Text style={styles.rowCancelText}>Cancel</Text></Pressable>}
            </View>
          </View>
        ) : (
          <View key={item.key} style={[styles.tableRow, nativeTableStyles.row, styles.poSubtotalRow, nativeTableStyles.subtotalRow]}>
            {resolved.map(column => (
              <Text
                numberOfLines={2}
                key={column.key}
                style={[
                  styles.tableCell,
                  nativeTableStyles.cell,
                  styles.poSubtotalCell,
                  nativeTableStyles.subtotalCell,
                  fixed ? styles.flexCell : { width: column.width },
                  { textAlign: column.align },
                ]}
              >
                {subtotalValue(item, column.key)}
              </Text>
            ))}
            <View style={[styles.actionCell, nativeTableStyles.partition, fixed ? styles.actionFlexCell : { width: actionWidth }]} />
          </View>
        )) : <Text style={[styles.noRows, nativeTableStyles.empty, { width }]}>No register rows found.</Text>}
      </ScrollView>
    </View>
  );
  return (
    <View style={[styles.tableShell, nativeTableStyles.shell, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {fixed ? table : <ScrollView horizontal showsHorizontalScrollIndicator>{table}</ScrollView>}
    </View>
  );
}

function displayValue(row, key) {
  if (key === 'species_variety') return `${row.species || '—'} | ${row.variety_name || '—'}`;
  if (typeof row[key] === 'boolean') return row[key] ? 'YES' : 'NO';
  if (['quantity', 'available_qty', 'production_qty', 'received_qty', 'hoso_qty', 'hlso_qty', 'peeled_qty', 'in_qty', 'amount'].includes(key) && row[key] !== null && row[key] !== undefined) return number(row[key]);
  return String(row[key] ?? '—');
}

function elapsedTime(dateValue, timeValue, now = Date.now()) {
  if (!dateValue || !timeValue) return '00:00:00';
  const start = new Date(`${String(dateValue).slice(0, 10)}T${String(timeValue).slice(0, 8)}`).getTime();
  if (!Number.isFinite(start) || now < start) return '00:00:00';
  const difference = now - start;
  const hours = String(Math.floor(difference / 3600000)).padStart(2, '0');
  const minutes = String(Math.floor((difference % 3600000) / 60000)).padStart(2, '0');
  const seconds = String(Math.floor((difference % 60000) / 1000)).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function AuxiliaryTableTab({ moduleKey, dataKey, data, tableHeight, statusBusy, onSoakingStatus, onRejectionComplete }) {
  const section = (auxiliaryMeta[moduleKey] || []).find(([key]) => key === dataKey);
  if (!section) return null;
  const [, title, keys] = section;
  const sourceRows = Array.isArray(data?.[dataKey]) ? data[dataKey] : [];
  const rows = dataKey === 'soaking_data' ? sourceRows.filter(row => String(row.status || '').toLowerCase() !== 'completed') : sourceRows;
  const sample = rows.find(row => row && typeof row === 'object' && !Array.isArray(row));
  const visibleKeys = keys || (sample ? Object.keys(sample).filter(field => !['company_id', 'email', 'cancelled_by', 'cancelled_at', 'journal_id'].includes(field)).slice(0, 12) : []);
  const isFloorBalance = /floor balance/i.test(title);
  return (
    <View>
      <SectionTitle>{title}</SectionTitle>
      {moduleKey === 'production' && ['soaking_data', 'rejection_data'].includes(dataKey)
        ? <ProductionStatusTable
            dataKey={dataKey}
            rows={rows}
            keys={visibleKeys}
            tableHeight={tableHeight}
            statusBusy={statusBusy}
            onSoakingStatus={onSoakingStatus}
            onRejectionComplete={onRejectionComplete}
          />
        : <ReadOnlyTable rows={rows} keys={visibleKeys} tableHeight={tableHeight} groupedSubtotals={isFloorBalance} groupByPo={dataKey === 'pending_orders'} />}
    </View>
  );
}

function ProductionStatusTable({ dataKey, rows, keys, tableHeight = 430, statusBusy, onSoakingStatus, onRejectionComplete }) {
  const { theme } = useERPTheme();
  const isSoaking = dataKey === 'soaking_data';
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!isSoaking) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isSoaking]);
  const actionWidth = 64;
  const resolved = useMemo(
    () => resolveColumns(keys.map(key => [key, key.replaceAll('_', ' ')]), rows),
    [keys, rows],
  );
  const width = resolvedTableWidth(resolved, isSoaking ? 0 : actionWidth);
  return (
    <View style={[styles.tableShell, nativeTableStyles.shell, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View style={{ width }}>
          <View style={[styles.tableHeader, nativeTableStyles.header, { backgroundColor: theme.tableHead }]}>
            {resolved.map(column => <Text key={column.key} style={[styles.headerCell, nativeTableStyles.headerCell, { width: column.width, textAlign: column.align }]}>{column.label}</Text>)}
            {!isSoaking ? <Text style={[styles.headerCell, nativeTableStyles.headerCell, { width: actionWidth, textAlign: 'center' }]}>Action</Text> : null}
          </View>
          <ScrollView style={[styles.auxTableBody, { height: Math.max(260, tableHeight - 30) }]} nestedScrollEnabled>
            {rows.length ? rows.map((row, index) => {
              const busyKey = `${isSoaking ? 'soaking' : 'rejection'}:${row.id}`;
              const busy = statusBusy === busyKey;
              return (
                <View key={row.id || index} style={[styles.tableRow, nativeTableStyles.row]}>
                  {resolved.map(column => {
                    if (column.key === 'status' && isSoaking) {
                      return <View key={column.key} style={[styles.statusCell, nativeTableStyles.partition, { width: column.width }]}><StatusPicker value={row.status || 'Pending'} disabled={busy} onChange={status => onSoakingStatus(row, status)} /></View>;
                    }
                    if (column.key === 'timer' && isSoaking) {
                      return <Text numberOfLines={1} key={column.key} style={[styles.tableCell, nativeTableStyles.cell, styles.timerCell, { width: column.width, textAlign: column.align }]}>{elapsedTime(row.date, row.time, now)}</Text>;
                    }
                    return <Text numberOfLines={2} key={column.key} style={[styles.tableCell, nativeTableStyles.cell, { width: column.width, textAlign: column.align }]}>{displayValue(row, column.key)}</Text>;
                  })}
                  {!isSoaking ? <View style={[styles.actionCell, nativeTableStyles.partition, { width: actionWidth }]}>
                    <Pressable disabled={busy} onPress={() => onRejectionComplete(row)} style={[styles.doneButton, busy && styles.disabled]}>
                      {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.doneButtonText}>DONE</Text>}
                    </Pressable>
                  </View> : null}
                </View>
              );
            }) : <Text style={[styles.noRows, nativeTableStyles.empty, { width }]}>No active rows found.</Text>}
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
}

function StatusPicker({ value, disabled, onChange }) {
  const { theme } = useERPTheme();
  const [open, setOpen] = useState(false);
  const shortStatus = value === 'Completed' ? 'DONE' : value === 'Running' ? 'RUN' : 'PND';
  return (
    <>
      <Pressable disabled={disabled} onPress={() => setOpen(true)} style={[styles.statusPicker, value === 'Running' && styles.statusRunning, value === 'Completed' && styles.statusCompleted, disabled && styles.disabled]}>
        {disabled ? <ActivityIndicator color="#1d4ed8" size="small" /> : <Text style={styles.statusPickerText}>{shortStatus}⌄</Text>}
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} style={styles.statusOverlay}>
          <Pressable onPress={() => {}} style={[styles.statusSheet, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.statusTitle, { color: theme.text }]}>Change Soaking Status</Text>
            {['Pending', 'Running', 'Completed'].map(status => <Pressable key={status} onPress={() => { setOpen(false); onChange(status); }} style={[styles.statusOption, { borderBottomColor: theme.border }, value === status && styles.statusOptionActive]}><Text style={[styles.statusOptionText, { color: theme.text }, value === status && styles.statusOptionTextActive]}>{status === 'Completed' ? 'DONE — Completed' : status}</Text></Pressable>)}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const productionRequirementTotalKeys = new Set(['no_of_pieces', 'no_of_mc', 'stock_mc', 'prod_pending_mc', 'net_count_calc', 'hl_count_calc', 'hoso_count_calc', 'ordered_qty', 'available_stock', 'existed_stock_util', 'pending_production', 'req_hlso_qty', 'req_hoso_qty']);

function ReadOnlyTable({ rows, keys, tableHeight = 430, groupedSubtotals = false, groupByPo = false }) {
  const { theme } = useERPTheme();
  const { width: windowWidth } = useWindowDimensions();
  const resolved = useMemo(
    () => resolveColumns(keys.map(key => [key, key.replaceAll('_', ' ')]), rows),
    [keys, rows],
  );
  const contentWidth = resolvedTableWidth(resolved);
  const availableWidth = Math.max(280, windowWidth - 22);
  const fixed = keys.length <= 4 && contentWidth <= availableWidth;
  const width = fixed ? availableWidth : contentWidth;
  const locationKey = keys.find(key => ['location', 'peeling_at', 'production_at'].includes(key));
  const companyKey = keys.find(key => ['production_for', 'company_name'].includes(key));
  const subtotalRows = useMemo(() => {
    if (groupByPo) {
      const groups = new Map();
      rows.forEach(row => {
        const po = String(row.po_number || 'No PO');
        if (!groups.has(po)) groups.set(po, []);
        groups.get(po).push(row);
      });
      const output = [];
      groups.forEach((poRows, po) => {
        output.push({ type: 'poHeader', label: po, key: `po-${po}` });
        poRows.forEach((row, index) => output.push({ type: 'data', row, key: row.id || `${po}-${index}` }));
        const totals = {};
        productionRequirementTotalKeys.forEach(key => {
          totals[key] = poRows.reduce((sum, row) => {
            const value = key === 'prod_pending_mc' && (row[key] === null || row[key] === undefined)
              ? Number(row.no_of_mc || 0) - Number(row.stock_mc || 0)
              : Number(row[key] || 0);
            return sum + value;
          }, 0);
        });
        output.push({ type: 'poSubtotal', label: po, totals, key: `po-subtotal-${po}` });
      });
      return output;
    }
    if (!groupedSubtotals || !locationKey || !companyKey) return rows.slice(0, 120).map((row, index) => ({ type: 'data', row, key: row.id || index }));
    const locations = new Map();
    rows.forEach(row => {
      const location = String(row[locationKey] || 'Unassigned');
      const company = String(row[companyKey] || 'General Stock');
      if (!locations.has(location)) locations.set(location, new Map());
      const companies = locations.get(location);
      if (!companies.has(company)) companies.set(company, []);
      companies.get(company).push(row);
    });
    const output = [];
    [...locations.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([location, companies]) => {
      let locationTotal = 0;
      output.push({ type: 'locationHeader', label: location, key: `loc-${location}` });
      [...companies.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([company, companyRows]) => {
        const companyTotal = companyRows.reduce((sum, row) => sum + Number(row.available_qty || 0), 0);
        companyRows.forEach((row, index) => output.push({ type: 'data', row, key: row.id || `${location}-${company}-${index}` }));
        output.push({ type: 'companySubtotal', label: `${company} subtotal`, total: companyTotal, key: `company-${location}-${company}` });
        locationTotal += companyTotal;
      });
      output.push({ type: 'locationSubtotal', label: `${location} subtotal`, total: locationTotal, key: `total-${location}` });
    });
    return output;
  }, [companyKey, groupByPo, groupedSubtotals, locationKey, rows]);
  const table = (
    <View style={[fixed && styles.fixedTable, { width }]}>
      <View style={[styles.tableHeader, nativeTableStyles.header, { backgroundColor: theme.tableHead }]}>
        {resolved.map(column => (
          <Text
            key={column.key}
            style={[
              styles.headerCell,
              nativeTableStyles.headerCell,
              fixed ? styles.flexCell : { width: column.width },
              { textAlign: column.align },
            ]}
          >
            {column.label}
          </Text>
        ))}
      </View>
      <ScrollView style={[styles.auxTableBody, { height: Math.max(260, tableHeight - 30) }]} nestedScrollEnabled>
        {subtotalRows.length ? subtotalRows.map(item => {
          if (item.type === 'data') {
            return (
              <View key={item.key} style={[styles.tableRow, nativeTableStyles.row]}>
                {resolved.map(column => (
                  <Text
                    numberOfLines={2}
                    key={column.key}
                    style={[
                      styles.tableCell,
                      nativeTableStyles.cell,
                      fixed ? styles.flexCell : { width: column.width },
                      { textAlign: column.align },
                    ]}
                  >
                    {displayValue(item.row, column.key)}
                  </Text>
                ))}
              </View>
            );
          }
          if (item.type === 'poHeader') {
            return <View key={item.key} style={[styles.auxLocationHeader, { width }]}><Text style={styles.auxLocationHeaderText}>PO • {item.label}</Text></View>;
          }
          if (item.type === 'poSubtotal') {
            return (
              <View key={item.key} style={[styles.tableRow, nativeTableStyles.row, styles.poSubtotalRow, nativeTableStyles.subtotalRow]}>
                {resolved.map(column => (
                  <Text
                    numberOfLines={2}
                    key={column.key}
                    style={[
                      styles.tableCell,
                      nativeTableStyles.cell,
                      styles.poSubtotalCell,
                      nativeTableStyles.subtotalCell,
                      fixed ? styles.flexCell : { width: column.width },
                      { textAlign: column.align },
                    ]}
                  >
                    {column.key === 'po_number'
                      ? `SUBTOTAL (${item.label})`
                      : productionRequirementTotalKeys.has(column.key) ? number(item.totals[column.key]) : ''}
                  </Text>
                ))}
              </View>
            );
          }
          if (item.type === 'locationHeader') {
            return <View key={item.key} style={[styles.auxLocationHeader, { width }]}><Text style={styles.auxLocationHeaderText}>{item.label.toUpperCase()}</Text></View>;
          }
          return (
            <View
              key={item.key}
              style={[
                styles.auxSubtotalRow,
                nativeTableStyles.subtotalRow,
                item.type === 'locationSubtotal' && styles.auxLocationSubtotal,
                { width },
              ]}
            >
              <Text style={[styles.auxSubtotalLabel, nativeTableStyles.subtotalCell]}>{item.label}</Text>
              <Text style={[styles.auxSubtotalValue, nativeTableStyles.subtotalCell]}>{number(item.total)} KG</Text>
            </View>
          );
        }) : <Text style={[styles.noRows, nativeTableStyles.empty, { width }]}>No rows found.</Text>}
      </ScrollView>
    </View>
  );
  return (
    <View style={[styles.tableShell, nativeTableStyles.shell, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {fixed ? table : <ScrollView horizontal showsHorizontalScrollIndicator>{table}</ScrollView>}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexGrow: 1, flexDirection: 'row', gap: 5 },
  tab: { minWidth: 78, height: 38, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, backgroundColor: '#fff' },
  tabActive: { borderColor: '#2563eb', backgroundColor: '#2563eb' },
  tabText: { color: '#64748b', fontSize: 9.5, fontWeight: '900' },
  tabTextActive: { color: '#fff' },
  form: { gap: 8, padding: 9, borderWidth: 1, borderColor: '#dbe3ef', borderRadius: 13, backgroundColor: '#fff' },
  field: { width: '100%' },
  label: { marginBottom: 4, color: '#64748b', fontSize: 9.5, fontWeight: '900', textTransform: 'uppercase', letterSpacing: .35 },
  required: { color: '#dc2626' },
  input: { height: 42, paddingHorizontal: 10, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, color: '#0f172a', backgroundColor: '#fff', fontSize: 11.5, fontWeight: '750' },
  readOnlyInput: { color: '#475569', backgroundColor: '#eef3f8' },
  searchButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: '#0f766e' },
  searchButtonText: { color: '#fff', fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  lineList: { gap: 10 },
  lineCard: { gap: 10, padding: 11, borderWidth: 1, borderColor: '#dbe3ef', borderRadius: 12, backgroundColor: '#f8fafc' },
  lineHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  lineHeaderCopy: { flex: 1, minWidth: 0 },
  lineTitle: { color: '#1d4ed8', fontSize: 12, fontWeight: '900' },
  lineSub: { marginTop: 2, color: '#64748b', fontSize: 10, fontWeight: '700' },
  lineBalance: { color: '#0f766e', fontSize: 11, fontWeight: '900', textAlign: 'right' },
  lineInputs: { flexDirection: 'row', gap: 8 },
  lineField: { flex: 1 },
  addLine: { minHeight: 43, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#93c5fd', borderRadius: 10, backgroundColor: '#eff6ff' },
  addLineText: { color: '#1d4ed8', fontSize: 11, fontWeight: '900' },
  removeLine: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 8, backgroundColor: '#fee2e2' },
  removeLineText: { color: '#dc2626', fontSize: 10, fontWeight: '900' },
  availableCard: { padding: 11, borderWidth: 1, borderRadius: 11 },
  availableLabel: { fontSize: 9.5, fontWeight: '900', letterSpacing: .45 },
  availableValue: { marginTop: 3, fontSize: 15, fontWeight: '900' },
  message: { marginTop: 12, padding: 11, borderWidth: 1, borderColor: '#fecaca', borderRadius: 10, color: '#dc2626', backgroundColor: '#fef2f2', fontSize: 12, fontWeight: '800' },
  success: { borderColor: '#bbf7d0', color: '#15803d', backgroundColor: '#f0fdf4' },
  errorBanner: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, paddingLeft: 12, paddingRight: 7, borderWidth: 1, borderColor: '#fecaca', borderRadius: 11, backgroundColor: '#fef2f2' },
  errorBannerText: { flex: 1, color: '#dc2626', fontSize: 12, lineHeight: 16, fontWeight: '800' },
  errorClose: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#fee2e2' },
  errorCloseText: { color: '#b91c1c', fontSize: 23, lineHeight: 25, fontWeight: '700' },
  successOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 22, backgroundColor: '#02061799' },
  successCard: { width: '100%', maxWidth: 360, alignItems: 'center', padding: 22, borderRadius: 20, backgroundColor: '#fff' },
  successIcon: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: '#16a34a' },
  successIconText: { color: '#fff', fontSize: 29, fontWeight: '900' },
  successTitle: { marginTop: 14, color: '#14532d', fontSize: 21, fontWeight: '900' },
  successCopy: { marginTop: 6, color: '#64748b', fontSize: 12, lineHeight: 17, fontWeight: '700', textAlign: 'center' },
  successButton: { width: '100%', height: 46, alignItems: 'center', justifyContent: 'center', marginTop: 18, borderRadius: 11, backgroundColor: '#16a34a' },
  successButtonText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  save: { height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 13, borderRadius: 12, backgroundColor: '#2563eb' },
  saveText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  disabled: { opacity: .55 },
  tableShell: { overflow: 'hidden', borderWidth: 1, borderColor: '#dbe3ef', borderRadius: 12, backgroundColor: '#fff' },
  fixedTable: { width: '100%' },
  flexCell: { flex: 1, minWidth: 0 },
  actionFlexCell: { width: 58 },
  tableBody: {},
  auxTableBody: {},
  tableHeader: { minHeight: 30, flexDirection: 'row', alignItems: 'center', backgroundColor: '#eaf1fb' },
  tableRow: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#dbe3ef' },
  poSubtotalRow: { borderTopWidth: 1, borderTopColor: '#93c5fd', borderBottomWidth: 1, borderBottomColor: '#bfdbfe', backgroundColor: '#eff6ff' },
  poSubtotalCell: { color: '#1d4ed8', fontWeight: '900' },
  cancelledRow: { backgroundColor: '#fef2f2' },
  headerCell: { paddingHorizontal: 4, paddingVertical: 6, color: '#1e3a5f', fontSize: 8.5, lineHeight: 10, fontWeight: '900', textTransform: 'uppercase' },
  tableCell: { minHeight: 32, paddingHorizontal: 4, paddingVertical: 5, color: '#334155', fontSize: 9.5, lineHeight: 11, fontWeight: '650' },
  timerCell: { color: '#b45309', fontFamily: 'monospace', fontWeight: '900', textAlign: 'center' },
  auxLocationHeader: { minHeight: 29, justifyContent: 'center', paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: '#93c5fd', borderLeftWidth: 4, borderLeftColor: '#2563eb', backgroundColor: '#dbeafe' },
  auxLocationHeaderText: { color: '#1e3a5f', fontSize: 9.5, fontWeight: '900', letterSpacing: .35 },
  auxSubtotalRow: { minHeight: 29, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 9, paddingHorizontal: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#dbe3ef', backgroundColor: '#f5f3ff' },
  auxLocationSubtotal: { borderTopWidth: 1, borderTopColor: '#93c5fd', backgroundColor: '#eff6ff' },
  auxSubtotalLabel: { color: '#64748b', fontSize: 8.5, fontWeight: '900', textTransform: 'uppercase' },
  auxSubtotalValue: { minWidth: 74, color: '#0f766e', fontSize: 10, fontWeight: '900', textAlign: 'right' },
  actionCell: { minHeight: 32, alignItems: 'center', justifyContent: 'center' },
  statusCell: { minHeight: 32, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  statusPicker: { minWidth: 44, height: 23, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#fbbf24', borderRadius: 6, backgroundColor: '#fffbeb' },
  statusRunning: { borderColor: '#93c5fd', backgroundColor: '#eff6ff' },
  statusCompleted: { borderColor: '#86efac', backgroundColor: '#f0fdf4' },
  statusPickerText: { color: '#1e3a5f', fontSize: 8.5, fontWeight: '900' },
  statusOverlay: { flex: 1, justifyContent: 'flex-end', padding: 14, backgroundColor: '#020617b8' },
  statusSheet: { overflow: 'hidden', borderWidth: 1, borderRadius: 18 },
  statusTitle: { padding: 16, fontSize: 16, fontWeight: '900' },
  statusOption: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 16, borderTopWidth: StyleSheet.hairlineWidth },
  statusOptionActive: { backgroundColor: '#1d4ed8' },
  statusOptionText: { fontSize: 13, fontWeight: '800' },
  statusOptionTextActive: { color: '#fff' },
  doneButton: { minWidth: 46, height: 23, alignItems: 'center', justifyContent: 'center', borderRadius: 6, backgroundColor: '#166534' },
  doneButtonText: { color: '#fff', fontSize: 8.5, fontWeight: '900' },
  rowCancel: { paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6, backgroundColor: '#fee2e2' },
  rowCancelText: { color: '#dc2626', fontSize: 9, fontWeight: '900' },
  cancelledText: { color: '#dc2626', fontSize: 9, fontWeight: '900' },
  noRows: { padding: 20, color: '#64748b', fontSize: 12, textAlign: 'center' },
  cancelPanel: { marginTop: 12, gap: 9, padding: 13, borderWidth: 1, borderColor: '#fecaca', borderRadius: 12, backgroundColor: '#fff' },
  cancelTitle: { color: '#dc2626', fontSize: 15, fontWeight: '900' },
  cancelSub: { color: '#64748b', fontSize: 11, fontWeight: '700' },
  cancelActions: { flexDirection: 'row', gap: 8 },
  keepButton: { flex: 1, height: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10 },
  keepText: { color: '#475569', fontSize: 11, fontWeight: '900' },
  cancelButton: { flex: 1, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#dc2626' },
  cancelText: { color: '#fff', fontSize: 11, fontWeight: '900' },
});
