import React from 'react';
import MasterBase from './MasterBase';

export default function HosoHlso(props) {
  return (
    <MasterBase
      {...props}
      title="HOSO & HLSO Yields Master"
      modelName="hoso_hlso"
      fields={[
        { id: 'species', label: 'Species', type: 'select', lookupModel: 'species', required: true },
        { id: 'hoso_count', label: 'HOSO Count', type: 'number', required: true },
        { id: 'hlso_yield_pct', label: 'HLSO Yield %', type: 'number', step: '0.01', required: true },
        { id: 'hlso_count', label: 'HLSO Count', type: 'number', required: true }
      ]}
      columns={[
        { key: 'id', label: 'ID' },
        { key: 'species', label: 'Species' },
        { key: 'hoso_count', label: 'HOSO Count' },
        { key: 'hlso_yield_pct', label: 'HLSO Yield %' },
        { key: 'hlso_count', label: 'HLSO Count' }
      ]}
    />
  );
}
