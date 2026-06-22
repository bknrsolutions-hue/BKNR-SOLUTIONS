import React, { useState, useEffect } from 'react';
import { FileText, Search, Printer, Download, RefreshCw, Filter, ChevronDown, ChevronRight, Edit2, Trash2, Save, X, Plus } from 'lucide-react';

export default function ReportViewer({ reportId, activeRoute, user, theme }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState(null);

  // Local filters state
  const [selectedFy, setSelectedFy] = useState(new Date().getFullYear().toString());
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  
  // Custom Filters for Periodic/Batch Summary
  const [dateFilterType, setDateFilterType] = useState('today');
  const [prodType, setProdType] = useState('RMP');
  const [selectedBatch, setSelectedBatch] = useState('');
  
  // Storage Cost Filters
  const [freezer, setFreezer] = useState('');
  const [coldStorageName, setColdStorageName] = useState('');

  // Editing state for transactional reports (e.g. Gate Entry)
  const [editRowId, setEditRowId] = useState(null);
  const [editData, setEditData] = useState({});

  // Active tabs for compound dashboards
  const [activeTab, setActiveTab] = useState('summary');

  // Unified metadata configurations for standard reports
  const reportConfigs = {
    report_gate_entry_report: {
      title: 'Gate Entry Registry Report',
      columns: [
        { label: 'Date', key: 'date', align: 'center' },
        { label: 'Time', key: 'time', align: 'center' },
        { label: 'Batch No', key: 'batch_number', align: 'center', bold: true },
        { label: 'Supplier', key: 'supplier_name', align: 'left', editable: true },
        { label: 'Purchasing Loc', key: 'purchasing_location', align: 'left', editable: true },
        { label: 'Receiving Center', key: 'receiving_center', align: 'left', editable: true },
        { label: 'Vehicle No', key: 'vehicle_number', align: 'left', editable: true },
        { label: 'Driver', key: 'driver_name', align: 'left', editable: true },
        { label: 'Boxes', key: 'no_of_material_boxes', align: 'right', format: 'number', editable: true },
        { label: 'Empty Boxes', key: 'no_of_empty_boxes', align: 'right', format: 'number', editable: true },
        { label: 'Ice Boxes', key: 'no_of_ice_boxes', align: 'right', format: 'number', editable: true },
        { label: 'Production For', key: 'production_for', align: 'left' },
        { label: 'User', key: 'email', align: 'left' }
      ],
      filters: ['fy', 'supplier', 'factory'],
      canEdit: true,
      updateEndpoint: '/reports/gate_entry/update',
      deleteEndpoint: '/reports/gate_entry/delete'
    },
    report_rmp_report: {
      title: 'Raw Material Purchase Summary',
      columns: [
        { label: 'Date', key: 'date', align: 'center' },
        { label: 'Time', key: 'time', align: 'center' },
        { label: 'Batch No', key: 'batch_number', align: 'center', bold: true },
        { label: 'Supplier', key: 'supplier_name', align: 'left' },
        { label: 'Purchasing Loc', key: 'purchasing_location', align: 'left' },
        { label: 'Peeling At', key: 'peeling_at', align: 'left' },
        { label: 'Production For', key: 'production_for', align: 'left' },
        { label: 'Species', key: 'species', align: 'left' },
        { label: 'Variety', key: 'variety_name', align: 'left' },
        { label: 'Count', key: 'count', align: 'center' },
        { label: 'Received Qty (Kg)', key: 'received_qty', align: 'right', format: 'number' },
        { label: 'Rate (₹)', key: 'rate', align: 'right', format: 'currency' },
        { label: 'Amount (₹)', key: 'amount', align: 'right', format: 'currency' },
        { label: 'Rate Type', key: 'rate_type', align: 'center' },
        { label: 'Final Costing', key: 'final_costing', align: 'center' }
      ],
      filters: ['fy']
    },
    report_de_heading_report: {
      title: 'De-Heading Production Wages Ledger',
      columns: [
        { label: 'Date', key: 'date', align: 'center' },
        { label: 'Time', key: 'time', align: 'center' },
        { label: 'Batch No', key: 'batch_number', align: 'center', bold: true },
        { label: 'Contractor', key: 'contractor', align: 'left' },
        { label: 'Species', key: 'species', align: 'left' },
        { label: 'HOSO Count', key: 'hoso_count', align: 'center' },
        { label: 'HOSO Qty (Kg)', key: 'hoso_qty', align: 'right', format: 'number' },
        { label: 'HLSO Qty (Kg)', key: 'hlso_qty', align: 'right', format: 'number' },
        { label: 'Yield %', key: 'yield_percent', align: 'right', format: 'percentage' },
        { label: 'Target Yield %', key: 'target_yield_percent', align: 'right', format: 'percentage' },
        { label: 'Diff Qty (Kg)', key: 'diff_qty', align: 'right', format: 'number' },
        { label: 'Diff %', key: 'diff_percent', align: 'right', format: 'percentage' },
        { label: 'Rate/Kg (₹)', key: 'rate_per_kg', align: 'right', format: 'currency' },
        { label: 'Amount (₹)', key: 'amount', align: 'right', format: 'currency' },
        { label: 'Peeling At', key: 'peeling_at', align: 'left' },
        { label: 'Production For', key: 'production_for', align: 'left' }
      ],
      filters: ['fy']
    },
    report_grading_report: {
      title: 'Grading Count Yields Report',
      columns: [
        { label: 'Date', key: 'date', align: 'center' },
        { label: 'Time', key: 'time', align: 'center' },
        { label: 'Batch No', key: 'batch_number', align: 'center', bold: true },
        { label: 'Peeling At', key: 'peeling_at', align: 'left' },
        { label: 'Production For', key: 'production_for', align: 'left' },
        { label: 'Species', key: 'species', align: 'left' },
        { label: 'Variety', key: 'variety_name', align: 'left' },
        { label: 'HOSO Count', key: 'hoso_count', align: 'center' },
        { label: 'Graded Count', key: 'graded_count', align: 'center' },
        { label: 'Quantity (Kg)', key: 'quantity', align: 'right', format: 'number' }
      ],
      filters: ['fy']
    },
    report_peeling_report: {
      title: 'Peeling Production Ledger',
      columns: [
        { label: 'Date', key: 'date', align: 'center' },
        { label: 'Time', key: 'time', align: 'center' },
        { label: 'Batch No', key: 'batch_number', align: 'center', bold: true },
        { label: 'Contractor', key: 'contractor', align: 'left' },
        { label: 'Species', key: 'species', align: 'left' },
        { label: 'Variety', key: 'variety', align: 'left' },
        { label: 'HLSO Count', key: 'hlso_count', align: 'center' },
        { label: 'HLSO Qty (Kg)', key: 'hlso_qty', align: 'right', format: 'number' },
        { label: 'Peeled Qty (Kg)', key: 'peeled_qty', align: 'right', format: 'number' },
        { label: 'Yield %', key: 'yield_percent', align: 'right', format: 'percentage' },
        { label: 'Target Yield %', key: 'target_yield_percent', align: 'right', format: 'percentage' },
        { label: 'Diff Qty (Kg)', key: 'diff_qty', align: 'right', format: 'number' },
        { label: 'Diff %', key: 'diff_percent', align: 'right', format: 'percentage' },
        { label: 'Rate/Kg (₹)', key: 'rate_per_kg', align: 'right', format: 'currency' },
        { label: 'Amount (₹)', key: 'amount', align: 'right', format: 'currency' },
        { label: 'Peeling At', key: 'peeling_at', align: 'left' },
        { label: 'Production For', key: 'production_for', align: 'left' }
      ],
      filters: ['fy']
    },
    report_soaking_report: {
      title: 'Chemical Soaking Treatment Logs',
      columns: [
        { label: 'Date', key: 'date', align: 'center' },
        { label: 'Time', key: 'time', align: 'center' },
        { label: 'Batch No', key: 'batch_number', align: 'center', bold: true },
        { label: 'Production At', key: 'production_at', align: 'left' },
        { label: 'Production For', key: 'production_for', align: 'left' },
        { label: 'Species', key: 'species', align: 'left' },
        { label: 'Variety', key: 'variety_name', align: 'left' },
        { label: 'In Count', key: 'in_count', align: 'center' },
        { label: 'In Qty (Kg)', key: 'in_qty', align: 'right', format: 'number' },
        { label: 'Chemical', key: 'chemical_name', align: 'left' },
        { label: 'Chem %', key: 'chemical_percent', align: 'right', format: 'percentage' },
        { label: 'Chem Qty (Kg)', key: 'chemical_qty', align: 'right', format: 'number' },
        { label: 'Salt Qty (Kg)', key: 'salt_qty', align: 'right', format: 'number' },
        { label: 'Out Qty (Kg)', key: 'out_qty', align: 'right', format: 'number' },
        { label: 'Gain %', key: 'gain_percent', align: 'right', format: 'percentage' }
      ],
      filters: ['fy']
    },
    report_production_report: {
      title: 'Finished Goods Production Summary',
      columns: [
        { label: 'Date', key: 'date', align: 'center' },
        { label: 'Time', key: 'time', align: 'center' },
        { label: 'Batch No', key: 'batch_number', align: 'center', bold: true },
        { label: 'Brand', key: 'brand_name', align: 'left' },
        { label: 'Species', key: 'species', align: 'left' },
        { label: 'Variety', key: 'variety_name', align: 'left' },
        { label: 'Grade', key: 'grade', align: 'center' },
        { label: 'Glaze', key: 'glaze', align: 'center' },
        { label: 'Freezer', key: 'freezer', align: 'left' },
        { label: 'Packing Style', key: 'packing_style', align: 'left' },
        { label: 'MC Slabs', key: 'no_of_mc', align: 'right' },
        { label: 'Loose Slabs', key: 'loose', align: 'right' },
        { label: 'Net Weight (Kg)', key: 'production_qty', align: 'right', format: 'number' },
        { label: 'Production At', key: 'production_at', align: 'left' },
        { label: 'Production For', key: 'production_for', align: 'left' }
      ],
      filters: ['fy']
    },
    report_reprocess_report: {
      title: 'Re-Process Registry Report',
      columns: [
        { label: 'Date', key: 'date', align: 'center' },
        { label: 'Time', key: 'time', align: 'center' },
        { label: 'Original Batch', key: 'original_batch', align: 'center' },
        { label: 'New Batch', key: 'new_batch_id', align: 'center', bold: true },
        { label: 'Reprocess Type', key: 'reprocess_type', align: 'center' },
        { label: 'Species', key: 'species', align: 'left' },
        { label: 'Variety', key: 'variety', align: 'left' },
        { label: 'Grade', key: 'grade', align: 'center' },
        { label: 'Out Qty (Kg)', key: 'out_qty', align: 'right', format: 'number' },
        { label: 'Glaze', key: 'glaze', align: 'center' },
        { label: 'Freezer', key: 'freezer', align: 'left' },
        { label: 'Packing Style', key: 'packing_style', align: 'left' },
        { label: 'In Qty (Kg)', key: 'in_qty', align: 'right', format: 'number' },
        { label: 'Product Kg Value', key: 'product_kg_value', align: 'right', format: 'currency' },
        { label: 'Inventory Value', key: 'inventory_value', align: 'right', format: 'currency' },
        { label: 'Production At', key: 'production_at', align: 'left' },
        { label: 'Production For', key: 'production_for', align: 'left' }
      ],
      filters: ['fy']
    },
    report_floor_balance_report: {
      title: 'Plant Floor WIP Stock Balance Report',
      columns: [
        { label: 'Date', key: 'date', align: 'center' },
        { label: 'Batch No', key: 'batch', align: 'center', bold: true },
        { label: 'Location', key: 'location', align: 'left' },
        { label: 'Production For', key: 'production_for', align: 'left' },
        { label: 'Species', key: 'species', align: 'left' },
        { label: 'Variety', key: 'variety', align: 'left' },
        { label: 'Count', key: 'count', align: 'center' },
        { label: 'Available Qty (Kg)', key: 'available_qty', align: 'right', format: 'number' },
        { label: 'Source', key: 'source', align: 'center' }
      ],
      filters: []
    },
    report_inventory_report: {
      title: 'Cold Storage Stock Status Report',
      columns: [
        { label: 'Date', key: 'date', align: 'center' },
        { label: 'Batch No', key: 'batch_number', align: 'center', bold: true },
        { label: 'Location', key: 'location', align: 'left' },
        { label: 'Production For', key: 'production_for', align: 'left' },
        { label: 'Brand', key: 'brand', align: 'left' },
        { label: 'Species', key: 'species', align: 'left' },
        { label: 'Variety', key: 'variety', align: 'left' },
        { label: 'Grade', key: 'grade', align: 'center' },
        { label: 'Glaze', key: 'glaze', align: 'center' },
        { label: 'Freezer', key: 'freezer', align: 'left' },
        { label: 'Packing Style', key: 'packing_style', align: 'left' },
        { label: 'No of MC', key: 'no_of_mc', align: 'right' },
        { label: 'Loose', key: 'loose', align: 'right' },
        { label: 'Quantity (Kg)', key: 'quantity', align: 'right', format: 'number' },
        { label: 'Cargo Type', key: 'cargo_movement_type', align: 'center' }
      ],
      filters: ['date_range']
    },
    report_pending_orders_report: {
      title: 'Sales Pending Orders Backlog Report',
      columns: [
        { label: 'Order Date', key: 'order_date', align: 'center' },
        { label: 'Order No', key: 'order_number', align: 'center', bold: true },
        { label: 'Buyer', key: 'buyer_name', align: 'left' },
        { label: 'Buyer Agent', key: 'buyer_agent_name', align: 'left' },
        { label: 'Brand', key: 'brand', align: 'left' },
        { label: 'Species', key: 'species', align: 'left' },
        { label: 'Variety', key: 'variety', align: 'left' },
        { label: 'Grade', key: 'grade', align: 'center' },
        { label: 'Glaze', key: 'glaze', align: 'center' },
        { label: 'Freezer', key: 'freezer', align: 'left' },
        { label: 'Packing Style', key: 'packing_style', align: 'left' },
        { label: 'Ordered MC', key: 'ordered_mc', align: 'right' },
        { label: 'Shipped MC', key: 'shipped_mc', align: 'right' },
        { label: 'Pending MC', key: 'pending_mc', align: 'right' },
        { label: 'Ordered Qty (Kg)', key: 'ordered_qty', align: 'right', format: 'number' },
        { label: 'Shipped Qty (Kg)', key: 'shipped_qty', align: 'right', format: 'number' },
        { label: 'Pending Qty (Kg)', key: 'pending_qty', align: 'right', format: 'number' }
      ],
      filters: ['date_range']
    },
    report_sales_report: {
      title: 'Sales & Invoicing Ledger Report',
      columns: [
        { label: 'Date', key: 'date', align: 'center' },
        { label: 'Invoice No', key: 'invoice_number', align: 'center', bold: true },
        { label: 'Container No', key: 'container_number', align: 'left' },
        { label: 'Buyer', key: 'buyer', align: 'left' },
        { label: 'Buyer Agent', key: 'buyer_agent', align: 'left' },
        { label: 'Batch No', key: 'batch_number', align: 'center' },
        { label: 'Brand', key: 'brand', align: 'left' },
        { label: 'Species', key: 'species', align: 'left' },
        { label: 'Variety', key: 'variety', align: 'left' },
        { label: 'Grade', key: 'grade', align: 'center' },
        { label: 'Glaze', key: 'glaze', align: 'center' },
        { label: 'Freezer', key: 'freezer', align: 'left' },
        { label: 'Packing Style', key: 'packing_style', align: 'left' },
        { label: 'No of MC', key: 'no_of_mc', align: 'right' },
        { label: 'Loose Slabs', key: 'loose', align: 'right' },
        { label: 'Quantity (Kg)', key: 'quantity', align: 'right', format: 'number' },
        { label: 'Rate', key: 'rate', align: 'right', format: 'currency' },
        { label: 'Amount', key: 'amount', align: 'right', format: 'currency' }
      ],
      filters: ['date_range']
    },
    report_gs_report: {
      title: 'General Store Stock Movement Ledger',
      columns: [
        { label: 'Date', key: 'date', align: 'center' },
        { label: 'Item Name', key: 'item_name', align: 'left' },
        { label: 'Category', key: 'category', align: 'left' },
        { label: 'Supplier/Vendor', key: 'supplier_vendor', align: 'left' },
        { label: 'Reference No', key: 'reference_no', align: 'left' },
        { label: 'Movement', key: 'movement_type', align: 'center' },
        { label: 'Quantity', key: 'quantity', align: 'right', format: 'number' },
        { label: 'Rate (₹)', key: 'rate', align: 'right', format: 'currency' },
        { label: 'Amount (₹)', key: 'amount', align: 'right', format: 'currency' },
        { label: 'Department', key: 'department', align: 'left' },
        { label: 'Purpose', key: 'purpose', align: 'left' },
        { label: 'Email', key: 'email', align: 'left' }
      ],
      filters: ['date_range']
    },
    report_cold_storage_holding_report: {
      title: 'Cold Storage Holding Inventory Report',
      columns: [
        { label: 'Location', key: 'location', align: 'left' },
        { label: 'Production For', key: 'production_for', align: 'left' },
        { label: 'Brand', key: 'brand', align: 'left' },
        { label: 'Species', key: 'species', align: 'left' },
        { label: 'Variety', key: 'variety', align: 'left' },
        { label: 'Grade', key: 'grade', align: 'center' },
        { label: 'Glaze', key: 'glaze', align: 'center' },
        { label: 'Freezer', key: 'freezer', align: 'left' },
        { label: 'Packing Style', key: 'packing_style', align: 'left' },
        { label: 'No of MC', key: 'no_of_mc', align: 'right' },
        { label: 'Loose', key: 'loose', align: 'right' },
        { label: 'Quantity (Kg)', key: 'quantity', align: 'right', format: 'number' },
        { label: 'Type of Production', key: 'type_of_production', align: 'center' }
      ],
      filters: []
    },
    report_floor_balance_value: {
      title: 'Plant WIP Floor Stock Balances Value',
      columns: [
        { label: 'Batch No', key: 'batch', align: 'center', bold: true },
        { label: 'Variety', key: 'variety', align: 'left' },
        { label: 'Count', key: 'count', align: 'center' },
        { label: 'Species', key: 'species', align: 'left' },
        { label: 'Production For', key: 'production_for', align: 'left' },
        { label: 'Location', key: 'location', align: 'left' },
        { label: 'Available Qty (Kg)', key: 'available_qty', align: 'right', format: 'number' },
        { label: 'Value (₹)', key: 'value', align: 'right', format: 'currency' },
        { label: 'Source', key: 'source', align: 'center' }
      ],
      filters: []
    },
    report_inventory_costing: {
      title: 'Inventory Costing & Valuation Report',
      columns: [
        { label: 'Date', key: 'date', align: 'center' },
        { label: 'Batch No', key: 'batch_number', align: 'center', bold: true },
        { label: 'Location', key: 'location', align: 'left' },
        { label: 'Production For', key: 'production_for', align: 'left' },
        { label: 'Brand', key: 'brand', align: 'left' },
        { label: 'Species', key: 'species', align: 'left' },
        { label: 'Variety', key: 'variety', align: 'left' },
        { label: 'Grade', key: 'grade', align: 'center' },
        { label: 'Glaze', key: 'glaze', align: 'center' },
        { label: 'Freezer', key: 'freezer', align: 'left' },
        { label: 'Packing Style', key: 'packing_style', align: 'left' },
        { label: 'Quantity (Kg)', key: 'quantity', align: 'right', format: 'number' },
        { label: 'Kg Value', key: 'product_kg_value', align: 'right', format: 'currency' },
        { label: 'Inventory Value', key: 'inventory_value', align: 'right', format: 'currency' }
      ],
      filters: ['fy', 'date_range']
    }
  };

  const activeConfig = reportConfigs[reportId];

  // Fetch report data
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const activeComp = localStorage.getItem('production_for_filter') || '';
      const activeLoc = localStorage.getItem('plant_location_filter') || '';

      const queryParams = new URLSearchParams({ format: 'json' });
      
      // Inject global headers
      if (activeComp) queryParams.append('production_for', activeComp);
      if (activeLoc) queryParams.append('location', activeLoc);

      // Inject local filters based on config / reportId
      if (reportId === 'report_storage_cost_report') {
        if (selectedMonth) queryParams.append('selected_month', selectedMonth);
        if (freezer) queryParams.append('freezer', freezer);
        if (coldStorageName) queryParams.append('cold_storage_name', coldStorageName);
      } else if (reportId === 'report_periodic_summary') {
        queryParams.append('date_filter_type', dateFilterType);
        if (selectedMonth) queryParams.append('selected_month', selectedMonth);
        if (fromDate) queryParams.append('start_date', fromDate);
        if (toDate) queryParams.append('end_date', toDate);
        if (prodType) queryParams.append('prod_type', prodType);
        if (selectedBatch) queryParams.append('batch', selectedBatch);
      } else if (reportId === 'report_batch_summary') {
        if (selectedFy) queryParams.append('fy', selectedFy);
        if (prodType) queryParams.append('prod_type', prodType);
        if (selectedBatch) queryParams.append('batch', selectedBatch);
      } else {
        // Standard filters
        if (selectedFy) queryParams.append('fy', selectedFy);
        if (fromDate) queryParams.append('from_date', fromDate);
        if (toDate) queryParams.append('to_date', toDate);
      }

      const res = await fetch(`${activeRoute}?${queryParams.toString()}`);
      if (!res.ok) throw new Error(`Fetch failed: ${res.statusText}`);
      
      const resData = await res.json();
      if (resData.status === 'success' || resData.rows || resData.rows_batch) {
        setData(resData);
        // Pre-populate batch lists for summaries if returned
        if (resData.batches && resData.batches.length > 0 && !selectedBatch) {
          // Keep it empty or select first
        }
      } else {
        throw new Error('Malformed JSON response from backend router');
      }
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Listen to universal header filter changes
    const handleGlobalFilterChange = () => {
      fetchData();
    };
    window.addEventListener('filter_change', handleGlobalFilterChange);
    return () => window.removeEventListener('filter_change', handleGlobalFilterChange);
  }, [reportId, activeRoute, selectedFy, fromDate, toDate, selectedMonth, dateFilterType, prodType, selectedBatch, freezer, coldStorageName]);

  const handlePrint = () => {
    window.print();
  };

  const handleExport = (type) => {
    const activeComp = localStorage.getItem('production_for_filter') || '';
    const activeLoc = localStorage.getItem('plant_location_filter') || '';

    let exportUrl = new URL(`${activeRoute}/export_${type}`, window.location.origin);
    exportUrl.searchParams.set('fy', selectedFy);
    if (activeComp) exportUrl.searchParams.set('production_for', activeComp);
    if (activeLoc) exportUrl.searchParams.set('location', activeLoc);
    if (fromDate) exportUrl.searchParams.set('from_date', fromDate);
    if (toDate) exportUrl.searchParams.set('to_date', toDate);
    if (selectedMonth) exportUrl.searchParams.set('selected_month', selectedMonth);

    window.location.href = exportUrl.toString();
  };

  // Inline transaction edits (e.g. for Gate Entry)
  const startEdit = (row) => {
    setEditRowId(row.id);
    setEditData(row);
  };

  const saveEdit = async () => {
    if (!activeConfig || !activeConfig.updateEndpoint) return;
    setLoading(true);
    try {
      const res = await fetch(activeConfig.updateEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData)
      });
      if (res.ok) {
        setEditRowId(null);
        fetchData();
      } else {
        alert('Failed to update record.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const deleteRow = async (id) => {
    if (!activeConfig || !activeConfig.deleteEndpoint) return;
    if (!confirm('Delete this record permanently?')) return;
    setLoading(true);
    try {
      const res = await fetch(activeConfig.deleteEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      if (res.ok) {
        fetchData();
      } else {
        alert('Failed to delete record.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Get raw list rows from payload
  const getRowsList = () => {
    if (!data) return [];
    if (data.rows) return data.rows;
    if (data.rows_batch) return data.rows_batch;
    return [];
  };

  const rows = getRowsList();

  // Keyword filter search
  const filteredRows = rows.filter(row => {
    if (!searchQuery) return true;
    return Object.values(row).some(val => 
      String(val || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  // Value formatting helper
  const formatVal = (val, format) => {
    if (val === null || val === undefined) return '';
    if (format === 'currency') {
      return Number(val).toLocaleString('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });
    }
    if (format === 'percentage') {
      return `${Number(val).toFixed(2)} %`;
    }
    if (format === 'number') {
      return Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return String(val);
  };

  // RENDER: COMPOUND DASHBOARDS (Periodic Summary, Batch Summary, Storage Cost)
  
  // 1. BATCH SUMMARY TEMPLATE (report_batch_summary)
  if (reportId === 'report_batch_summary') {
    return (
      <div className="report-viewer-card">
        {renderHeader('Batch Summary Dashboard')}
        {renderBatchSummaryFilters()}
        
        {loading && renderLoader()}
        {error && renderError()}
        
        {data && (
          <div style={{ marginTop: '20px' }}>
            {/* Batch Header Summary Card */}
            <div style={kpiGridStyle}>
              <div style={kpiCardStyle('var(--corp-dash)')}>
                <span style={kpiTitleStyle}>Supplier</span>
                <span style={kpiValueStyle}>{data.card?.supplier_name || 'N/A'}</span>
              </div>
              <div style={kpiCardStyle('var(--corp-ops)')}>
                <span style={kpiTitleStyle}>Purchasing Location</span>
                <span style={kpiValueStyle}>{data.card?.purchasing_location || 'N/A'}</span>
              </div>
              <div style={kpiCardStyle('var(--corp-rep)')}>
                <span style={kpiTitleStyle}>Vehicle / Challan</span>
                <span style={kpiValueStyle}>{data.card?.vehicle_number || 'N/A'} / {data.card?.challan_number || 'N/A'}</span>
              </div>
              <div style={kpiCardStyle('var(--corp-fin)')}>
                <span style={kpiTitleStyle}>Produced Qty (Kg)</span>
                <span style={kpiValueStyle}>{data.card?.production_qty?.toFixed(2) || '0.00'}</span>
              </div>
            </div>

            {/* Subtotals & Value Metrics */}
            <div style={kpiGridStyle}>
              <div style={kpiCardStyle('var(--corp-fin)')}>
                <span style={kpiTitleStyle}>RMP Material Purchased</span>
                <span style={kpiValueStyle}>{data.card?.rmp_qty?.toFixed(2) || '0.00'} Kg (₹ {data.card?.rmp_amount?.toLocaleString('en-IN') || '0'})</span>
              </div>
              <div style={kpiCardStyle('var(--corp-rep)')}>
                <span style={kpiTitleStyle}>WIP Floor Balance</span>
                <span style={kpiValueStyle}>{data.card?.floor_qty?.toFixed(2) || '0.00'} Kg (₹ {data.card?.floor_amount?.toLocaleString('en-IN') || '0'})</span>
              </div>
              <div style={kpiCardStyle('var(--corp-dash)')}>
                <span style={kpiTitleStyle}>CS In-Stock Inventory</span>
                <span style={kpiValueStyle}>{data.card?.stock_qty?.toFixed(2) || '0.00'} Kg (₹ {data.card?.stock_amount?.toLocaleString('en-IN') || '0'})</span>
              </div>
            </div>

            {/* Stages Tab Buttons */}
            <div style={tabsRowStyle}>
              {['gate', 'rmp', 'deheading', 'grading_summary', 'peeling', 'soaking', 'production', 'stock', 'hoso_floor_balance'].map(tab => (
                <button
                  key={tab}
                  style={activeTab === tab ? activeTabStyle : inactiveTabStyle}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab.replace('_', ' ').toUpperCase()}
                </button>
              ))}
            </div>

            {/* Tab Data Table Rendering */}
            <div style={{ marginTop: '16px' }} className="card">
              {renderSummaryTabTable(activeTab)}
            </div>
          </div>
        )}
      </div>
    );
  }

  // 2. PERIODIC SUMMARY TEMPLATE (report_periodic_summary)
  if (reportId === 'report_periodic_summary') {
    return (
      <div className="report-viewer-card">
        {renderHeader('Periodic Activity Summary')}
        {renderPeriodicFilters()}

        {loading && renderLoader()}
        {error && renderError()}

        {data && (
          <div style={{ marginTop: '20px' }}>
            {/* KPI Cards */}
            <div style={kpiGridStyle}>
              <div style={kpiCardStyle('var(--corp-dash)')}>
                <span style={kpiTitleStyle}>RM Purchased Qty</span>
                <span style={kpiValueStyle}>{data.card?.rmp_qty?.toFixed(2) || '0.00'} Kg</span>
              </div>
              <div style={kpiCardStyle('var(--corp-ops)')}>
                <span style={kpiTitleStyle}>RM Purchase Cost</span>
                <span style={kpiValueStyle}>₹ {data.card?.rmp_amount?.toLocaleString('en-IN') || '0'}</span>
              </div>
              <div style={kpiCardStyle('var(--corp-rep)')}>
                <span style={kpiTitleStyle}>Processed & Graded</span>
                <span style={kpiValueStyle}>{data.card?.grd_qty?.toFixed(2) || '0.00'} Kg</span>
              </div>
              <div style={kpiCardStyle('var(--corp-fin)')}>
                <span style={kpiTitleStyle}>Produced Yield</span>
                <span style={kpiValueStyle}>{data.card?.production_qty?.toFixed(2) || '0.00'} Kg</span>
              </div>
            </div>

            <div style={kpiGridStyle}>
              <div style={kpiCardStyle('var(--corp-rep)')}>
                <span style={kpiTitleStyle}>Opening WIP Floor Balance</span>
                <span style={kpiValueStyle}>{data.card?.floor_opening_qty?.toFixed(2) || '0.00'} Kg (₹ {data.card?.floor_opening_val?.toLocaleString('en-IN') || '0'})</span>
              </div>
              <div style={kpiCardStyle('var(--corp-dash)')}>
                <span style={kpiTitleStyle}>Closing WIP Floor Balance</span>
                <span style={kpiValueStyle}>{data.card?.floor_closing_qty?.toFixed(2) || '0.00'} Kg (₹ {data.card?.floor_closing_val?.toLocaleString('en-IN') || '0'})</span>
              </div>
              <div style={kpiCardStyle('var(--corp-fin)')}>
                <span style={kpiTitleStyle}>Current CS Inventory</span>
                <span style={kpiValueStyle}>{data.card?.stock_qty?.toFixed(2) || '0.00'} Kg (₹ {data.card?.stock_amount?.toLocaleString('en-IN') || '0'})</span>
              </div>
            </div>

            {/* Stages Tab Buttons */}
            <div style={tabsRowStyle}>
              {['gate', 'rmp', 'deheading', 'grading_summary', 'peeling', 'soaking', 'production', 'stock', 'opening_floor_balance', 'closing_floor_balance'].map(tab => (
                <button
                  key={tab}
                  style={activeTab === tab ? activeTabStyle : inactiveTabStyle}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab.replace('_', ' ').toUpperCase()}
                </button>
              ))}
            </div>

            {/* Tab Data Table Rendering */}
            <div style={{ marginTop: '16px' }} className="card">
              {renderSummaryTabTable(activeTab)}
            </div>
          </div>
        )}
      </div>
    );
  }

  // 3. STORAGE & COST REPORT TEMPLATE (report_storage_cost_report)
  if (reportId === 'report_storage_cost_report') {
    return (
      <div className="report-viewer-card">
        {renderHeader('Storage & Cost FIFO Report')}
        {renderStorageCostFilters()}

        {loading && renderLoader()}
        {error && renderError()}

        {data && (
          <div style={{ marginTop: '20px' }}>
            {/* Grand Totals */}
            <div style={kpiGridStyle}>
              <div style={kpiCardStyle('var(--corp-dash)')}>
                <span style={kpiTitleStyle}>Total Opening MC</span>
                <span style={kpiValueStyle}>{data.total_opening_mc || '0'}</span>
              </div>
              <div style={kpiCardStyle('var(--corp-ops)')}>
                <span style={kpiTitleStyle}>Rent / Handling Charges</span>
                <span style={kpiValueStyle}>₹ {data.total_storage_rent?.toLocaleString('en-IN') || '0'} / ₹ {data.total_charges?.toLocaleString('en-IN') || '0'}</span>
              </div>
              <div style={kpiCardStyle('var(--corp-rep)')}>
                <span style={kpiTitleStyle}>Total Payable (This Month)</span>
                <span style={kpiValueStyle}>₹ {data.total_payable_all?.toLocaleString('en-IN') || '0'}</span>
              </div>
              <div style={kpiCardStyle('var(--corp-fin)')}>
                <span style={kpiTitleStyle}>Total Closing MC</span>
                <span style={kpiValueStyle}>{data.total_closing_mc || '0'}</span>
              </div>
            </div>

            {/* Tab Buttons */}
            <div style={tabsRowStyle}>
              {['facility_summary', 'batch_summary', 'transactions'].map(tab => (
                <button
                  key={tab}
                  style={activeTab === tab ? activeTabStyle : inactiveTabStyle}
                  onClick={() => {
                    setActiveTab(tab);
                    setSearchQuery('');
                  }}
                >
                  {tab.replace('_', ' ').toUpperCase()}
                </button>
              ))}
            </div>

            {/* Tab Contents */}
            <div style={{ marginTop: '16px' }} className="card">
              {renderStorageCostTable(activeTab)}
            </div>
          </div>
        )}
      </div>
    );
  }

  // 4. RENDER: STANDARD UNIFIED SPREADSHEET TABLE
  return (
    <div className="report-viewer-card">
      {renderHeader(activeConfig?.title || 'Report spreadsheet')}
      {renderStandardFilters()}

      {loading && renderLoader()}
      {error && renderError()}

      {!loading && !error && data && (
        <div style={{ marginTop: '16px' }} className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-secondary)' }}>
              Rows found: {filteredRows.length} {rows.length !== filteredRows.length && `(filtered from ${rows.length})`}
            </span>
            <div style={searchWrapperStyle}>
              <Search size={14} style={searchIconStyle} />
              <input
                type="text"
                placeholder="Search rows..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={searchInputStyle}
              />
            </div>
          </div>

          <div className="table-responsive">
            <table className="bknr-table">
              <thead>
                <tr>
                  {activeConfig?.columns.map((col, idx) => (
                    <th key={idx} className={col.align === 'right' ? 'text-right' : (col.align === 'center' ? 'text-center' : 'text-left')}>
                      {col.label}
                    </th>
                  ))}
                  {activeConfig?.canEdit && <th className="text-center">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredRows.length > 0 ? (
                  filteredRows.map((row, rowIdx) => {
                    const isEditing = editRowId === row.id;
                    return (
                      <tr key={rowIdx}>
                        {activeConfig?.columns.map((col, colIdx) => {
                          const alignment = col.align === 'right' ? 'text-right' : (col.align === 'center' ? 'text-center' : 'text-left');
                          const cellVal = row[col.key];

                          return (
                            <td key={colIdx} className={alignment} style={{ fontWeight: col.bold ? '700' : 'normal' }}>
                              {isEditing && col.editable ? (
                                <input
                                  type="text"
                                  className="form-control"
                                  style={{ height: '28px', padding: '2px 8px', fontSize: '12px', width: '100%', background: 'var(--bg-app)', color: 'var(--text-primary)' }}
                                  value={editData[col.key] || ''}
                                  onChange={(e) => setEditData({ ...editData, [col.key]: e.target.value })}
                                />
                              ) : (
                                formatVal(cellVal, col.format)
                              )}
                            </td>
                          );
                        })}

                        {activeConfig?.canEdit && (
                          <td className="text-center">
                            {isEditing ? (
                              <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                <button onClick={saveEdit} className="btn btn-secondary" style={{ padding: '4px 8px', height: '28px' }}>
                                  <Save size={12} />
                                </button>
                                <button onClick={() => setEditRowId(null)} className="btn btn-secondary" style={{ padding: '4px 8px', height: '28px', background: '#475569' }}>
                                  <X size={12} />
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                <button onClick={() => startEdit(row)} className="btn btn-secondary" style={{ padding: '4px 8px', height: '28px' }}>
                                  <Edit2 size={12} />
                                </button>
                                <button onClick={() => deleteRow(row.id)} className="btn btn-secondary" style={{ padding: '4px 8px', height: '28px', background: '#dc2626' }}>
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={activeConfig?.columns.length + (activeConfig?.canEdit ? 1 : 0)} className="text-center" style={{ padding: '40px', color: 'var(--text-tertiary)' }}>
                      No report records loaded. Select financial year or check filters above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );

  // RENDER HELPERS: HEADERS, LOADERS, ERRORS, FILTERS

  function renderHeader(title) {
    return (
      <div style={reportHeaderStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={iconBadgeStyle}>
            <FileText size={18} style={{ color: 'white' }} />
          </div>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)', margin: 0 }}>
              {title}
            </h2>
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0 }}>
              Natively rendering real-time operational registers from database framework
            </p>
          </div>
        </div>

        <div style={actionsRowStyle}>
          <button onClick={fetchData} className="btn btn-secondary" style={{ height: '36px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <RefreshCw size={13} className={loading ? 'spin' : ''} /> Refresh
          </button>
          <button onClick={handlePrint} className="btn btn-secondary" style={{ height: '36px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Printer size={13} /> Print
          </button>
          <button onClick={() => handleExport('excel')} className="btn btn-secondary" style={{ height: '36px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Download size={13} /> Export Excel
          </button>
        </div>
      </div>
    );
  }

  function renderLoader() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px' }}>
        <RefreshCw size={28} className="spin" style={{ color: 'var(--corp-rep)', marginBottom: '12px' }} />
        <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' }}>
          Fetching structured report data blocks from ledger endpoints...
        </span>
      </div>
    );
  }

  function renderError() {
    return (
      <div style={{ background: 'rgba(220, 38, 38, 0.1)', border: '1px solid rgba(220, 38, 38, 0.2)', padding: '16px', borderRadius: 'var(--radius-element)', color: '#f87171', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span>⚠️ ERROR: {error}</span>
        <button onClick={fetchData} className="btn btn-secondary" style={{ height: '28px', background: '#dc2626', color: 'white', padding: '0 12px' }}>
          Retry Fetch
        </button>
      </div>
    );
  }

  function renderStandardFilters() {
    return (
      <div style={filtersWrapperStyle}>
        {activeConfig?.filters.includes('fy') && (
          <div style={filterBoxStyle}>
            <label style={filterLabelStyle}>Financial Year</label>
            <select
              className="form-control"
              style={selectControlStyle}
              value={selectedFy}
              onChange={e => setSelectedFy(e.target.value)}
            >
              {data?.financial_years ? (
                data.financial_years.map(y => <option key={y} value={y}>{y}</option>)
              ) : (
                ['2026', '2025', '2024'].map(y => <option key={y} value={y}>{y}</option>)
              )}
            </select>
          </div>
        )}

        {activeConfig?.filters.includes('date_range') && (
          <>
            <div style={filterBoxStyle}>
              <label style={filterLabelStyle}>Start Date</label>
              <input
                type="date"
                className="form-control"
                style={selectControlStyle}
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
              />
            </div>
            <div style={filterBoxStyle}>
              <label style={filterLabelStyle}>End Date</label>
              <input
                type="date"
                className="form-control"
                style={selectControlStyle}
                value={toDate}
                onChange={e => setToDate(e.target.value)}
              />
            </div>
          </>
        )}
      </div>
    );
  }

  function renderStorageCostFilters() {
    return (
      <div style={filtersWrapperStyle}>
        <div style={filterBoxStyle}>
          <label style={filterLabelStyle}>Billing Month</label>
          <input
            type="month"
            className="form-control"
            style={selectControlStyle}
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
          />
        </div>
        <div style={filterBoxStyle}>
          <label style={filterLabelStyle}>Freezer Tunnel</label>
          <select
            className="form-control"
            style={selectControlStyle}
            value={freezer}
            onChange={e => setFreezer(e.target.value)}
          >
            <option value="">ALL FREEZERS</option>
            {data?.freezers?.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div style={filterBoxStyle}>
          <label style={filterLabelStyle}>Cold Storage Facility</label>
          <select
            className="form-control"
            style={selectControlStyle}
            value={coldStorageName}
            onChange={e => setColdStorageName(e.target.value)}
          >
            <option value="">ALL COLD STORAGES</option>
            {data?.cold_storage_names?.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
    );
  }

  function renderPeriodicFilters() {
    return (
      <div style={filtersWrapperStyle}>
        <div style={filterBoxStyle}>
          <label style={filterLabelStyle}>Filter Type</label>
          <select
            className="form-control"
            style={selectControlStyle}
            value={dateFilterType}
            onChange={e => setDateFilterType(e.target.value)}
          >
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="month">Select Month</option>
            <option value="between">Date Range</option>
          </select>
        </div>

        {dateFilterType === 'month' && (
          <div style={filterBoxStyle}>
            <label style={filterLabelStyle}>Month</label>
            <input
              type="month"
              className="form-control"
              style={selectControlStyle}
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
            />
          </div>
        )}

        {dateFilterType === 'between' && (
          <>
            <div style={filterBoxStyle}>
              <label style={filterLabelStyle}>From Date</label>
              <input
                type="date"
                className="form-control"
                style={selectControlStyle}
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
              />
            </div>
            <div style={filterBoxStyle}>
              <label style={filterLabelStyle}>To Date</label>
              <input
                type="date"
                className="form-control"
                style={selectControlStyle}
                value={toDate}
                onChange={e => setToDate(e.target.value)}
              />
            </div>
          </>
        )}

        <div style={filterBoxStyle}>
          <label style={filterLabelStyle}>Production Source</label>
          <select
            className="form-control"
            style={selectControlStyle}
            value={prodType}
            onChange={e => {
              setProdType(e.target.value);
              setSelectedBatch('');
            }}
          >
            <option value="RMP">RMP Purchased Batches</option>
            <option value="REPROCESS">Reprocess Batches</option>
          </select>
        </div>

        <div style={filterBoxStyle}>
          <label style={filterLabelStyle}>Select Batch No</label>
          <select
            className="form-control"
            style={selectControlStyle}
            value={selectedBatch}
            onChange={e => setSelectedBatch(e.target.value)}
          >
            <option value="">SELECT BATCH (ALL)</option>
            {data?.batches?.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
      </div>
    );
  }

  function renderBatchSummaryFilters() {
    return (
      <div style={filtersWrapperStyle}>
        <div style={filterBoxStyle}>
          <label style={filterLabelStyle}>Financial Year</label>
          <select
            className="form-control"
            style={selectControlStyle}
            value={selectedFy}
            onChange={e => setSelectedFy(e.target.value)}
          >
            {data?.financial_years ? (
              data.financial_years.map(y => <option key={y} value={y}>{y}</option>)
            ) : (
              ['2026', '2025', '2024'].map(y => <option key={y} value={y}>{y}</option>)
            )}
          </select>
        </div>

        <div style={filterBoxStyle}>
          <label style={filterLabelStyle}>Production Source</label>
          <select
            className="form-control"
            style={selectControlStyle}
            value={prodType}
            onChange={e => {
              setProdType(e.target.value);
              setSelectedBatch('');
            }}
          >
            <option value="RMP">RMP Purchased Batches</option>
            <option value="REPROCESS">Reprocess Batches</option>
          </select>
        </div>

        <div style={filterBoxStyle}>
          <label style={filterLabelStyle}>Target Batch No</label>
          <select
            className="form-control"
            style={selectControlStyle}
            value={selectedBatch}
            onChange={e => setSelectedBatch(e.target.value)}
          >
            <option value="">SELECT BATCH (REQUIRED)</option>
            {data?.batches?.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
      </div>
    );
  }

  // RENDER DYNAMIC TABLES FOR SUB-SECTIONS (BATCH SUMMARY, PERIODIC SUMMARY)

  function renderSummaryTabTable(tab) {
    if (!data || !data.rows) return null;
    const tabRows = data.rows[tab] || data[tab] || [];

    // Filter rows dynamically by search query
    const filteredTabRows = tabRows.filter(row => {
      if (!searchQuery) return true;
      return Object.values(row).some(val => 
        String(val || '').toLowerCase().includes(searchQuery.toLowerCase())
      );
    });

    // Custom table schemas per tab
    const schemas = {
      gate: {
        headers: ['Gate Pass', 'Date', 'Supplier', 'Vehicle', 'Boxes', 'Ice Boxes'],
        keys: ['gate_pass_number', 'date', 'supplier_name', 'vehicle_number', 'no_of_material_boxes', 'no_of_ice_boxes']
      },
      rmp: {
        headers: ['Species', 'Variety', 'Count', 'Purchased Qty (Kg)', 'Rate (₹)', 'Amount (₹)'],
        keys: ['species', 'variety_name', 'count', 'received_qty', 'rate', 'amount'],
        formats: { received_qty: 'number', rate: 'currency', amount: 'currency' }
      },
      deheading: {
        headers: ['Contractor', 'Species', 'Count', 'HOSO Qty', 'HLSO Qty', 'Yield %', 'Amount (₹)'],
        keys: ['contractor', 'species', 'hoso_count', 'hoso_qty', 'hlso_qty', 'yield_percent', 'amount'],
        formats: { hoso_qty: 'number', hlso_qty: 'number', yield_percent: 'percentage', amount: 'currency' }
      },
      grading_summary: {
        headers: ['Species', 'HOSO Count', 'Variety', 'Graded Qty (Kg)', 'Workout Count', 'Yield %'],
        keys: ['species', 'hoso_count', 'variety', 'graded_qty', 'workout_count', 'yield_pct'],
        formats: { graded_qty: 'number', yield_pct: 'percentage' }
      },
      peeling: {
        headers: ['Contractor', 'Species', 'Variety', 'HLSO Count', 'Peeled Qty', 'Yield %', 'Amount (₹)'],
        keys: ['contractor', 'species', 'variety', 'hlso_count', 'peeled_qty', 'yield_percent', 'amount'],
        formats: { peeled_qty: 'number', yield_percent: 'percentage', amount: 'currency' }
      },
      soaking: {
        headers: ['Production At', 'Variety', 'In Count', 'In Qty', 'Chemical', 'Out Qty', 'Gain %'],
        keys: ['production_at', 'variety_name', 'in_count', 'in_qty', 'chemical_name', 'out_qty', 'gain_percent'],
        formats: { in_qty: 'number', out_qty: 'number', gain_percent: 'percentage' }
      },
      production: {
        headers: ['Brand', 'Variety', 'Grade', 'Glaze', 'Freezer', 'MC Slabs', 'Loose', 'Net Weight (Kg)'],
        keys: ['brand_name', 'variety_name', 'grade', 'glaze', 'freezer', 'no_of_mc', 'loose', 'production_qty'],
        formats: { production_qty: 'number' }
      },
      stock: {
        headers: ['Location', 'Brand', 'Variety', 'Grade', 'MC Slabs', 'Quantity (Kg)'],
        keys: ['location', 'brand', 'variety', 'grade', 'no_of_mc', 'quantity'],
        formats: { quantity: 'number' }
      },
      hoso_floor_balance: {
        headers: ['WIP Location', 'Species', 'Variety', 'Count', 'WIP Qty (Kg)', 'Estimated Value (₹)'],
        keys: ['peeling_at', 'species', 'variety', 'count', 'available_qty', 'value'],
        formats: { available_qty: 'number', value: 'currency' }
      },
      opening_floor_balance: {
        headers: ['WIP Location', 'Species', 'Variety', 'Count', 'Opening Qty (Kg)', 'Opening Value (₹)'],
        keys: ['peeling_at', 'species', 'variety', 'count', 'available_qty', 'value'],
        formats: { available_qty: 'number', value: 'currency' }
      },
      closing_floor_balance: {
        headers: ['WIP Location', 'Species', 'Variety', 'Count', 'Closing Qty (Kg)', 'Closing Value (₹)'],
        keys: ['peeling_at', 'species', 'variety', 'count', 'available_qty', 'value'],
        formats: { available_qty: 'number', value: 'currency' }
      }
    };

    const schema = schemas[tab] || schemas.gate;

    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h4 style={{ fontSize: '13px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-primary)' }}>
            {tab.replace('_', ' ')} DETAILS
          </h4>
          <div style={searchWrapperStyle}>
            <Search size={13} style={searchIconStyle} />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={searchInputStyle}
            />
          </div>
        </div>

        <div className="table-responsive">
          <table className="bknr-table">
            <thead>
              <tr>
                {schema.headers.map((head, index) => (
                  <th key={index}>{head}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredTabRows.length > 0 ? (
                filteredTabRows.map((row, rIdx) => (
                  <tr key={rIdx}>
                    {schema.keys.map((k, cIdx) => {
                      const format = schema.formats?.[k];
                      return (
                        <td key={cIdx} className={format ? 'text-right' : 'text-left'}>
                          {formatVal(row[k], format)}
                        </td>
                      );
                    })}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={schema.headers.length} className="text-center" style={{ padding: '24px', color: 'var(--text-tertiary)' }}>
                    No record blocks registered for this stage.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // RENDER CUSTOM STORAGE & COST DETAILS
  function renderStorageCostTable(tab) {
    if (!data) return null;

    if (tab === 'facility_summary') {
      const rows = data.facility_summary || [];
      return (
        <div className="table-responsive">
          <table className="bknr-table">
            <thead>
              <tr>
                <th>Cold Storage Facility</th>
                <th>Client Group</th>
                <th>Opening MC</th>
                <th>Monthly IN MC</th>
                <th>Monthly OUT MC</th>
                <th>Closing MC</th>
                <th>Rent Cost</th>
                <th>Handling Charges</th>
                <th>Total Payable</th>
              </tr>
            </thead>
            <tbody>
              {rows.length > 0 ? (
                rows.map((fac, fIdx) => (
                  <React.Fragment key={fIdx}>
                    {/* Facility Header Row */}
                    <tr style={{ background: 'var(--row-hover)' }}>
                      <td style={{ fontWeight: '800', color: 'var(--corp-rep)' }}>{fac.cold_storage_name}</td>
                      <td>(Facility Total)</td>
                      <td className="text-right font-bold">{fac.opening_mc}</td>
                      <td className="text-right font-bold">{fac.monthly_in_mc}</td>
                      <td className="text-right font-bold">{fac.monthly_out_mc}</td>
                      <td className="text-right font-bold">{fac.closing_mc}</td>
                      <td className="text-right font-bold">{formatVal(fac.storage_rent, 'currency')}</td>
                      <td className="text-right font-bold">{formatVal(fac.other_charges, 'currency')}</td>
                      <td className="text-right font-bold" style={{ color: 'var(--corp-rep)' }}>{formatVal(fac.total_payable, 'currency')}</td>
                    </tr>
                    {/* Nested Client Rows */}
                    {fac.client_groups?.map((cli, cIdx) => (
                      <React.Fragment key={cIdx}>
                        {cli.location_groups?.map((loc, lIdx) => (
                          <tr key={`${cIdx}-${lIdx}`} style={{ fontSize: '12px' }}>
                            <td style={{ paddingLeft: '24px', color: 'var(--text-secondary)' }}>↳ {loc.production_at}</td>
                            <td>{cli.production_for}</td>
                            <td className="text-right">{loc.opening_mc}</td>
                            <td className="text-right">{loc.monthly_in_mc}</td>
                            <td className="text-right">{loc.monthly_out_mc}</td>
                            <td className="text-right">{loc.closing_mc}</td>
                            <td className="text-right">{formatVal(loc.storage_rent, 'currency')}</td>
                            <td className="text-right">{formatVal(loc.other_charges, 'currency')}</td>
                            <td className="text-right">{formatVal(loc.total_payable, 'currency')}</td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </React.Fragment>
                ))
              ) : (
                <tr>
                  <td colSpan="9" className="text-center" style={{ padding: '24px' }}>No facilities summary logged.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      );
    }

    if (tab === 'batch_summary') {
      const groups = data.production_for_groups || [];
      return (
        <div className="table-responsive">
          <table className="bknr-table">
            <thead>
              <tr>
                <th>Batch / Details</th>
                <th>Species / Variety</th>
                <th>Grade / Glaze</th>
                <th>Opening MC</th>
                <th>Inward MC / Kg</th>
                <th>Outward MC / Kg</th>
                <th>Closing MC</th>
                <th>Storage Rent</th>
                <th>Handling Charges</th>
                <th>Net Payable</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group, gIdx) => (
                <React.Fragment key={gIdx}>
                  {/* Group Client Header */}
                  <tr style={{ background: 'var(--row-hover)' }}>
                    <td colSpan="3" style={{ fontWeight: '800', color: 'var(--corp-ops)' }}>
                      CLIENT: {group.production_for}
                    </td>
                    <td className="text-right font-bold">{group.opening_mc}</td>
                    <td className="text-right font-bold">{group.monthly_in_mc} MC / {group.monthly_in_kg?.toFixed(2)} Kg</td>
                    <td className="text-right font-bold">{group.monthly_out_mc} MC / {group.monthly_out_kg?.toFixed(2)} Kg</td>
                    <td className="text-right font-bold">{group.closing_mc}</td>
                    <td className="text-right font-bold">{formatVal(group.storage_rent, 'currency')}</td>
                    <td className="text-right font-bold">{formatVal(group.other_charges, 'currency')}</td>
                    <td className="text-right font-bold">{formatVal(group.total_payable, 'currency')}</td>
                  </tr>
                  {/* Location Groups */}
                  {group.location_groups?.map((loc, lIdx) => (
                    <React.Fragment key={lIdx}>
                      <tr style={{ background: 'rgba(255,255,255,0.01)' }}>
                        <td colSpan="3" style={{ paddingLeft: '20px', fontWeight: '700', color: 'var(--text-secondary)' }}>
                          ↳ PLANT LOCATION: {loc.production_at}
                        </td>
                        <td className="text-right font-bold">{loc.opening_mc}</td>
                        <td className="text-right font-bold">{loc.monthly_in_mc} MC</td>
                        <td className="text-right font-bold">{loc.monthly_out_mc} MC</td>
                        <td className="text-right font-bold">{loc.closing_mc}</td>
                        <td className="text-right font-bold">{formatVal(loc.storage_rent, 'currency')}</td>
                        <td className="text-right font-bold">{formatVal(loc.other_charges, 'currency')}</td>
                        <td className="text-right font-bold">{formatVal(loc.total_payable, 'currency')}</td>
                      </tr>
                      {/* Individual Batches */}
                      {loc.batches?.map((b, bIdx) => (
                        <tr key={bIdx} style={{ fontSize: '11px' }}>
                          <td style={{ paddingLeft: '40px' }} className="font-bold">{b.batch_number} <br/><span style={{ fontSize: '9px', color: 'var(--text-tertiary)' }}>{b.cold_storage_name}</span></td>
                          <td>{b.species} / {b.variety}</td>
                          <td>{b.grade} / {b.glaze}</td>
                          <td className="text-right">{b.opening_mc}</td>
                          <td className="text-right">{b.monthly_in_mc} MC / {b.monthly_in_kg?.toFixed(1)} Kg</td>
                          <td className="text-right">{b.monthly_out_mc} MC / {b.monthly_out_kg?.toFixed(1)} Kg</td>
                          <td className="text-right">{b.closing_mc}</td>
                          <td className="text-right">{formatVal(b.storage_rent, 'currency')}</td>
                          <td className="text-right">{formatVal(b.other_charges, 'currency')}</td>
                          <td className="text-right font-bold" style={{ color: 'var(--text-primary)' }}>{formatVal(b.total_payable, 'currency')}</td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (tab === 'transactions') {
      const rows = data.transactions || [];
      const filteredTxRows = rows.filter(r => 
        !searchQuery || 
        Object.values(r).some(val => String(val || '').toLowerCase().includes(searchQuery.toLowerCase()))
      );

      return (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
            <div style={searchWrapperStyle}>
              <Search size={13} style={searchIconStyle} />
              <input
                type="text"
                placeholder="Search ledger..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={searchInputStyle}
              />
            </div>
          </div>
          <div className="table-responsive">
            <table className="bknr-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Date</th>
                  <th>Batch No</th>
                  <th>Variety / Grade</th>
                  <th>Facility</th>
                  <th>Type</th>
                  <th>MC / Qty (Kg)</th>
                  <th>Running Bal</th>
                  <th>Rent Rate</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {filteredTxRows.map((tx, idx) => (
                  <tr key={idx}>
                    <td>{tx.production_for}</td>
                    <td className="text-center">{tx.date}</td>
                    <td className="text-center font-bold">{tx.batch_number}</td>
                    <td>{tx.variety} / {tx.grade}</td>
                    <td>{tx.cold_storage_name}</td>
                    <td className="text-center" style={{ color: tx.type === 'IN' ? 'var(--corp-fin)' : 'var(--corp-ops)', fontWeight: '700' }}>
                      {tx.type}
                    </td>
                    <td className="text-right">{tx.mc} MC / {tx.qty_kg?.toFixed(1)} Kg</td>
                    <td className="text-right font-bold">{tx.running_balance} MC</td>
                    <td className="text-right">₹ {tx.rate?.toFixed(2)}</td>
                    <td style={{ fontStyle: 'italic', fontSize: '10px' }}>{tx.remarks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }
  }
}

// PREMIUM INLINE STYLES FOR SLEEK DARK/LIGHT COMPATIBILITY

const reportHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '20px',
  flexWrap: 'wrap',
  gap: '16px',
  paddingBottom: '16px',
  borderBottom: '1px solid var(--border-light)'
};

const actionsRowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  flexWrap: 'wrap'
};

const filtersWrapperStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '14px',
  background: 'var(--glass-bg)',
  padding: '12px 16px',
  borderRadius: 'var(--radius-panel)',
  border: '1px solid var(--border-light)',
  marginBottom: '16px',
  alignItems: 'flex-end'
};

const filterBoxStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  flexShrink: 0,
  minWidth: '150px'
};

const filterLabelStyle = {
  fontSize: '10px',
  fontWeight: '800',
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px'
};

const selectControlStyle = {
  height: '36px',
  padding: '0 12px',
  fontSize: '13px',
  fontWeight: '600',
  borderRadius: 'var(--radius-element)',
  border: '1px solid var(--input-border)',
  background: 'var(--input-bg)',
  color: 'var(--text-primary)',
  outline: 'none',
  width: '100%'
};

const searchWrapperStyle = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center'
};

const searchIconStyle = {
  position: 'absolute',
  left: '12px',
  color: 'var(--text-tertiary)'
};

const searchInputStyle = {
  padding: '8px 12px 8px 36px',
  fontSize: '13px',
  border: '1px solid var(--input-border)',
  borderRadius: 'var(--radius-element)',
  background: 'var(--input-bg)',
  color: 'var(--text-primary)',
  outline: 'none',
  width: '200px',
  height: '36px'
};

const kpiGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '14px',
  marginBottom: '16px'
};

const kpiCardStyle = (accentColor) => ({
  background: 'var(--surface-panel)',
  border: `1px solid var(--border-light)`,
  borderLeft: `4px solid ${accentColor}`,
  padding: '14px 16px',
  borderRadius: 'var(--radius-element)',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  boxShadow: 'var(--shadow-soft)'
});

const kpiTitleStyle = {
  fontSize: '10px',
  fontWeight: '800',
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px'
};

const kpiValueStyle = {
  fontSize: '15px',
  fontWeight: '800',
  color: 'var(--text-primary)'
};

const tabsRowStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px',
  borderBottom: '1px solid var(--border-light)',
  paddingBottom: '8px',
  marginBottom: '14px'
};

const activeTabStyle = {
  background: 'var(--corp-rep)',
  color: 'white',
  border: 'none',
  padding: '8px 16px',
  fontSize: '11px',
  fontWeight: '800',
  borderRadius: '4px',
  cursor: 'pointer',
  transition: 'all 0.2s ease'
};

const inactiveTabStyle = {
  background: 'var(--input-bg)',
  color: 'var(--text-secondary)',
  border: '1px solid var(--input-border)',
  padding: '8px 16px',
  fontSize: '11px',
  fontWeight: '700',
  borderRadius: '4px',
  cursor: 'pointer',
  transition: 'all 0.2s ease'
};

const iconBadgeStyle = {
  width: '36px',
  height: '36px',
  borderRadius: '8px',
  background: 'var(--corp-rep)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
};
