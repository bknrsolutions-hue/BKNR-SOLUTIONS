import React from 'react';
import MasterBase from './MasterBase';

export default function Glazes(props) {
  return (
    <MasterBase
      {...props}
      title="Glazes Master"
      modelName="glazes"
      fields={[
        { id: 'glaze_name', label: 'Glaze Percent / Name', type: 'text', required: true }
      ]}
      columns={[
        { key: 'id', label: 'ID' },
        { key: 'glaze_name', label: 'Glaze Percent / Name' },
        { key: 'date', label: 'Date' },
        { key: 'time', label: 'Time' },
        { key: 'email', label: 'Authorized Node' }
      ]}
    />
  );
}
