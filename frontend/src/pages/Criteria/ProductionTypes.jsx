import React from 'react';
import MasterBase from './MasterBase';

export default function ProductionTypes(props) {
  return (
    <MasterBase
      {...props}
      title="Production Types Master"
      modelName="production_types"
      fields={[
        { id: 'production_type', label: 'Production Type', type: 'text', required: true, placeholder: 'e.g. HOSO / HLSO' },
        { id: 'glaze_name', label: 'Glaze Name', type: 'select', lookupModel: 'glazes', required: true },
        { id: 'freezer_name', label: 'Freezer Name', type: 'select', lookupModel: 'freezers', required: true },
        { id: 'production_charge_per_kg', label: 'Production Charge (Per Kg)', type: 'number', step: '0.01', required: true, placeholder: '0.00' }
      ]}
      columns={[
        { key: 'id', label: 'ID' },
        { key: 'production_type', label: 'Production Type' },
        { key: 'glaze_name', label: 'Glaze Matrix Code' },
        { key: 'freezer_name', label: 'Freezer Unit Matrix' },
        { key: 'production_charge_per_kg', label: 'Production Charge / Kg' },
        { key: 'date', label: 'Log Date' },
        { key: 'time', label: 'Log Time' },
        { key: 'email', label: 'Email Account' },
        { key: 'company_id', label: 'Company ID' }
      ]}
    />
  );
}
