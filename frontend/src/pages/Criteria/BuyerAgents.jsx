import React from 'react';
import MasterBase from './MasterBase';

export default function BuyerAgents(props) {
  return (
    <MasterBase
      {...props}
      title="Buyer Agents Master"
      modelName="buyer_agents"
      fields={[
        { id: 'agent_name', label: 'Agent Name', type: 'text', required: true },
        { id: 'agent_email', label: 'Agent Email', type: 'email' },
        { id: 'phone', label: 'Phone Number', type: 'text' },
        { id: 'service_for', label: 'Service For', type: 'select', options: ['Buyer Agent', 'Commission Agent', 'Broker', 'Local Representative'], required: true },
        { id: 'gst_number', label: 'GST Number', type: 'text' },
        { id: 'bank_name', label: 'Bank Name', type: 'text' },
        { id: 'account_no', label: 'Account Number', type: 'text' },
        { id: 'ifsc', label: 'IFSC Code', type: 'text' },
        { id: 'address', label: 'Address', type: 'textarea', gridSpan: 4 }
      ]}
      columns={[
        { key: 'id', label: 'ID' },
        { key: 'agent_name', label: 'Agent Name' },
        { key: 'agent_email', label: 'Agent Email' },
        { key: 'phone', label: 'Phone' },
        { key: 'service_for', label: 'Service For' },
        { key: 'gst_number', label: 'GST' },
        { key: 'bank_name', label: 'Bank' },
        { key: 'account_no', label: 'Account No' },
        { key: 'ifsc', label: 'IFSC' }
      ]}
    />
  );
}
