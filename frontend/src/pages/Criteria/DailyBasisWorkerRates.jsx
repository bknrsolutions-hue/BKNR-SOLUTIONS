import React from 'react';
import MasterBase from './MasterBase';

export default function DailyBasisWorkerRates(props) {
  return (
    <MasterBase
      {...props}
      title="Day Basis Workers Salary Register"
      modelName="daily_basis_worker_rates"
      fields={[
        {
          id: 'worker_type',
          label: 'Worker Type',
          type: 'select',
          options: ['Fresher', 'Medium Experience', 'Experienced'],
          required: true,
        },
        {
          id: 'daily_salary',
          label: 'Daily Salary Rate (₹)',
          type: 'number',
          step: '0.01',
          required: true,
          placeholder: 'e.g. 500',
        },
        {
          id: 'applicable_from',
          label: 'Applicable From',
          type: 'date',
          required: true,
        },
        {
          id: 'status',
          label: 'Status',
          type: 'select',
          options: ['Active', 'Inactive'],
          required: true,
        },
      ]}
      columns={[
        { key: 'id', label: 'ID' },
        { key: 'worker_type', label: 'Worker Type' },
        { key: 'daily_salary', label: 'Daily Salary Rate (₹)' },
        { key: 'applicable_from', label: 'Applicable From' },
        { key: 'status', label: 'Status' },
        { key: 'date', label: 'Meta Date' },
        { key: 'time', label: 'Meta Time' },
        { key: 'email', label: 'Meta User' },
      ]}
    />
  );
}
