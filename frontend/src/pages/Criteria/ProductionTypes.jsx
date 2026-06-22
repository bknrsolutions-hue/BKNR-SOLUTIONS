import React from 'react';
import MasterBase from './MasterBase';

export default function ProductionTypes(props) {
  return (
    <MasterBase
      {...props}
      title="Production Types"
      modelName="production_types"
      fields={[
        { id: 'production_type', label: 'Production Type', type: 'text', required: true },
        { id: 'glaze_name', label: 'Glaze Percent', type: 'select', lookupModel: 'glazes' },
        { id: 'freezer_name', label: 'Freezer Name', type: 'select', lookupModel: 'freezers' },
        { id: 'production_charge_per_kg', label: 'Production Charge/Kg (₹)', type: 'number', step: '0.01' }
      ]}
      columns={[
        { key: 'id', label: 'ID' },
        { key: 'production_type', label: 'Production Type' },
        { key: 'glaze_name', label: 'Glaze Percent' },
        { key: 'freezer_name', label: 'Freezer Name' },
        { key: 'production_charge_per_kg', label: 'Production Charge/Kg' }
      ]}
    />
  );
}
