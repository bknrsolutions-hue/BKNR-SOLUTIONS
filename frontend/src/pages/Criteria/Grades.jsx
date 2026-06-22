import React from 'react';
import MasterBase from './MasterBase';

export default function Grades(props) {
  return (
    <MasterBase
      {...props}
      title="Grades Master"
      modelName="grades"
      fields={[
        { id: 'grade_name', label: 'Grade Name', type: 'text', required: true }
      ]}
      columns={[
        { key: 'id', label: 'ID' },
        { key: 'grade_name', label: 'Grade Name' },
        { key: 'date', label: 'Date' },
        { key: 'time', label: 'Time' },
        { key: 'email', label: 'Authorized Node' }
      ]}
    />
  );
}
