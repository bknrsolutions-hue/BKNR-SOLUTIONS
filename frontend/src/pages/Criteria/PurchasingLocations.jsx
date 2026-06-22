import React from 'react';
import MasterBase from './MasterBase';

export default function PurchasingLocations(props) {
  return (
    <MasterBase
      {...props}
      title="Purchasing Locations"
      modelName="purchasing_locations"
      fields={[
        { id: 'location_name', label: 'Location Name', type: 'text', required: true }
      ]}
      columns={[
        { key: 'id', label: 'ID' },
        { key: 'location_name', label: 'Location Name' },
        { key: 'date', label: 'Date' },
        { key: 'time', label: 'Time' },
        { key: 'email', label: 'Authorized Node' }
      ]}
    />
  );
}
