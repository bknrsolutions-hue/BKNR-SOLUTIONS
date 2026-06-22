import React from 'react';
import MasterBase from './MasterBase';

export default function Purposes(props) {
  return (
    <MasterBase
      {...props}
      title="Purposes Master"
      modelName="purposes"
      fields={[
        { id: 'purpose_name', label: 'Purpose Name', type: 'text', required: true }
      ]}
      columns={[
        { key: 'id', label: 'ID' },
        { key: 'purpose_name', label: 'Purpose Name' },
        { key: 'date', label: 'Date' },
        { key: 'time', label: 'Time' },
        { key: 'email', label: 'Authorized Node' }
      ]}
    />
  );
}
