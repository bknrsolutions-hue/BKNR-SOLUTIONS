import React from 'react';
import MasterBase from './MasterBase';

export default function ColdstoreLocations(props) {
  return (
    <MasterBase
      {...props}
      title="Coldstore Locations"
      modelName="coldstore_locations"
      fields={[
        { id: 'coldstore_location', label: 'Coldstore Location/Chamber', type: 'text', required: true },
        { id: 'production_at', label: 'Production Facility Location', type: 'select', lookupModel: 'production_at', required: true },
        { id: 'production_for', label: 'Production For Entity (Buyer/Brand)', type: 'select', lookupModel: 'production_for', required: true }
      ]}
      columns={[
        { key: 'id', label: 'ID' },
        { key: 'coldstore_location', label: 'Chamber Location' },
        { key: 'production_at', label: 'Facility' },
        { key: 'production_for', label: 'Buyer/Brand' }
      ]}
    />
  );
}
