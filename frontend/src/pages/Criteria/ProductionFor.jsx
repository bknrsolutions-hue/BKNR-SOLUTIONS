import React from 'react';
import MasterBase from './MasterBase';

export default function ProductionFor(props) {
  return (
    <MasterBase
      {...props}
      title="Production For Master"
      modelName="production_for"
      fields={[
        { id: 'production_for', label: 'Production For Entity (Buyer/Brand)', type: 'text', required: true },
        { id: 'apply_from', label: 'Apply From', type: 'date', required: true },
        { id: 'free_days', label: 'Free Days', type: 'number', required: true },
        { id: 'freezer_name', label: 'Freezer Name', type: 'select', lookupModel: 'freezers' },
        { id: 'glaze_percent', label: 'Glaze Percent', type: 'select', lookupModel: 'glazes' },
        { id: 'production_cost_per_kg', label: 'Production Cost/Kg', type: 'number', step: '0.01', required: true },
        { id: 'repacking_cost_per_kg', label: 'Repacking Cost/Kg', type: 'number', step: '0.01', required: true },
        { id: 'rate_per_mc_day', label: 'Rate/MC Day', type: 'number', step: '0.01', required: true },
        { id: 'ice_rate_per_kg', label: 'Ice Rate/Kg', type: 'number', step: '0.01', required: true },
        { id: 'grading_rate_per_kg', label: 'Grading Rate/Kg', type: 'number', step: '0.01', required: true },
        { id: 'peeling_rate_per_kg', label: 'Peeling Rate/Kg', type: 'number', step: '0.01', required: true },
        { id: 'deheading_rate_per_kg', label: 'De-Heading Rate/Kg', type: 'number', step: '0.01', required: true },
        { id: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive'], required: true }
      ]}
      columns={[
        { key: 'id', label: 'ID' },
        { key: 'production_for', label: 'Production For' },
        { key: 'apply_from', label: 'Apply From' },
        { key: 'freezer_name', label: 'Freezer' },
        { key: 'glaze_percent', label: 'Glaze %' },
        { key: 'production_cost_per_kg', label: 'Prod Cost' },
        { key: 'status', label: 'Status' }
      ]}
    />
  );
}
