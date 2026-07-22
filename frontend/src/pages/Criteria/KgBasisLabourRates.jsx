import React from 'react';
import MasterBase from './MasterBase';

export default function KgBasisLabourRates(props) {
  return <MasterBase
    {...props}
    title="KG Basis Worker Rates Master"
    modelName="kg_basis_labour_rates"
    fields={[
      { id: 'species', label: 'Species', type: 'select', lookupModel: 'species', required: false },
      { id: 'variety_name', label: 'Variety', type: 'select', lookupModel: 'varieties', required: true },
      { id: 'work_type', label: 'Work Type', type: 'text', required: true, placeholder: 'e.g. Peeling' },
      { id: 'count_grade', label: 'Count / Grade', type: 'text', required: false },
      { id: 'rate', label: 'Rate Per KG (₹)', type: 'number', step: '0.01', required: true },
      { id: 'effective_from', label: 'Apply From', type: 'date', required: true },
      { id: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive'], required: true },
    ]}
    columns={[
      { key: 'id', label: 'ID' }, { key: 'species', label: 'Species' }, { key: 'variety_name', label: 'Variety' },
      { key: 'work_type', label: 'Work Type' }, { key: 'count_grade', label: 'Count / Grade' },
      { key: 'rate', label: 'Rate / KG' }, { key: 'effective_from', label: 'Apply From' }, { key: 'status', label: 'Status' },
    ]}
  />;
}
