import React from 'react';
import MasterBase from './MasterBase';

export default function PackingStyles(props) {
  return (
    <MasterBase
      {...props}
      title="Packing Styles"
      modelName="packing_styles"
      fields={[
        { id: 'packing_style', label: 'Packing Style (e.g. 10x2kg)', type: 'text', required: true },
        { id: 'mc_weight', label: 'MC Weight (Kg)', type: 'number', step: '0.01', required: true },
        { id: 'slab_weight', label: 'Slab Weight (Kg)', type: 'number', step: '0.01', required: true }
      ]}
      columns={[
        { key: 'id', label: 'ID' },
        { key: 'packing_style', label: 'Packing Style' },
        { key: 'mc_weight', label: 'MC Weight (Kg)' },
        { key: 'slab_weight', label: 'Slab Weight (Kg)' }
      ]}
    />
  );
}
