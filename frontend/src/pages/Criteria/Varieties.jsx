import React from 'react';
import MasterBase from './MasterBase';

export default function Varieties(props) {
  return (
    <MasterBase
      {...props}
      title="Varieties Master"
      modelName="varieties"
      fields={[
        { id: 'variety_name', label: 'Variety Name', type: 'text', required: true },
        { id: 'peeling_yield', label: 'Peeling Yield %', type: 'text' },
        { id: 'soaking_yield', label: 'Soaking Yield %', type: 'text' },
        { id: 'hoso_to_finished_yield', label: 'HOSO to Finished Yield %', type: 'text' }
      ]}
      columns={[
        { key: 'id', label: 'ID' },
        { key: 'variety_name', label: 'Variety Name' },
        { key: 'peeling_yield', label: 'Peeling Yield' },
        { key: 'soaking_yield', label: 'Soaking Yield' },
        { key: 'hoso_to_finished_yield', label: 'HOSO/Finished Yield' }
      ]}
    />
  );
}
