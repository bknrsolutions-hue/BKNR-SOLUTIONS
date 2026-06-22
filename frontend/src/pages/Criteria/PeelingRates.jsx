import React from 'react';
import MasterBase from './MasterBase';

export default function PeelingRates(props) {
  return (
    <MasterBase
      {...props}
      title="Peeling Rates Master"
      modelName="peeling_rates"
      fields={[
        { id: 'species', label: 'Species', type: 'select', lookupModel: 'species', required: true },
        { id: 'variety_name', label: 'Variety Name', type: 'select', lookupModel: 'varieties', required: true },
        { id: 'contractor_name', label: 'Contractor Client', type: 'select', lookupModel: 'contractors', required: true },
        { id: 'hlso_count', label: 'HLSO Count Metric', type: 'text', required: true, placeholder: 'e.g. 10/20' },
        { id: 'rate', label: 'Standard Rate (₹)', type: 'number', step: '0.01', required: true },
        { id: 'effective_from', label: 'Effective Date', type: 'date', required: true }
      ]}
      columns={[
        { key: 'id', label: 'ID' },
        { key: 'species', label: 'Species' },
        { key: 'variety_name', label: 'Variety' },
        { key: 'contractor_name', label: 'Contractor' },
        { key: 'hlso_count', label: 'HLSO Count' },
        { key: 'rate', label: 'Standard Rate' },
        { key: 'effective_from', label: 'Effective From' }
      ]}
    />
  );
}
