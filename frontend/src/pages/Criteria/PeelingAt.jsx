import React from 'react';
import MasterBase from './MasterBase';

export default function PeelingAt(props) {
  return (
    <MasterBase
      {...props}
      title="Peeling At Master"
      modelName="peeling_at"
      fields={[
        { id: 'peeling_at', label: 'Peeling Center Location', type: 'text', required: true }
      ]}
      columns={[
        { key: 'id', label: 'ID' },
        { key: 'peeling_at', label: 'Peeling Center Location' },
        { key: 'date', label: 'Date' },
        { key: 'time', label: 'Time' },
        { key: 'email', label: 'User Email' }
      ]}
    />
  );
}
