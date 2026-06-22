import React from 'react';
import MasterBase from './MasterBase';

export default function VehicleNumbers(props) {
  return (
    <MasterBase
      {...props}
      title="Vehicle Numbers Master"
      modelName="vehicle_numbers"
      fields={[
        { id: 'vehicle_number', label: 'Vehicle Number', type: 'text', required: true }
      ]}
      columns={[
        { key: 'id', label: 'ID' },
        { key: 'vehicle_number', label: 'Vehicle Number' },
        { key: 'date', label: 'Date' },
        { key: 'time', label: 'Time' },
        { key: 'email', label: 'Authorized Node' }
      ]}
    />
  );
}
