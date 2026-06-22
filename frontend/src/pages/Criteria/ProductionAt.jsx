import React from 'react';
import MasterBase from './MasterBase';

export default function ProductionAt(props) {
  return (
    <MasterBase
      {...props}
      title="Production At Master"
      modelName="production_at"
      fields={[
        { id: 'production_at', label: 'Production Facility Location', type: 'text', required: true },
        { id: 'meter_number', label: 'Meter Number', type: 'text' },
        { id: 'unit_rate', label: 'Electricity Unit Rate (₹)', type: 'number', step: '0.01' }
      ]}
      columns={[
        { key: 'id', label: 'ID' },
        { key: 'production_at', label: 'Facility Location' },
        { key: 'meter_number', label: 'Meter Number' },
        { key: 'unit_rate', label: 'Unit Rate (₹)' }
      ]}
    />
  );
}
