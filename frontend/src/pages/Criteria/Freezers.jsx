import React from 'react';
import MasterBase from './MasterBase';

export default function Freezers(props) {
  return (
    <MasterBase
      {...props}
      title="Freezers Master"
      modelName="freezers"
      fields={[
        { id: 'freezer_name', label: 'Freezer Name', type: 'text', required: true },
        { id: 'capacity', label: 'Capacity', type: 'text' },
        { id: 'location', label: 'Location', type: 'text' }
      ]}
      columns={[
        { key: 'id', label: 'ID' },
        { key: 'freezer_name', label: 'Freezer Name' },
        { key: 'capacity', label: 'Capacity' },
        { key: 'location', label: 'Location' }
      ]}
    />
  );
}
