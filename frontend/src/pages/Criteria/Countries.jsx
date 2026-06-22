import React from 'react';
import MasterBase from './MasterBase';

export default function Countries(props) {
  return (
    <MasterBase
      {...props}
      title="Countries Master"
      modelName="countries"
      fields={[
        { id: 'country_name', label: 'Country Name', type: 'text', required: true },
        { id: 'production_cost_per_kg', label: 'Production Cost/Kg', type: 'text' }
      ]}
      columns={[
        { key: 'id', label: 'ID' },
        { key: 'country_name', label: 'Country Name' },
        { key: 'production_cost_per_kg', label: 'Production Cost/Kg' },
        { key: 'date', label: 'Date' },
        { key: 'time', label: 'Time' },
        { key: 'email', label: 'Authorized Node' }
      ]}
    />
  );
}
